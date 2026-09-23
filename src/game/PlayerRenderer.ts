import { AssetManager } from './AssetManager.ts';
import { Camera } from './Camera.ts';
import { Player, PlayerActionState, PlayerDirection } from './Player.ts';
import { PlayerSpriteSheetDefinition, VisualBounds } from './PlayerVisual.ts';
import { SpriteRenderer } from './SpriteRenderer.ts';
import { ViewportSize } from './types.ts';

/**
 * Renderizador responsável exclusivamente pela apresentação gráfica do Player.
 * Desacopla a camada visual das regras de física, colisão e gerenciamento do mundo.
 * Integrado ao subsistema genérico de SpriteRenderer e AssetManager,
 * suportando sprites pixel art 32×64 px nativamente sem alterações na física ou no Y-sorting.
 */
export class PlayerRenderer {
  // Paleta da representação procedural (aventureiro top-down - fallback temporário)
  private readonly playerShadowColor: string = 'rgba(0, 0, 0, 0.28)';
  private readonly tunicColor: string = '#2563eb';
  private readonly tunicBorderColor: string = '#1d4ed8';
  private readonly skinColor: string = '#f8d7b8';
  private readonly hairColor: string = '#5c2c16';
  private readonly hairShadowColor: string = '#381a08';
  private readonly pantsColor: string = '#1e3a8a';
  private readonly bootsColor: string = '#3e2723';
  private readonly beltColor: string = '#78350f';
  private readonly buckleColor: string = '#fbbf24';
  private readonly eyeColor: string = '#0f172a';

  /** Definição opcional direta de spritesheet (para injeção manual ou testes específicos) */
  public spriteSheet: PlayerSpriteSheetDefinition | null = null;

