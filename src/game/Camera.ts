import { ScreenCoord, ViewportSize, WorldBounds, WorldCoord } from './types.ts';

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
   * Limita a posição da câmera aos limites espaciais do mundo.
   * Se a viewport for maior ou igual ao mundo em qualquer uma das dimensões,
   * a câmera permanece centralizada nessa dimensão, prevenindo clamps inválidos.
   */
  public clampToBounds(bounds: WorldBounds, viewport: ViewportSize): void {
    // Eixo horizontal (X)
    if (bounds.width <= viewport.width) {
      this.worldX = bounds.minX + bounds.width / 2;
    } else {
      const minCameraX = bounds.minX + viewport.width / 2;
      const maxCameraX = bounds.maxX - viewport.width / 2;
      this.worldX = Math.max(minCameraX, Math.min(this.worldX, maxCameraX));
    }

    // Eixo vertical (Y)
    if (bounds.height <= viewport.height) {
      this.worldY = bounds.minY + bounds.height / 2;
    } else {
      const minCameraY = bounds.minY + viewport.height / 2;
      const maxCameraY = bounds.maxY - viewport.height / 2;
      this.worldY = Math.max(minCameraY, Math.min(this.worldY, maxCameraY));
    }
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
