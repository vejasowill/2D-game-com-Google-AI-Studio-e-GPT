import { DEFAULT_PLAYER_INTERACTION_RANGE, DEBUG_INTERACTION } from './constants.ts';
import { Camera } from './Camera.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { WorldBounds, WorldCoord, ViewportSize, InputSource } from './types.ts';
import {
  InteractiveWorldObject,
  InteractionResult,
  getObjectInteractionWorldBounds,
  isInteractable,
} from './InteractionTypes.ts';

interface CandidateEvaluation {
  readonly obj: InteractiveWorldObject;
  readonly bounds: WorldBounds;
  readonly boxDistance: number;
  readonly distToFront: number;
}

/**
 * Sistema desacoplado responsável por gerenciar a detecção, seleção determinística
 * e execução de interações entre o Player e WorldObjects no mundo.
 *
 * Princípios arquiteturais:
 * - O Player e o InteractionSystem NUNCA inspecionam 'object.type';
 * - Toda a comunicação é mediada pelo contrato Interactable / InteractiveWorldObject;
 * - Respeita rigorosamente a orientação direcional do jogador (frente vs. costas);
 * - Totalmente determinístico (sem Math.random, sem dependência de inserção ou streaming);
 * - Executa consultas espaciais estritamente limitadas à área de alcance (sem varredura global);
 * - NUNCA materializa chunks nem altera a física/movimento.
 */
export class InteractionSystem {
  public defaultRange: number;
  public debugEnabled: boolean;
  public showPrompt: boolean;

  /** Objeto interativo atualmente selecionado como melhor alvo */
  private currentTarget: InteractiveWorldObject | null = null;

  /** Último resultado de interação executado (para inspeção e testes) */
  private lastResult: InteractionResult | null = null;

  /** Ouvinte opcional de eventos de interação */
  public onInteraction?: (result: InteractionResult, target: InteractiveWorldObject) => void;

  constructor(
    defaultRange: number = DEFAULT_PLAYER_INTERACTION_RANGE,
    debugEnabled: boolean = DEBUG_INTERACTION,
    showPrompt: boolean = true,
  ) {
    this.defaultRange = defaultRange;
    this.debugEnabled = debugEnabled;
    this.showPrompt = showPrompt;
  }

  /**
   * Retorna o alvo interativo atualmente sob mira do jogador, se houver.
   */
  public getCurrentTarget(): InteractiveWorldObject | null {
    return this.currentTarget;
  }

  /**
   * Retorna o último resultado de interação produzido.
   */
  public getLastResult(): InteractionResult | null {
    return this.lastResult;
  }