  /** Sub-renderizador dedicado de Pixel Art (garante nearest-neighbor e alinhamento inteiro) */
  public readonly spriteRenderer: SpriteRenderer;

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.spriteRenderer = new SpriteRenderer(ctx);
  }

  /**
   * Renderiza o Player na tela.
   * Utiliza a âncora dos pés como ponto zero de ordenação e posicionamento.
   */
  public render(
    player: Player,
    camera: Camera,
    viewport: ViewportSize,
    screenWidth: number,
    screenHeight: number,
  ): void {
    const visualBounds: VisualBounds = player.getVisualBounds();
    const footPos = player.getFootPosition();
    const screenFoot = camera.worldToScreen(footPos, viewport);

    const cx = screenFoot.screenX;
    const baseY = screenFoot.screenY;

    // Frustum culling baseado na caixa delimitadora visual completa do personagem
    const margin = 16;
    if (
      cx + visualBounds.width / 2 + margin < 0 ||
      cx - visualBounds.width / 2 - margin > screenWidth ||
      baseY + margin < 0 ||
      baseY - visualBounds.height - margin > screenHeight
    ) {
      return;
    }

    // 1. Sombra elíptica no solo (ancorada estritamente na linha física dos pés)
    this.renderShadow(cx, baseY);

    // Se a direção for UP (costas para a câmera), o item na mão é desenhado antes do corpo
    const isFacingUp = player.direction === PlayerDirection.UP;
    if (isFacingUp) {
      this.renderEquippedItemInHand(player, cx, baseY);
    }

    let renderedBody = false;

    // 2. Se houver um spritesheet direto com imagem real carregada, desenha o frame
    if (this.spriteSheet && this.spriteSheet.imageSource) {
      this.renderCustomSpriteFrame(player, cx, baseY, visualBounds);
      renderedBody = true;
    } else {
      // 3. Consulta o AssetManager pelo spritesheet registrado para o Player
      const registeredSheet = AssetManager.getInstance().getSpriteSheet('player');
      if (registeredSheet && registeredSheet.imageSource) {
        const dirStr = this.directionToString(player.direction);
        const actionState = player.getActionState();
        const activeAction = player.getActiveAction();

        let animName: string;
        let frameIndex: number;

        if (actionState === PlayerActionState.USE_ITEM && activeAction) {
          // Busca animação declarativa no spritesheet:
          // Ordem de preferência: "<action>_<itemId>" (ex: 'chop_axe'), "<action>" (ex: 'chop'), "use_item"
          const specificAnim = `${activeAction.action}_${activeAction.itemId}`;
          if (registeredSheet.getAnimation(specificAnim)) {
            animName = specificAnim;
          } else if (registeredSheet.getAnimation(activeAction.action)) {
            animName = activeAction.action;
          } else if (registeredSheet.getAnimation('use_item')) {
            animName = 'use_item';
          } else {
            animName = player.isMoving ? 'walk' : 'idle';
          }

          const animDef = registeredSheet.getAnimation(animName);
          const totalFrames = animDef?.directionalFrames?.[dirStr]?.length ?? animDef?.frames?.length ?? 1;
          // Frame selecionado deterministicamente a partir do progresso normalizado da ação [0.0, 1.0]
          frameIndex = Math.min(Math.floor(activeAction.progress * totalFrames), Math.max(0, totalFrames - 1));
        } else {
          animName = player.isMoving ? 'walk' : 'idle';
          frameIndex = player.animationState.currentFrame;
        }

        const frame = registeredSheet.getFrame(
          animName,
          dirStr,
          frameIndex,
        );

        if (frame) {
          this.spriteRenderer.renderSprite(
            camera,
            viewport,
            visualBounds,
            registeredSheet,
            frame,
          );
          renderedBody = true;
        }
      }
    }

    // 4. Fallback / Placeholder vetorial atual: preserva o visual procedural do aventureiro
    if (!renderedBody) {
      this.renderProceduralCharacter(player, cx, baseY);
    }

    // Se a direção for DOWN, LEFT ou RIGHT, o item na mão é desenhado sobre o corpo/frente
    if (!isFacingUp) {
      this.renderEquippedItemInHand(player, cx, baseY);
    }
  }

  /**
   * PONTO DE EXTENSÃO PARA SPRITES E ANIMAÇÕES DEFINITIVAS DE ITEM NA MÃO:
   *
   * O desenvolvedor/artista poderá futuramente substituir esta representação técnica por:
   * 1. Sprite do item na mão registrado no AssetManager (ex: ferramentas, tochas, sementes);
   * 2. Spritesheets específicos por direção (UP, DOWN, LEFT, RIGHT);
   * 3. Animações compostas (IDLE + item, WALK + item, USE_ITEM, ATTACK);
   * 4. Rotação ou offsets de empunhadura calculados a partir de âncoras da mão do personagem.
   *
   * Esta representação técnica atual garante que qualquer item selecionado no inventário
   * seja imediatamente visível na mão sem alterar física, hitbox, colisão ou Y-sorting.
   */
  private renderEquippedItemInHand(player: Player, cx: number, baseY: number): void {
    const equipped = player.equipment.getEquippedItem();
    if (!equipped) {
      return;
    }

    const dir = player.direction;
    let handX = cx;
    let handY = baseY - 8;

    switch (dir) {
      case PlayerDirection.LEFT:
        handX = cx - 9;
        handY = baseY - 8;
        break;
      case PlayerDirection.RIGHT:
        handX = cx + 7;
        handY = baseY - 8;
        break;
      case PlayerDirection.UP:
        handX = cx + 6;
        handY = baseY - 13;
        break;
      case PlayerDirection.DOWN:
      default:
        handX = cx + 6;
        handY = baseY - 8;
        break;
    }

    // Fallback técnico limpo e proporcional para itens na mão
    const itemId = equipped.itemId;
    const itemSize = 8;
    const drawX = Math.round(handX);
    const drawY = Math.round(handY);

    if (itemId === 'wood') {
      // Pequeno tronco/tábua de madeira
      this.ctx.fillStyle = '#854d0e';
      this.ctx.fillRect(drawX - 4, drawY - 3, 8, 6);
      this.ctx.fillStyle = '#a16207';
      this.ctx.fillRect(drawX - 3, drawY - 2, 6, 2);
      this.ctx.strokeStyle = '#451a03';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(drawX - 3.5, drawY - 2.5, 7, 5);
    } else if (itemId === 'stone') {
      // Pequena pedra angular
      this.ctx.fillStyle = '#64748b';
      this.ctx.fillRect(drawX - 3, drawY - 3, 6, 6);
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.fillRect(drawX - 2, drawY - 2, 4, 2);
      this.ctx.strokeStyle = '#334155';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(drawX - 2.5, drawY - 2.5, 5, 5);
    } else if (itemId === 'flower') {
      // Flor com pétalas coloridas
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.fillRect(drawX - 3, drawY - 3, 6, 6);
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.fillRect(drawX - 1, drawY - 1, 2, 2);
    } else if (itemId === 'axe') {
      // Machado com arco de balanço técnico proporcional ao progresso da ação
      const activeAction = player.getActiveAction();
      let swingOffsetX = 0;
      let swingOffsetY = 0;

      if (activeAction && activeAction.action === 'chop') {
        const p = activeAction.progress;
        if (p < 0.25) {
          // Levantamento
          swingOffsetY = -Math.round((p / 0.25) * 3);
        } else if (p < 0.65) {
          // Golpe rápido descendente
          const strikeP = (p - 0.25) / 0.4;
          swingOffsetY = -3 + Math.round(strikeP * 7);
          swingOffsetX = dir === PlayerDirection.LEFT ? -2 : dir === PlayerDirection.RIGHT ? 2 : 0;
        } else {
          // Recuperação pós-impacto
          const returnP = (p - 0.65) / 0.35;
          swingOffsetY = 4 - Math.round(returnP * 4);
        }
      } else if (player.isUsingItem) {
        swingOffsetY = 3;
      }

      const axeX = drawX + swingOffsetX;
      const axeY = drawY + swingOffsetY;

      // Cabo de madeira
      this.ctx.fillStyle = '#92400e';
      this.ctx.fillRect(axeX - 1, axeY - 6, 2, 10);
      // Lâmina de ferro
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.fillRect(axeX, axeY - 6, 4, 4);
      this.ctx.fillStyle = '#cbd5e1';
      this.ctx.fillRect(axeX + 3, axeY - 6, 1, 4);
      this.ctx.strokeStyle = '#475569';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(axeX - 0.5, axeY - 6.5, 5, 5);
    } else {
      // Item genérico (ícone sutil)
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.fillRect(drawX - itemSize / 2, drawY - itemSize / 2, itemSize, itemSize);
      this.ctx.strokeStyle = '#78350f';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(drawX - itemSize / 2 + 0.5, drawY - itemSize / 2 + 0.5, itemSize - 1, itemSize - 1);
    }
  }

  /**
   * Converte o enum PlayerDirection para as strings canônicas de direção de animação.
   */
  private directionToString(dir: PlayerDirection): string {
    switch (dir) {
      case PlayerDirection.UP:
        return 'up';
      case PlayerDirection.LEFT:
        return 'left';
      case PlayerDirection.RIGHT:
        return 'right';
      case PlayerDirection.DOWN:
      default:
        return 'down';
    }
  }

  /**
   * Desenha a sombra elíptica projetada no solo.
   */
  private renderShadow(cx: number, baseY: number): void {
    this.ctx.fillStyle = this.playerShadowColor;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, baseY - 1, 9, 3.5, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * Renderiza um frame do spritesheet personalizado.
   */
  private renderCustomSpriteFrame(
    player: Player,
    cx: number,
    baseY: number,
    visualBounds: VisualBounds,
  ): void {
    if (!this.spriteSheet || !this.spriteSheet.imageSource) return;

    const frameRect = this.spriteSheet.getFrameRect(
      player.direction,
      player.isMoving,
      player.animationState.currentFrame,
    );

    // Garante renderização pixel art sem suavização
    this.spriteRenderer.enforcePixelArtSmoothing();

    const drawX = Math.round(cx - visualBounds.width * player.visualConfig.anchorX);
    const drawY = Math.round(baseY - visualBounds.height * player.visualConfig.anchorY);

    this.ctx.drawImage(
      this.spriteSheet.imageSource,
      frameRect.sx,
      frameRect.sy,
      frameRect.sWidth,
      frameRect.sHeight,
      drawX,
      drawY,
      visualBounds.width,
      visualBounds.height,
    );
  }

  /**
   * Renderiza a figura humana procedural atual, perfeitamente ancorada em relação
   * ao centro horizontal cx e à linha de base dos pés baseY.
   * Funciona como fallback técnico estável.
   */
  private renderProceduralCharacter(player: Player, cx: number, baseY: number): void {
    const dir = player.direction;

    // 1. Pernas e Botas
    switch (dir) {
      case PlayerDirection.LEFT: {
        this.ctx.fillStyle = this.pantsColor;
        this.ctx.fillRect(cx - 4, baseY - 7, 8, 4);

        this.ctx.fillStyle = this.bootsColor;
        this.ctx.fillRect(cx - 6, baseY - 3, 6, 3);
        this.ctx.fillRect(cx + 1, baseY - 3, 3, 3);
        this.ctx.fillStyle = this.eyeColor;
        this.ctx.fillRect(cx - 6, baseY - 1, 6, 1);
        break;
      }

      case PlayerDirection.RIGHT: {
        this.ctx.fillStyle = this.pantsColor;
        this.ctx.fillRect(cx - 4, baseY - 7, 8, 4);

        this.ctx.fillStyle = this.bootsColor;
        this.ctx.fillRect(cx - 4, baseY - 3, 3, 3);
        this.ctx.fillRect(cx, baseY - 3, 6, 3);
        this.ctx.fillStyle = this.eyeColor;
        this.ctx.fillRect(cx, baseY - 1, 6, 1);
        break;
      }

      case PlayerDirection.UP: {
        this.ctx.fillStyle = this.pantsColor;
        this.ctx.fillRect(cx - 5, baseY - 7, 10, 4);
        this.ctx.fillStyle = this.tunicBorderColor;
        this.ctx.fillRect(cx - 0.5, baseY - 7, 1, 4);

        this.ctx.fillStyle = this.bootsColor;
        this.ctx.fillRect(cx - 5, baseY - 3, 4, 3);
        this.ctx.fillRect(cx + 1, baseY - 3, 4, 3);
        this.ctx.fillStyle = this.eyeColor;
        this.ctx.fillRect(cx - 5, baseY - 1, 4, 1);
        this.ctx.fillRect(cx + 1, baseY - 1, 4, 1);
        break;
      }

      case PlayerDirection.DOWN:
      default: {
        this.ctx.fillStyle = this.pantsColor;
        this.ctx.fillRect(cx - 5, baseY - 7, 10, 4);
        this.ctx.fillStyle = this.tunicBorderColor;
        this.ctx.fillRect(cx - 0.5, baseY - 7, 1, 4);

        this.ctx.fillStyle = this.bootsColor;
        this.ctx.fillRect(cx - 5, baseY - 3, 4, 3);
        this.ctx.fillRect(cx + 1, baseY - 3, 4, 3);
        this.ctx.fillStyle = this.eyeColor;
        this.ctx.fillRect(cx - 5, baseY - 1, 4, 1);
        this.ctx.fillRect(cx + 1, baseY - 1, 4, 1);
        break;
      }
    }

    // 2. Tronco e Túnica
    this.ctx.fillStyle = this.tunicColor;
    this.ctx.fillRect(cx - 6, baseY - 16, 12, 9);
    this.ctx.strokeStyle = this.tunicBorderColor;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(cx - 5.5, baseY - 15.5, 11, 8);

    // Cinto de couro
    this.ctx.fillStyle = this.beltColor;
    this.ctx.fillRect(cx - 6, baseY - 9, 12, 2);

    // Detalhe da fivela e braços por orientação
    switch (dir) {
      case PlayerDirection.LEFT: {
        this.ctx.fillStyle = this.buckleColor;
        this.ctx.fillRect(cx - 5, baseY - 9, 2.5, 2);

        this.ctx.fillStyle = this.tunicColor;
        this.ctx.fillRect(cx - 7, baseY - 15, 3, 6);
        this.ctx.fillStyle = this.skinColor;
        this.ctx.fillRect(cx - 7, baseY - 9, 3, 2);
        break;
      }

      case PlayerDirection.RIGHT: {
        this.ctx.fillStyle = this.buckleColor;
        this.ctx.fillRect(cx + 2.5, baseY - 9, 2.5, 2);

        this.ctx.fillStyle = this.tunicColor;
        this.ctx.fillRect(cx + 4, baseY - 15, 3, 6);
        this.ctx.fillStyle = this.skinColor;
        this.ctx.fillRect(cx + 4, baseY - 9, 3, 2);
        break;
      }

      case PlayerDirection.UP: {
        this.ctx.fillStyle = this.tunicColor;
        this.ctx.fillRect(cx - 8, baseY - 15, 2, 6);
        this.ctx.fillRect(cx + 6, baseY - 15, 2, 6);
        break;
      }

      case PlayerDirection.DOWN:
      default: {
        this.ctx.fillStyle = this.buckleColor;
        this.ctx.fillRect(cx - 1.5, baseY - 9, 3, 2);

        this.ctx.fillStyle = this.tunicColor;
        this.ctx.fillRect(cx - 8, baseY - 15, 2, 5);
        this.ctx.fillRect(cx + 6, baseY - 15, 2, 5);
        this.ctx.fillStyle = this.skinColor;
        this.ctx.fillRect(cx - 8, baseY - 10, 2, 2);
        this.ctx.fillRect(cx + 6, baseY - 10, 2, 2);
        break;
      }
    }

    // 3. Cabeça e Rosto
    const headCX = cx;
    const headCY = baseY - 19;

    this.ctx.fillStyle = this.skinColor;
    this.ctx.beginPath();
    this.ctx.arc(headCX, headCY, 5.5, 0, Math.PI * 2);
    this.ctx.fill();

    switch (dir) {
      case PlayerDirection.LEFT: {
        this.ctx.fillStyle = this.hairColor;
        this.ctx.beginPath();
        this.ctx.arc(headCX + 0.5, headCY - 0.5, 5.5, Math.PI * 1.3, Math.PI * 0.5);
        this.ctx.fill();
        this.ctx.fillRect(headCX - 1, headCY - 5.5, 6, 8.5);

        this.ctx.fillStyle = this.eyeColor;
        this.ctx.fillRect(headCX - 3.5, headCY + 0.5, 2, 2);
        break;
      }

      case PlayerDirection.RIGHT: {
        this.ctx.fillStyle = this.hairColor;
        this.ctx.beginPath();
        this.ctx.arc(headCX - 0.5, headCY - 0.5, 5.5, Math.PI * 0.5, Math.PI * 1.7);
        this.ctx.fill();
        this.ctx.fillRect(headCX - 5, headCY - 5.5, 6, 8.5);

        this.ctx.fillStyle = this.eyeColor;
        this.ctx.fillRect(headCX + 1.5, headCY + 0.5, 2, 2);
        break;
      }

      case PlayerDirection.UP: {
        this.ctx.fillStyle = this.hairColor;
        this.ctx.beginPath();
        this.ctx.arc(headCX, headCY - 0.5, 5.5, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = this.hairShadowColor;
        this.ctx.beginPath();
        this.ctx.arc(headCX, headCY + 1.5, 4, Math.PI * 0.1, Math.PI * 0.9);
        this.ctx.fill();
        break;
      }

      case PlayerDirection.DOWN:
      default: {
        this.ctx.fillStyle = this.hairColor;
        this.ctx.beginPath();
        this.ctx.arc(headCX, headCY - 1, 5.5, Math.PI * 0.95, Math.PI * 2.05);
        this.ctx.fill();
        this.ctx.fillRect(headCX - 5.5, headCY - 2, 11, 3);
        this.ctx.fillRect(headCX - 5.5, headCY - 1, 2, 3);
        this.ctx.fillRect(headCX + 3.5, headCY - 1, 2, 3);

        this.ctx.fillStyle = this.eyeColor;
        this.ctx.fillRect(headCX - 3, headCY + 0.5, 2, 2);
        this.ctx.fillRect(headCX + 1, headCY + 0.5, 2, 2);
        break;
      }
    }
  }
}
