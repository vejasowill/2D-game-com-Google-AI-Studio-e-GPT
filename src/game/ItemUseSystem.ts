import { Camera } from './Camera.ts';
import { InputSource, ViewportSize, WorldBounds, WorldCoord } from './types.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { SpatialGeometry } from './SpatialGeometry.ts';
import {
  ItemActionTarget,
  ItemUseContext,
  ItemUseResult,
  getObjectActionWorldBounds,
  isItemActionTarget,
} from './ItemUseTypes.ts';

interface ActionCandidateEvaluation {
  readonly obj: WorldObject & ItemActionTarget;
  readonly bounds: WorldBounds;
  readonly boxDistance: number;
  readonly distToFront: number;
}

/**
 * Sistema genérico, declarativo e desacoplado responsável pelo uso de itens e ferramentas.
 *
 * Princípios arquiteturais:
 * 1. O sistema NUNCA inspeciona 'itemId === ...' nem 'target.type === ...' (zero acoplamento concreto);
 * 2. Itens declaram suas capacidades através de ItemUseDefinition no ItemDefinition;
 * 3. Alvos no mundo declaram sua aceitação de ações através da interface ItemActionTarget;
 * 4. Aplicações de consequências no mundo passam estritamente pelo WorldMutationHandler;
 * 5. Sistema de alcance puramente geométrico (hitbox física, orientação direcional do jogador);
 * 6. Suporte completo a cooldown por item, determinístico e testável sem temporizadores reais;
 * 7. 100% determinístico (sem Math.random), compatível com coordenadas negativas e streaming de chunks;
 * 8. Nunca materializa chunks indevidamente e nunca realiza varredura global O(N).
 */
export class ItemUseSystem {
  public defaultRange: number;
  public defaultCooldown: number;

  /** Temporizador de cooldown ativo em segundos */
  private cooldownTimer: number = 0;

  /** Temporizador de bloqueio transitório de movimento do jogador durante a execução */
  private movementBlockTimer: number = 0;

  /** Último resultado de ação executado */
  private lastResult: ItemUseResult | null = null;

  /** Alvo selecionado mais recentemente */
  private lastTarget: (WorldObject & ItemActionTarget) | null = null;

  /** Alvo selecionável ativo no frame atual à frente do jogador */
  private currentTarget: (WorldObject & ItemActionTarget) | null = null;

  /** Mensagem transitória de feedback técnico */
  private activeFeedbackMessage: string | null = null;
  private feedbackTimer: number = 0;

  /** Ouvinte desacoplado opcional para eventos de uso de item */
  public onItemUse?: (
    result: ItemUseResult,
    target?: (WorldObject & ItemActionTarget) | null,
  ) => void;