  /**
   * Calcula a caixa delimitadora (AABB) da área de interação do Player
   * projetada à frente na direção em que ele está olhando.
   */
  public calculateInteractionArea(player: Player, range: number = this.defaultRange): WorldBounds {
    const px = player.position.worldX;
    const py = player.position.worldY;
    const size = player.size;
    const LATERAL_MARGIN = 8;
    const OVERLAP = 4; // Pequena sobreposição com o corpo para capturar objetos imediatamente adjacentes

    switch (player.direction) {
      case PlayerDirection.RIGHT: {
        const minX = px + size - OVERLAP;
        const maxX = px + size + range;
        const minY = py - LATERAL_MARGIN;
        const maxY = py + size + LATERAL_MARGIN;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
      case PlayerDirection.LEFT: {
        const minX = px - range;
        const maxX = px + OVERLAP;
        const minY = py - LATERAL_MARGIN;
        const maxY = py + size + LATERAL_MARGIN;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
      case PlayerDirection.DOWN: {
        const minX = px - LATERAL_MARGIN;
        const maxX = px + size + LATERAL_MARGIN;
        const minY = py + size - OVERLAP;
        const maxY = py + size + range;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
      case PlayerDirection.UP: {
        const minX = px - LATERAL_MARGIN;
        const maxX = px + size + LATERAL_MARGIN;
        const minY = py - range;
        const maxY = py + OVERLAP;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
    }
  }

  /**
   * Obtém a coordenada do ponto frontal do jogador no espaço do mundo.
   */
  private getPlayerFrontPoint(player: Player): WorldCoord {
    const px = player.position.worldX;
    const py = player.position.worldY;
    const size = player.size;
    const pcx = px + size / 2;
    const pcy = py + size / 2;

    switch (player.direction) {
      case PlayerDirection.RIGHT:
        return { worldX: px + size, worldY: pcy };
      case PlayerDirection.LEFT:
        return { worldX: px, worldY: pcy };
      case PlayerDirection.DOWN:
        return { worldX: pcx, worldY: py + size };
      case PlayerDirection.UP:
        return { worldX: pcx, worldY: py };
    }
  }

  /**
   * Verifica se um objeto está orientado à frente do Player na direção cardeal ativa.
   * Rejeita estritamente objetos localizados nas costas do jogador.
   */
  private isObjectInFrontSector(
    player: Player,
    objBounds: WorldBounds,
  ): boolean {
    const px = player.position.worldX;
    const py = player.position.worldY;
    const size = player.size;
    const pcx = px + size / 2;
    const pcy = py + size / 2;

    const ocx = objBounds.minX + objBounds.width / 2;
    const ocy = objBounds.minY + objBounds.height / 2;

    const dx = ocx - pcx;
    const dy = ocy - pcy;
    const ANGLE_TOLERANCE = 16; // Margem para permitir objetos levemente diagonais à frente

    switch (player.direction) {
      case PlayerDirection.RIGHT:
        // O objeto deve estar à direita do centro do jogador e não nas costas
        return dx > 0 && dx >= Math.abs(dy) - ANGLE_TOLERANCE;
      case PlayerDirection.LEFT:
        return dx < 0 && Math.abs(dx) >= Math.abs(dy) - ANGLE_TOLERANCE;
      case PlayerDirection.DOWN:
        return dy > 0 && dy >= Math.abs(dx) - ANGLE_TOLERANCE;
      case PlayerDirection.UP:
        return dy < 0 && Math.abs(dy) >= Math.abs(dx) - ANGLE_TOLERANCE;
    }
  }

  /**
   * Calcula a menor distância euclidiana entre duas caixas AABB (em pixels).
   * Se as caixas se tocam ou sobrepõem, retorna 0.
   */
  private static calculateAABBDistance(
    minX1: number,
    minY1: number,
    maxX1: number,
    maxY1: number,
    minX2: number,
    minY2: number,
    maxX2: number,
    maxY2: number,
  ): number {
    const dx = Math.max(0, Math.max(minX1 - maxX2, minX2 - maxX1));
    const dy = Math.max(0, Math.max(minY1 - maxY2, minY2 - maxY1));
    return Math.hypot(dx, dy);
  }

  /**
   * Localiza deterministicamente o melhor alvo interativo à frente do Player.
   *
   * Ordem rigorosa de seleção e desempate:
   * 1. Objetos interativos válidos e disponíveis (canInteract !== false);
   * 2. Objetos à frente do jogador e dentro do alcance efetivo;
   * 3. Maior prioridade de interação (interaction.priority);
   * 4. Menor distância física entre as caixas AABB;
   * 5. Menor distância ao ponto frontal do Player;
   * 6. Desempate estrito por ID alfanumérico (a.id.localeCompare(b.id)).
   *
   * Não materializa chunks e não depende de ordem de inserção.
   */
  public findBestTarget(
    player: Player,
    world: World,
    overrideRange?: number,
  ): InteractiveWorldObject | null {
    const range = overrideRange ?? this.defaultRange;
    // Para capturar objetos com range customizado maior, consultamos a área com margem
    const searchArea = this.calculateInteractionArea(player, range);

    // Consulta puramente local e espacial no WorldObjectManager
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
    const frontPoint = this.getPlayerFrontPoint(player);
    const candidates: CandidateEvaluation[] = [];

    for (const obj of nearbyObjects) {
      // 1. Ignora objetos não interativos
      if (!isInteractable(obj)) {
        continue;
      }

      // 2. Valida se a interação está habilitada no momento
      if (obj.canInteract && !obj.canInteract({ player, world, object: obj })) {
        continue;
      }

      // 3. Obtém os limites de interação do objeto (independente do sprite)
      const objBounds = getObjectInteractionWorldBounds(obj);

      // 4. Verifica se está no setor direcional à frente do jogador (rejeita costas)
      if (!this.isObjectInFrontSector(player, objBounds)) {
        continue;
      }

      // 5. Calcula distância e verifica alcance efetivo
      const boxDistance = InteractionSystem.calculateAABBDistance(
        playerBox.minX,
        playerBox.minY,
        playerBox.maxX,
        playerBox.maxY,
        objBounds.minX,
        objBounds.minY,
        objBounds.maxX,
        objBounds.maxY,
      );

      const effectiveRange = obj.interaction.range ?? range;
      if (boxDistance > effectiveRange) {
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

    // 6. Ordenação determinística com política estrita de prioridades
    candidates.sort((a, b) => {
      // Regra 1: Maior prioridade declarativa
      const prioA = a.obj.interaction.priority ?? 0;
      const prioB = b.obj.interaction.priority ?? 0;
      if (prioA !== prioB) {
        return prioB - prioA;
      }

      // Regra 2: Menor distância entre caixas físicas
      if (Math.abs(a.boxDistance - b.boxDistance) > 1e-4) {
        return a.boxDistance - b.boxDistance;
      }

      // Regra 3: Menor distância ao ponto frontal
      if (Math.abs(a.distToFront - b.distToFront) > 1e-4) {
        return a.distToFront - b.distToFront;
      }

      // Regra 4: Desempate determinístico rigoroso por ID lexicográfico
      return a.obj.id.localeCompare(b.obj.id);
    });

    return candidates[0].obj;
  }

  /**
   * Atualização principal chamada a cada frame pelo GameLoop.
   * Identifica o alvo atual e, se a ação 'interact' foi acionada (discreta), executa a interação.
   */
  public update(
    player: Player,
    world: World,
    input: InputSource,
  ): InteractionResult | null {
    // 1. Atualizar o melhor alvo na mira
    this.currentTarget = this.findBestTarget(player, world);

    // 2. Verificar intenção discreta de interação
    const isInteractJustPressed = input.isActionJustPressed
      ? input.isActionJustPressed('interact')
      : false;

    if (isInteractJustPressed && this.currentTarget) {
      const context = {
        player,
        world,
        object: this.currentTarget,
      };

      const result = this.currentTarget.interact(context);
      this.lastResult = result;

      if (this.onInteraction) {
        this.onInteraction(result, this.currentTarget);
      }

      return result;
    }

    return null;
  }

  /**
   * Executa diretamente a interação com o alvo atual ou um alvo especificado.
   */
  public executeInteraction(
    player: Player,
    world: World,
    target: InteractiveWorldObject | null = this.currentTarget,
  ): InteractionResult | null {
    if (!target) {
      return null;
    }

    const context = {
      player,
      world,
      object: target,
    };

    if (target.canInteract && !target.canInteract(context)) {
      return {
        success: false,
        interactionId: target.interaction.id,
        actionLabel: target.interaction.label,
        message: 'Interação indisponível no momento.',
        code: 'blocked',
      };
    }

    const result = target.interact(context);
    this.lastResult = result;

    if (this.onInteraction) {
      this.onInteraction(result, target);
    }

    return result;
  }

  /**
   * Renderiza o feedback técnico provisório (marcador '[E]' flutuante sobre o alvo selecionado).
   * Desenhado de forma limpa e discreta sem comprometer o visual.
   */
  public renderPrompt(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewport: ViewportSize,
  ): void {
    if (!this.showPrompt || !this.currentTarget) {
      return;
    }

    const bounds = getObjectInteractionWorldBounds(this.currentTarget);
    const centerWorld: WorldCoord = {
      worldX: bounds.minX + bounds.width / 2,
      worldY: bounds.minY - 12, // Acima do objeto
    };

    const screenPos = camera.worldToScreen(centerWorld, viewport);

    ctx.save();
    // Caixinha sutil indicando a tecla de interação '[E]'
    const label = `[E] ${this.currentTarget.interaction.label}`;
    ctx.font = 'bold 10px monospace';
    const textWidth = ctx.measureText(label).width;
    const paddingX = 6;
    const boxHeight = 16;
    const boxWidth = textWidth + paddingX * 2;
    const boxX = Math.round(screenPos.screenX - boxWidth / 2);
    const boxY = Math.round(screenPos.screenY - boxHeight);

    // Fundo semitransparente escuro
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Borda sutil amarela/dourada
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);

    // Texto
    ctx.fillStyle = '#fef3c7';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(label, Math.round(screenPos.screenX), boxY + boxHeight / 2);

    ctx.restore();
  }

  /**
   * Renderiza a visualização técnica de debug quando DEBUG_INTERACTION está ativado.
   * Desenha a área de interação do Player e destaca os limites do alvo.
   */
  public renderDebug(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewport: ViewportSize,
    player: Player,
  ): void {
    if (!this.debugEnabled) {
      return;
    }

    ctx.save();

    // 1. Desenhar a área de interação do Player
    const area = this.calculateInteractionArea(player);
    const areaTopLeft = camera.worldToScreen({ worldX: area.minX, worldY: area.minY }, viewport);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.fillRect(
      Math.round(areaTopLeft.screenX),
      Math.round(areaTopLeft.screenY),
      Math.round(area.width),
      Math.round(area.height),
    );

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      Math.round(areaTopLeft.screenX) + 0.5,
      Math.round(areaTopLeft.screenY) + 0.5,
      Math.round(area.width) - 1,
      Math.round(area.height) - 1,
    );
    ctx.setLineDash([]);

    // 2. Destacar o alvo atual se houver
    if (this.currentTarget) {
      const targetBounds = getObjectInteractionWorldBounds(this.currentTarget);
      const targetScreen = camera.worldToScreen(
        { worldX: targetBounds.minX, worldY: targetBounds.minY },
        viewport,
      );

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        Math.round(targetScreen.screenX) + 0.5,
        Math.round(targetScreen.screenY) + 0.5,
        Math.round(targetBounds.width) - 1,
        Math.round(targetBounds.height) - 1,
      );

      // Label do ID do alvo
      ctx.font = '9px monospace';
      ctx.fillStyle = '#22c55e';
      ctx.fillText(
        `ID: ${this.currentTarget.id}`,
        Math.round(targetScreen.screenX),
        Math.round(targetScreen.screenY) - 4,
      );
    }

    ctx.restore();
  }
}
