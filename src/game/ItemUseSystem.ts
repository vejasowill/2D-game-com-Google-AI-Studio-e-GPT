import { Camera } from './Camera.ts';
import { TILE_SIZE } from './constants.ts';
import { InputSource, TileCoord, ViewportSize, WorldBounds, WorldCoord } from './types.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { SpatialGeometry } from './SpatialGeometry.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { ToolDefinition } from './ToolDefinition.ts';
import {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolTarget,
  isToolTarget,
} from './ToolTarget.ts';
import { TileToolTarget } from './TileToolTarget.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import {
  ItemActionTarget,
  ItemUseContext,
  ItemUseResult,
  getObjectActionWorldBounds,
  isItemActionTarget,
} from './ItemUseTypes.ts';

export type CompatibleActionTarget = ToolTarget | (WorldObject & ItemActionTarget);
type CompatibleObjectTarget = WorldObject & (ItemActionTarget | ToolTarget);

interface ActionCandidateEvaluation {
  readonly obj: CompatibleObjectTarget;
  readonly bounds: WorldBounds;
  readonly boxDistance: number;
  readonly distToFront: number;
}

/** Rótulos de exibição declarativos amigáveis para ações comuns */
const ACTION_LABELS: Record<string, string> = {
  chop: 'Cortar',
  mine: 'Minerar',
  dig: 'Cavar',
  till: 'Arar',
  water: 'Regar',
};

/**
 * Sistema genérico, declarativo e desacoplado responsável pelo uso de itens e ferramentas.
 *
 * Princípios arquiteturais:
 * 1. O sistema NUNCA inspeciona `itemId === 'axe'` nem `target.type === 'tree'` (zero acoplamento concreto);
 * 2. Ferramentas declaram suas capacidades através de ToolDefinition registradas no ToolRegistry;
 * 3. Itens genéricos utilizam ItemUseDefinition no ItemDefinition para máxima flexibilidade;
 * 4. Alvos no mundo declaram sua aceitação de ações através das abstrações ToolTarget e ItemActionTarget;
 * 5. Aplicações de consequências no mundo passam estritamente pelo WorldMutationHandler;
 * 6. Sistema de alcance puramente geométrico (hitbox física, orientação direcional do jogador);
 * 7. Suporte completo a cooldown determinístico e testável sem temporizadores reais;
 * 8. 100% determinístico (sem Math.random), compatível com coordenadas negativas e streaming de chunks;
 * 9. Nunca materializa chunks indevidamente e nunca realiza varredura global O(N).
 */
export class ItemUseSystem {
  public defaultRange: number;
  public defaultCooldown: number;

  /** Referência desacoplada ao subsistema de seleção de tiles para ferramentas de terreno */
  private tileSelectionSystem: TileSelectionSystem | null = null;

  /** Temporizador de cooldown ativo em segundos */
  private cooldownTimer: number = 0;

  /** Temporizador de bloqueio transitório de movimento do jogador durante a execução */
  private movementBlockTimer: number = 0;

  /** Último resultado de ação executado */
  private lastResult: ItemUseResult | null = null;

  /** Alvo selecionado mais recentemente */
  private lastTarget: CompatibleActionTarget | null = null;

  /** Alvo selecionável ativo no frame atual à frente do jogador */
  private currentTarget: CompatibleActionTarget | null = null;

  /** Mensagem transitória de feedback técnico */
  private activeFeedbackMessage: string | null = null;
  private feedbackTimer: number = 0;

  /** Ouvinte desacoplado opcional para eventos de uso de item */
  public onItemUse?: (
    result: ItemUseResult,
    target?: CompatibleActionTarget | null,
  ) => void;

  constructor(defaultRange: number = 36, defaultCooldown: number = 0.4) {
    this.defaultRange = defaultRange;
    this.defaultCooldown = defaultCooldown;
    ToolRegistry.ensureInitialized();
  }

  /**
   * Retorna o tempo restante de cooldown em segundos.
   */
  public getRemainingCooldown(): number {
    return this.cooldownTimer;
  }

  /**
   * Ajusta diretamente o temporizador de cooldown (essencial para testes determinísticos sem espera real).
   */
  public setCooldown(seconds: number): void {
    this.cooldownTimer = Math.max(0, seconds);
  }

  /**
   * Zera imediatamente o cooldown.
   */
  public resetCooldown(): void {
    this.cooldownTimer = 0;
  }

