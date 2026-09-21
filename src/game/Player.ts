import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE } from './constants.ts';
import { InputSource, WorldCoord } from './types.ts';

export class Player {
  public position: WorldCoord;
  public speed: number;
  public readonly size: number;

  constructor(
    initialPosition: WorldCoord,
    speed: number = DEFAULT_PLAYER_SPEED,
    size: number = PLAYER_SIZE,
  ) {
    this.position = { ...initialPosition };
    this.speed = speed;
    this.size = size;
  }

  /**
   * Atualiza a posição do Player com base no vetor de entrada e no deltaTime,
   * garantindo movimentação com taxa independente de FPS.
   */
  public update(deltaTime: number, input: InputSource): void {
    const direction = input.getMovementDirection();

    if (direction.x !== 0 || direction.y !== 0) {
      // Garante normalização de segurança para movimentação uniforme em qualquer direção
      const length = Math.hypot(direction.x, direction.y);
      const normalizedX = length > 0 ? direction.x / length : 0;
      const normalizedY = length > 0 ? direction.y / length : 0;

      this.position.worldX += normalizedX * this.speed * deltaTime;
      this.position.worldY += normalizedY * this.speed * deltaTime;
    }
  }

  /**
   * Retorna o centro geométrico do jogador no espaço de coordenadas do mundo.
   */
  public getCenter(): WorldCoord {
    return {
      worldX: this.position.worldX + this.size / 2,
      worldY: this.position.worldY + this.size / 2,
    };
  }
}
