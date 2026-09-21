import { ScreenCoord, ViewportSize, WorldCoord } from './types.ts';

export class Camera {
  // Ponto de foco central da câmera em coordenadas de mundo (pixels)
  public worldX: number;
  public worldY: number;

  constructor(initialWorldX: number = 0, initialWorldY: number = 0) {
    this.worldX = initialWorldX;
    this.worldY = initialWorldY;
  }

  public setPosition(worldX: number, worldY: number): void {
    this.worldX = worldX;
    this.worldY = worldY;
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