  /**
   * Verifica se o jogador está momentaneamente com movimento bloqueado pela ação do item.
   */
  public isMovementBlocked(): boolean {
    return this.movementBlockTimer > 0;
  }

  /**
   * Retorna o último resultado de uso de item produzido.
   */
  public getLastResult(): ItemUseResult | null {
    return this.lastResult;
  }

  /**
   * Retorna o último alvo atingido.
   */
  public getLastTarget(): CompatibleActionTarget | null {
    return this.lastTarget;
  }

  /**
   * Verifica se o Player possui uma ferramenta ou item utilizável equipado e pronto para uso (sem cooldown ativo).
   */
  public canUseItem(player: Player): boolean {
    if (this.cooldownTimer > 0) {
      return false;
    }

    const equipped = player.getEquippedItem();
    if (!equipped) {
      return false;
    }

    // 1. Consulta prioritária na fundação de ferramentas (ToolRegistry)
    const toolDef = ToolRegistry.getByItemId(equipped.itemId);
    if (toolDef) {
      return true;
    }

    // 2. Consulta secundária no registro de itens geral (ItemRegistry)
    const itemDef = ItemRegistry.get(equipped.itemId);
    if (itemDef?.useDefinition) {
      return true;
    }

    return false;
  }

  /**
   * Configura o sistema desacoplado de seleção de células de terreno.
   */
  public setTileSelectionSystem(system: TileSelectionSystem | null): void {
    this.tileSelectionSystem = system;
  }

  /**
   * Retorna o sistema atual de seleção de tiles, ou null se não configurado.
   */
  public getTileSelectionSystem(): TileSelectionSystem | null {
    return this.tileSelectionSystem;
  }

  /**
   * Localiza deterministicamente a célula de terreno alvo válida à frente do jogador para ferramentas de terreno.
   *
   * Ordem de resolução:
   * 1. Célula de terreno explicitamente selecionada (via toque mobile ou clique do mouse);
   * 2. Caso não haja seleção explícita, seleciona a célula imediatamente adjacente à frente do jogador;
   * 3. Validação rigorosa:
   *    - Coordenadas válidas no mundo;
   *    - Setor frontal direcional do jogador (rejeita estritamente o setor traseiro/costas);
   *    - Distância física AABB dentro do alcance da ferramenta;
   *    - Compatibilidade do terreno com a ação declarativa através do SoilRegistry.
   */
  public findBestTileTarget(
    player: Player,
    world: World,
    range: number,
    toolDef: ToolDefinition,
  ): TileToolTarget | null {
    let targetTileCoord: TileCoord | null = this.tileSelectionSystem?.getSelectedTile() ?? null;

    if (!targetTileCoord) {
      const pcx = player.position.worldX + player.size / 2;
      const pcy = player.position.worldY + player.size / 2;
      let targetX = pcx;
      let targetY = pcy;
      // Projeta uma coordenada além da caixa de colisão do jogador na direção voltada
      const step = player.size / 2 + 6;
      switch (player.direction) {
        case PlayerDirection.RIGHT:
          targetX = pcx + step;
          break;
        case PlayerDirection.LEFT:
          targetX = pcx - step;
          break;
        case PlayerDirection.DOWN:
          targetY = pcy + step;
          break;
        case PlayerDirection.UP:
          targetY = pcy - step;
          break;
      }
      targetTileCoord = world.worldToTile({ worldX: targetX, worldY: targetY });
    }

    if (!world.isValidTileCoord(targetTileCoord.tileX, targetTileCoord.tileY)) {
      return null;
    }

    const tileBounds: WorldBounds = {
      minX: targetTileCoord.tileX * TILE_SIZE,
      minY: targetTileCoord.tileY * TILE_SIZE,
      maxX: (targetTileCoord.tileX + 1) * TILE_SIZE,
      maxY: (targetTileCoord.tileY + 1) * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    };

    // Rejeição estrita de tiles no setor traseiro (atrás do jogador)
    if (
      !SpatialGeometry.isObjectInFrontSector(
        player.position,
        player.size,
        player.direction,
        tileBounds,
      )
    ) {
      return null;
    }

    // Validação de alcance físico entre caixas AABB
    const playerBox = {
      minX: player.position.worldX,
      minY: player.position.worldY,
      maxX: player.position.worldX + player.size,
      maxY: player.position.worldY + player.size,
    };

    const boxDistance = SpatialGeometry.calculateAABBDistance(
      playerBox.minX,
      playerBox.minY,
      playerBox.maxX,
      playerBox.maxY,
      tileBounds.minX,
      tileBounds.minY,
      tileBounds.maxX,
      tileBounds.maxY,
    );

    if (boxDistance > range) {
      return null;
    }

    const tileTarget = new TileToolTarget(targetTileCoord.tileX, targetTileCoord.tileY);
    const equipped = player.getEquippedItem();
    if (!equipped) {
      return null;
    }

    const context: ToolExecutionContext = {
      player,
      world,
      tool: toolDef,
      equippedItem: equipped,
      target: tileTarget,
      customParams: toolDef.customParams,
    };

    if (!tileTarget.canReceiveToolAction(toolDef, context)) {
      return null;
    }

    return tileTarget;
  }

