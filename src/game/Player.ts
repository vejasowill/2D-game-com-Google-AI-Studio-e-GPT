import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE } from './constants.ts';
import { CollisionSystem } from './CollisionSystem.ts';
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
   * Atualiza o Player no ciclo de frame.
   * Delega o cálculo de deslocamento e colisão espacial exclusivamente ao CollisionSystem.
   * O Player não possui regras sobre tipos de tiles ou walkability.
   */
  public update(
    deltaTime: number,
    input: InputSource,
    collisionSystem: CollisionSystem,
  ): void {
    const direction = input.getMovementDirection();
    collisionSystem.movePlayer(this, direction, deltaTime);
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


