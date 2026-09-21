import { Vector2D } from './types.ts';

export class Camera {
  public x: number;
  public y: number;

  constructor(initialX: number = 0, initialY: number = 0) {
    this.x = initialX;
    this.y = initialY;
  }

  public setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /**
   * Converte coordenadas do mundo em coordenadas da tela (viewport).
   * O ponto central da tela corresponde à posição (x, y) da câmera no mundo.
   */
  public worldToScreen(
    worldX: number,
    worldY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): Vector2D {
    return {
      x: Math.floor(worldX - this.x + viewportWidth / 2),
      y: Math.floor(worldY - this.y + viewportHeight / 2),
    };
  }

  /**
   * Converte coordenadas da tela (ex: clique ou cursor) em coordenadas do mundo.
   */
  public screenToWorld(
    screenX: number,
    screenY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): Vector2D {
    return {
      x: screenX - viewportWidth / 2 + this.x,
      y: screenY - viewportHeight / 2 + this.y,
    };
  }
}