  /**
   * Localiza deterministicamente o melhor objeto do mundo (WorldObject) compatível com a ação à frente do jogador.
   *
   * Ordem rigorosa de seleção e desempate:
   * 1. Objetos que implementam ToolTarget ou ItemActionTarget;
   * 2. Objetos que aceitam a ação requerida (canReceiveToolAction ou canReceiveAction !== false);
   * 3. Objetos à frente do jogador no setor direcional ativo (rejeita estritamente as costas);
   * 4. Menor distância física euclidiana entre as caixas AABB (dentro do alcance efetivo);
   * 5. Menor distância física ao ponto frontal do jogador;
   * 6. Desempate estável e lexicográfico por ID (a.id.localeCompare(b.id)).
   *
   * NUNCA materializa chunks e NUNCA realiza varredura global de todos os objetos do mundo.
   */
  public findBestObjectTarget(
    player: Player,
    world: World,
    action: string,
    overrideRange?: number,
    toolDef?: ToolDefinition,
  ): CompatibleObjectTarget | null {
    const range = overrideRange ?? this.defaultRange;
    const searchArea = SpatialGeometry.calculateDirectionalArea(
      player.position,
      player.size,
      player.direction,
      range,
    );

    // Consulta espacial puramente local através do WorldObjectManager
    const nearbyObjects = world.getObjectManager().getObjectsInArea(
      searchArea.minX,
      searchArea.minY,
      searchArea.width,
      searchArea.height,
    );

    if (nearbyObjects.length === 0) {
      return null;
    }

    const playerBox = {
      minX: player.position.worldX,
      minY: player.position.worldY,
      maxX: player.position.worldX + player.size,
      maxY: player.position.worldY + player.size,
    };
    const frontPoint = SpatialGeometry.getDirectionFrontPoint(
      player.position,
      player.size,
      player.direction,
    );

    const candidates: ActionCandidateEvaluation[] = [];

    for (const obj of nearbyObjects) {
      const isTool = isToolTarget(obj);
      const isItemAction = isItemActionTarget(obj);

      // 1. O objeto deve implementar ao menos um dos contratos genéricos de ação
      if (!isTool && !isItemAction) {
        continue;
      }

      // 2. Valida se o alvo aceita a ação
      let canReceive = false;
      if (isTool && toolDef) {
        const dummyContext: ToolExecutionContext = {
          player,
          world,
          tool: toolDef,
          equippedItem: player.getEquippedItem()!,
          target: obj as unknown as ToolTarget,
        };
        canReceive = (obj as unknown as ToolTarget).canReceiveToolAction(toolDef, dummyContext);
      } else if (isItemAction) {
        const itemTarget = obj as unknown as ItemActionTarget;
        canReceive = itemTarget.canReceiveAction ? itemTarget.canReceiveAction(action) : true;
      } else if (isTool) {
        canReceive = true;
      }

      if (!canReceive) {
        continue;
      }

      // 3. Obtém os limites físicos da ação (AABB físico)
      let objBounds: WorldBounds;
      if (isTool) {
        objBounds = (obj as unknown as ToolTarget).getTargetBounds();
      } else {
        objBounds = getObjectActionWorldBounds(obj as unknown as ItemActionTarget & WorldObject);
      }

      // 4. Verifica se o objeto está no setor frontal na direção do jogador (rejeita costas)
      if (
        !SpatialGeometry.isObjectInFrontSector(
          player.position,
          player.size,
          player.direction,
          objBounds,
        )
      ) {
        continue;
      }

      // 5. Calcula a menor distância física entre as caixas AABB
      const boxDistance = SpatialGeometry.calculateAABBDistance(
        playerBox.minX,
        playerBox.minY,
        playerBox.maxX,
        playerBox.maxY,
        objBounds.minX,
        objBounds.minY,
        objBounds.maxX,
        objBounds.maxY,
      );

      if (boxDistance > range) {
        continue;
      }

      const ocx = objBounds.minX + objBounds.width / 2;
      const ocy = objBounds.minY + objBounds.height / 2;
      const distToFront = Math.hypot(ocx - frontPoint.worldX, ocy - frontPoint.worldY);

      candidates.push({
        obj: obj as CompatibleObjectTarget,
        bounds: objBounds,
        boxDistance,
        distToFront,
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    // 6. Ordenação determinística estrita
    candidates.sort((a, b) => {
      // Regra 1: Menor distância física entre as caixas
      if (Math.abs(a.boxDistance - b.boxDistance) > 1e-4) {
        return a.boxDistance - b.boxDistance;
      }

      // Regra 2: Menor distância ao ponto frontal do Player
      if (Math.abs(a.distToFront - b.distToFront) > 1e-4) {
        return a.distToFront - b.distToFront;
      }

      // Regra 3: Desempate determinístico lexicográfico por ID único
      return a.obj.id.localeCompare(b.obj.id);
    });

    return candidates[0].obj;
  }

  /**
   * Localiza deterministicamente o melhor alvo compatível com a ação à frente do jogador.
   * Suporta polimorficamente alvos de terreno (tiles) e objetos do mundo (WorldObjects)
   * baseado no domínio declarativo (targetDomain) da ferramenta.
   */
  public findBestTarget(
    player: Player,
    world: World,
    action: string,
    overrideRange?: number,
    toolDef?: ToolDefinition,
  ): CompatibleActionTarget | null {
    const range = overrideRange ?? this.defaultRange;

    // 1. Domínio explícito de terreno: pesquisa exclusiva em células de terreno
    if (toolDef?.targetDomain === 'tile') {
      return this.findBestTileTarget(player, world, range, toolDef);
    }

    // 2. Domínio híbrido: avalia objetos do mundo e terreno consecutivamente
    if (toolDef?.targetDomain === 'any') {
      const objTarget = this.findBestObjectTarget(player, world, action, range, toolDef);
      if (objTarget) {
        return objTarget;
      }
      return this.findBestTileTarget(player, world, range, toolDef);
    }

    // 3. Domínio padrão: objetos do mundo
    return this.findBestObjectTarget(player, world, action, range, toolDef);
  }

  /**
   * Executa o uso da ferramenta ou item atualmente equipado pelo Player.
   *
   * Trata todos os casos inválidos sem corromper o estado do mundo:
   * - Nenhum item equipado;
   * - Item sem ferramenta ou ação declarativa associada;
   * - Cooldown ativo;
   * - Alvo fora de alcance ou ausente;
   * - Alvo incompatível.
   */
  public useEquippedItem(player: Player, world: World): ItemUseResult {
    // 1. Verificar se há item equipado
    const equipped = player.getEquippedItem();
    if (!equipped) {
      const result: ItemUseResult = {
        success: false,
        action: '',
        code: 'no_equipped_item',
        message: 'Nenhum item equipado.',
      };
      this.lastResult = result;
      return result;
    }

    // 2. Resolver ToolDefinition ou fallback ItemUseDefinition
    const toolDef = ToolRegistry.getByItemId(equipped.itemId);
    const itemDef = ItemRegistry.get(equipped.itemId);
    const useDef = itemDef?.useDefinition;

    if (!toolDef && !useDef) {
      const result: ItemUseResult = {
        success: false,
        action: '',
        code: 'item_not_usable',
        message: `O item "${itemDef?.name ?? equipped.itemId}" não possui ação de uso.`,
      };
      this.lastResult = result;
      return result;
    }

    // Extrair parâmetros declarativos normalizados
    const action = toolDef ? toolDef.action : useDef!.action;
    const range = toolDef ? toolDef.range : (useDef!.range ?? this.defaultRange);
    const cooldown = toolDef ? toolDef.cooldown : (useDef!.cooldown ?? this.defaultCooldown);
    const actionDuration = toolDef ? toolDef.actionDuration : (useDef!.blocksMovementDuration ?? 0.2);
    const requiresTarget = toolDef ? (toolDef.requiresTarget !== false) : (useDef!.requiresTarget !== false);

    // 3. Verificar cooldown
    if (this.cooldownTimer > 0) {
      const result: ItemUseResult = {
        success: false,
        action,
        code: 'cooldown_active',
        message: 'Aguarde o tempo de recarga da ferramenta.',
      };
      this.lastResult = result;
      return result;
    }

    // 4. Localizar alvo se a ação exigir alvo físico
    let target: CompatibleActionTarget | null = null;
    if (requiresTarget) {
      target = this.findBestTarget(player, world, action, range, toolDef);
      if (!target) {
        const result: ItemUseResult = {
          success: false,
          action,
          code: 'no_target',
          message: 'Nenhum alvo ao alcance para esta ação.',
        };
        this.lastResult = result;
        return result;
      }
    }

    // 5. Executar ação através dos contratos polimórficos
    let result: ItemUseResult;
    if (target) {
      if (toolDef && isToolTarget(target)) {
        // Caminho da nova arquitetura genérica de ferramentas
        const toolContext: ToolExecutionContext = {
          player,
          world,
          tool: toolDef,
          equippedItem: equipped,
          target,
          customParams: toolDef.customParams,
        };
        const toolResult: ToolExecutionResult = target.receiveToolAction(toolDef, toolContext);
        result = {
          success: toolResult.success,
          action: toolResult.action,
          code: toolResult.code,
          message: toolResult.message,
          mutations: toolResult.mutations,
          statePatch: toolResult.statePatch,
          cooldownApplied: toolResult.cooldownApplied ?? toolDef.cooldown,
        };
      } else if (isItemActionTarget(target)) {
        // Caminho legado retrocompatível
        const context: ItemUseContext = {
          player,
          world,
          equippedItem: equipped,
          target,
          action,
          customArgs: toolDef?.customParams ?? useDef?.customArgs,
        };
        result = target.receiveAction(action, context);
      } else {
        result = {
          success: false,
          action,
          code: 'incompatible_target',
          message: 'Alvo incompatível com a ferramenta.',
        };
      }
    } else {
      // Para ferramentas ou itens de uso livre (sem alvo fixo)
      result = {
        success: true,
        action,
        code: 'action_executed',
        message: `Ação "${action}" executada com sucesso.`,
      };
    }

    this.lastResult = result;
    this.lastTarget = target;

    // 6. Se a ação teve sucesso, aplicar consequências de forma desacoplada
    if (result.success) {
      // Atualizar estado direto do objeto alvo se especificado (para WorldObjects)
      if (target && result.statePatch && 'id' in target) {
        world.getObjectManager().updateObjectState((target as { id: string }).id, result.statePatch);
      }

      // Aplicar mutações de mundo estritamente via WorldMutationHandler
      if (result.mutations && result.mutations.length > 0) {
        WorldMutationHandler.applyMutations(world, result.mutations);
      }

      // Aplicar cooldown configurado na ferramenta ou retornado pelo resultado
      const cooldownToApply = result.cooldownApplied ?? cooldown;
      this.cooldownTimer = cooldownToApply;

      // Aplicar eventual bloqueio de movimento
      if (actionDuration > 0) {
        this.movementBlockTimer = actionDuration;
      }

      // Iniciar estado temporal determinístico de ação no Player
      player.startAction(action, equipped.itemId, actionDuration);

      // Registrar mensagem de feedback transitória
      if (result.message) {
        this.showFeedback(result.message);
      }
    }

    if (this.onItemUse) {
      this.onItemUse(result, target);
    }

    return result;
  }

  /**
   * Retorna o alvo atual detectado no frame para a ferramenta equipada.
   */
  public getCurrentTarget(): CompatibleActionTarget | null {
    return this.currentTarget;
  }

  /**
   * Atualização principal chamada a cada frame pelo GameLoop.
   * Processa cooldown, detecção de alvo em tempo real, entrada discreta da ação 'use_item' e feedback transitório.
   */
  public update(
    player: Player,
    world: World,
    input: InputSource,
    deltaTime: number = 0,
    tileSelectionSystem?: TileSelectionSystem,
  ): ItemUseResult | null {
    if (tileSelectionSystem) {
      this.tileSelectionSystem = tileSelectionSystem;
    }

    // 1. Atualizar temporizadores monotônicos
    if (deltaTime > 0) {
      if (this.cooldownTimer > 0) {
        this.cooldownTimer = Math.max(0, this.cooldownTimer - deltaTime);
      }
      if (this.movementBlockTimer > 0) {
        this.movementBlockTimer = Math.max(0, this.movementBlockTimer - deltaTime);
      }
      if (this.feedbackTimer > 0) {
        this.feedbackTimer = Math.max(0, this.feedbackTimer - deltaTime);
        if (this.feedbackTimer === 0) {
          this.activeFeedbackMessage = null;
        }
      }
    }

    // 2. Atualizar continuamente o alvo detectado à frente do jogador
    const equipped = player.getEquippedItem();
    const toolDef = equipped ? ToolRegistry.getByItemId(equipped.itemId) : undefined;
    const itemDef = equipped ? ItemRegistry.get(equipped.itemId) : null;
    const useDef = itemDef?.useDefinition;

    const action = toolDef?.action ?? useDef?.action;
    const range = toolDef?.range ?? useDef?.range ?? this.defaultRange;
    const requiresTarget = toolDef ? (toolDef.requiresTarget !== false) : (useDef?.requiresTarget !== false);

    if (action && requiresTarget) {
      this.currentTarget = this.findBestTarget(player, world, action, range, toolDef);
    } else {
      this.currentTarget = null;
    }

    // 3. Verificar intenção discreta da ação 'use_item'
    const isUseJustPressed = input.isActionJustPressed
      ? input.isActionJustPressed('use_item')
      : false;

    if (isUseJustPressed) {
      return this.useEquippedItem(player, world);
    }

    return null;
  }

  /**
   * Renderiza na tela um prompt sutil indicando a ação da ferramenta equipada (ex: [F] Cortar).
   */
  public renderPrompt(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewport: ViewportSize,
    player: Player,
  ): void {
    if (!this.currentTarget) {
      return;
    }

    const equipped = player.getEquippedItem();
    if (!equipped) {
      return;
    }

    const toolDef = ToolRegistry.getByItemId(equipped.itemId);
    const itemDef = ItemRegistry.get(equipped.itemId);
    const action = toolDef?.action ?? itemDef?.useDefinition?.action;
    if (!action) {
      return;
    }

    let bounds: WorldBounds;
    if (isToolTarget(this.currentTarget)) {
      bounds = this.currentTarget.getTargetBounds();
    } else {
      bounds = getObjectActionWorldBounds(this.currentTarget as unknown as ItemActionTarget & WorldObject);
    }

    const centerWorld: WorldCoord = {
      worldX: bounds.minX + bounds.width / 2,
      worldY: bounds.minY - 26,
    };

    const screenPos = camera.worldToScreen(centerWorld, viewport);

    ctx.save();
    const actionLabel = ACTION_LABELS[action] ?? action;
    const label = `[F] ${actionLabel}`;
    ctx.font = 'bold 10px monospace';
    const textWidth = ctx.measureText(label).width;
    const paddingX = 6;
    const boxHeight = 16;
    const boxWidth = textWidth + paddingX * 2;
    const boxX = Math.round(screenPos.screenX - boxWidth / 2);
    const boxY = Math.round(screenPos.screenY - boxHeight);

    // Fundo escuro com borda azul ciano destacando ação de ferramenta
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);

    ctx.fillStyle = '#e0f2fe';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(label, Math.round(screenPos.screenX), boxY + boxHeight / 2);
    ctx.restore();
  }

  /**
   * Renderiza feedback textual temporário na tela para ações de ferramentas.
   */
  public renderFeedback(
    ctx: CanvasRenderingContext2D,
    viewport: ViewportSize,
  ): void {
    if (!this.activeFeedbackMessage || this.feedbackTimer <= 0) {
      return;
    }

    ctx.save();
    ctx.font = 'bold 12px monospace';
    const text = this.activeFeedbackMessage;
    const textWidth = ctx.measureText(text).width;
    const paddingX = 14;
    const boxHeight = 24;
    const boxWidth = textWidth + paddingX * 2;
    const boxX = Math.round((viewport.width - boxWidth) / 2);
    const boxY = 48;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);

    ctx.fillStyle = '#f0f9ff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, Math.round(viewport.width / 2), boxY + boxHeight / 2);
    ctx.restore();
  }

  /**
   * Registra uma mensagem de feedback técnico transitória para exibição na tela.
   */
  public showFeedback(message: string, durationSeconds: number = 2.0): void {
    this.activeFeedbackMessage = message;
    this.feedbackTimer = durationSeconds;
  }

  /**
   * Retorna a mensagem de feedback ativa no momento, ou null.
   */
  public getActiveFeedbackMessage(): string | null {
    return this.activeFeedbackMessage;
  }
}