  constructor(defaultRange: number = 36, defaultCooldown: number = 0.4) {
    this.defaultRange = defaultRange;
    this.defaultCooldown = defaultCooldown;
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
  public getLastTarget(): (WorldObject & ItemActionTarget) | null {
    return this.lastTarget;
  }

  /**
   * Verifica se o Player possui um item utilizável equipado e pronto para uso (sem cooldown ativo).
   */
  public canUseItem(player: Player): boolean {
    if (this.cooldownTimer > 0) {
      return false;
    }

    const equipped = player.getEquippedItem();
    if (!equipped) {
      return false;
    }

    const itemDef = ItemRegistry.get(equipped.itemId);
    if (!itemDef || !itemDef.useDefinition) {
      return false;
    }

    return true;
  }

  /**
   * Localiza deterministicamente o melhor alvo compatível com a ação à frente do jogador.
   *
   * Ordem rigorosa de seleção e desempate:
   * 1. Objetos que implementam ItemActionTarget;
   * 2. Objetos que aceitam a ação requerida (canReceiveAction !== false);
   * 3. Objetos à frente do jogador no setor direcional ativo (rejeita estritamente as costas);
   * 4. Menor distância física euclidiana entre as caixas AABB (dentro do alcance efetivo);
   * 5. Menor distância física ao ponto frontal do jogador;
   * 6. Desempate estável e lexicográfico por ID (a.id.localeCompare(b.id)).
   *
   * NUNCA materializa chunks e NUNCA realiza varredura global de todos os objetos do mundo.
   */
  public findBestTarget(
    player: Player,
    world: World,
    action: string,
    overrideRange?: number,
  ): (WorldObject & ItemActionTarget) | null {
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
      // 1. O objeto deve implementar o contrato genérico ItemActionTarget
      if (!isItemActionTarget(obj)) {
        continue;
      }

      // 2. Valida se o alvo aceita a ação
      if (obj.canReceiveAction && !obj.canReceiveAction(action)) {
        continue;
      }

      // 3. Obtém os limites físicos da ação
      const objBounds = getObjectActionWorldBounds(obj);

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
        obj,
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
   * Executa o uso do item atualmente equipado pelo Player.
   *
   * Trata todos os casos inválidos sem corromper o estado do mundo:
   * - Nenhum item equipado;
   * - Item não cadastrado no ItemRegistry;
   * - Item sem ação declarativa (useDefinition);
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

    // 2. Verificar se a definição do item existe
    const itemDef = ItemRegistry.get(equipped.itemId);
    if (!itemDef) {
      const result: ItemUseResult = {
        success: false,
        action: '',
        code: 'item_not_registered',
        message: `Item "${equipped.itemId}" não registrado.`,
      };
      this.lastResult = result;
      return result;
    }

    // 3. Verificar se o item possui ação de uso declarativa
    const useDef = itemDef.useDefinition;
    if (!useDef) {
      const result: ItemUseResult = {
        success: false,
        action: '',
        code: 'item_not_usable',
        message: `O item "${itemDef.name}" não possui ação de uso.`,
      };
      this.lastResult = result;
      return result;
    }

    // 4. Verificar cooldown
    if (this.cooldownTimer > 0) {
      const result: ItemUseResult = {
        success: false,
        action: useDef.action,
        code: 'cooldown_active',
        message: 'Aguarde o tempo de recarga da ferramenta.',
      };
      this.lastResult = result;
      return result;
    }

    const action = useDef.action;
    const range = useDef.range ?? this.defaultRange;
    const requiresTarget = useDef.requiresTarget !== false;

    // 5. Localizar alvo se a ação exigir alvo físico
    let target: (WorldObject & ItemActionTarget) | null = null;
    if (requiresTarget) {
      target = this.findBestTarget(player, world, action, range);
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

    // 6. Preparar contexto imutável de uso
    const context: ItemUseContext = {
      player,
      world,
      equippedItem: equipped,
      target,
      action,
      customArgs: useDef.customArgs,
    };

    // 7. Executar a ação no alvo ou na definição
    let result: ItemUseResult;
    if (target) {
      result = target.receiveAction(action, context);
    } else {
      // Para itens de uso livre (ex: poções, consumíveis futuros)
      result = {
        success: true,
        action,
        code: 'action_executed',
        message: `Ação "${action}" executada com sucesso.`,
      };
    }

    this.lastResult = result;
    this.lastTarget = target;

    // 8. Se a ação teve sucesso, aplicar consequências de forma desacoplada
    if (result.success) {
      // Atualizar estado direto do objeto alvo se especificado
      if (target && result.statePatch) {
        world.getObjectManager().updateObjectState(target.id, result.statePatch);
      }

      // Aplicar mutações de mundo estritamente via WorldMutationHandler
      if (result.mutations && result.mutations.length > 0) {
        WorldMutationHandler.applyMutations(world, result.mutations);
      }

      // Aplicar cooldown configurado no item ou padrão
      const cooldownToApply = result.cooldownApplied ?? useDef.cooldown ?? this.defaultCooldown;
      this.cooldownTimer = cooldownToApply;

      // Aplicar eventual bloqueio de movimento
      if (useDef.blocksMovementDuration && useDef.blocksMovementDuration > 0) {
        this.movementBlockTimer = useDef.blocksMovementDuration;
      }

      // Sinalizar estado de uso no Player
      player.setUsingItem(true, Math.min(cooldownToApply, 0.25));

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
  public getCurrentTarget(): (WorldObject & ItemActionTarget) | null {
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
  ): ItemUseResult | null {
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
    const itemDef = equipped ? ItemRegistry.get(equipped.itemId) : null;
    const useDef = itemDef?.useDefinition;
    if (useDef && useDef.requiresTarget !== false) {
      this.currentTarget = this.findBestTarget(player, world, useDef.action, useDef.range);
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
   * Renderiza na tela um prompt sutil indicando a ação de uso do item equipado (ex: [F] Cortar).
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

    const itemDef = ItemRegistry.get(equipped.itemId);
    if (!itemDef?.useDefinition) {
      return;
    }

    const bounds = getObjectActionWorldBounds(this.currentTarget);
    const centerWorld: WorldCoord = {
      worldX: bounds.minX + bounds.width / 2,
      worldY: bounds.minY - 26,
    };

    const screenPos = camera.worldToScreen(centerWorld, viewport);

    ctx.save();
    const actionLabel = itemDef.useDefinition.action === 'chop' ? 'Cortar' : itemDef.useDefinition.action;
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
