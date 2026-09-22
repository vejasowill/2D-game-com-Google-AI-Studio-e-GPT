import { Camera } from './Camera.ts';
import { Player, PlayerDirection } from './Player.ts';
import { PlayerSpriteSheetDefinition, VisualBounds } from './PlayerVisual.ts';
import { ViewportSize } from './types.ts';

/**
 * Renderizador responsável exclusivamente pela apresentação gráfica do Player.
 * Desacopla a camada visual das regras de física, colisão e gerenciamento do mundo.
 * Projetado para suportar sprites pixel art 32×64 px no futuro sem alterações estruturais.
 */
export class PlayerRenderer {
  // Paleta da representação procedural (aventureiro top-down)
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

  /** Definição opcional de spritesheet quando sprites pixel art reais forem integrados futuramente */
  public spriteSheet: PlayerSpriteSheetDefinition | null = null;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

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
    // (com altura visual expandida de 64px e margem de segurança)
    const margin = 16;
    if (
      cx + visualBounds.width / 2 + margin < 0 ||
      cx - visualBounds.width / 2 - margin > screenWidth ||
      baseY + margin < 0 ||
      baseY - visualBounds.height - margin > screenHeight
    ) {
      return;
    }

    // 1. Sombra elíptica no solo (ancorada na linha física dos pés)
    this.renderShadow(cx, baseY);

    // 2. Se houver um spritesheet com imagem real carregada, desenha o frame animado
    if (this.spriteSheet && this.spriteSheet.imageSource) {
      this.renderSpriteFrame(player, cx, baseY, visualBounds);
      return;
    }

    // 3. Fallback / Placeholder vetorial atual: preserva o visual procedural do aventureiro
    this.renderProceduralCharacter(player, cx, baseY);
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
   * Renderiza um frame do spritesheet (preparação para futura integração de arte pixel art).
   */
  private renderSpriteFrame(
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

    const drawX = cx - visualBounds.width * player.visualConfig.anchorX;
    const drawY = baseY - visualBounds.height * player.visualConfig.anchorY;

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
