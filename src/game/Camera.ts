import { ScreenCoord, ViewportSize, WorldCoord } from './types.ts';

export class Camera {
  // Ponto de foco central da câmera em coordenadas de mundo (pixels)
  public worldX: number;
  public worldY: number;

  // Taxa de suavização discreta da câmera (amortecimento exponencial estável)
  private readonly smoothingSpeed: number = 14;

  constructor(initialWorldX: number = 0, initialWorldY: number = 0) {
    this.worldX = initialWorldX;
    this.worldY = initialWorldY;
  }

  public setPosition(worldX: number, worldY: number): void {
    this.worldX = worldX;
    this.worldY = worldY;
  }

  /**
   * Interpolação suave e discreta da câmera em direção ao centro do Player.
   * Não altera a posição física do Player.
   * Totalmente compatível com espaço infinito (coordenadas negativas, distantes e entre chunks) sem clamps artificiais.
   */
  public follow(targetWorldX: number, targetWorldY: number, deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }

    const diffX = targetWorldX - this.worldX;
    const diffY = targetWorldY - this.worldY;
    const distance = Math.hypot(diffX, diffY);

    // Ajuste instantâneo para saltos grandes (spawn/teletransporte) ou intervalos grandes de frame
    if (distance > 250 || deltaTime > 0.1) {
      this.worldX = targetWorldX;
      this.worldY = targetWorldY;
      return;
    }

    // Estabilização para evitar trepidações infinitesimais
    if (distance < 0.05) {
      this.worldX = targetWorldX;
      this.worldY = targetWorldY;
      return;
    }

    const factor = 1 - Math.exp(-this.smoothingSpeed * deltaTime);
    this.worldX += diffX * factor;
    this.worldY += diffY * factor;
  }

  /**
   * Conversão explícita: Coordenadas de Mundo (pixels) -> Coordenadas de Tela (pixels).
   * O ponto central da câmera (worldX, worldY) é projetado no centro geométrico da viewport.
   */
  public worldToScreen(worldCoord: WorldCoord, viewport: ViewportSize): ScreenCoord {
    return {
      screenX: Math.floor(worldCoord.worldX - this.worldX + viewport.width / 2),
      screenY: Math.floor(worldCoord.worldY - this.worldY + viewport.height / 2),
    };
  }

  /**
   * Conversão explícita: Coordenadas de Tela (pixels) -> Coordenadas de Mundo (pixels).
   */
  public screenToWorld(screenCoord: ScreenCoord, viewport: ViewportSize): WorldCoord {
    return {
      worldX: screenCoord.screenX - viewport.width / 2 + this.worldX,
      worldY: screenCoord.screenY - viewport.height / 2 + this.worldY,
    };
  }
}
