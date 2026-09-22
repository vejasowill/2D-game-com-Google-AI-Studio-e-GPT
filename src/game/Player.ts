import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE } from './constants.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { InputSource, WorldCoord } from './types.ts';

export enum PlayerDirection {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
}

export class Player {
  public position: WorldCoord;
  public speed: number;
  public readonly size: number;
  public direction: PlayerDirection = PlayerDirection.DOWN;
  public isMoving: boolean = false;

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
   * Atualiza a orientação visual apenas quando existir movimento ou intenção significativa (acima de EPSILON).
   * Se estiver parado, preserva estritamente a última direção conhecida.
   */
  public update(
    deltaTime: number,
    input: InputSource,
    collisionSystem: CollisionSystem,
  ): void {
    const direction = input.getMovementDirection();
    const prevX = this.position.worldX;
    const prevY = this.position.worldY;

    collisionSystem.movePlayer(this, direction, deltaTime);

    const deltaX = this.position.worldX - prevX;
    const deltaY = this.position.worldY - prevY;
    const movedDistance = Math.hypot(deltaX, deltaY);
    const inputMagnitude = Math.hypot(direction.x, direction.y);

    const EPSILON = 1e-4;
    this.isMoving = movedDistance > EPSILON;

    // Atualiza a orientação visual com base na intenção de entrada ou deslocamento real
    if (inputMagnitude > EPSILON) {
      if (Math.abs(direction.x) > Math.abs(direction.y)) {
        this.direction = direction.x > 0 ? PlayerDirection.RIGHT : PlayerDirection.LEFT;
      } else {
        this.direction = direction.y > 0 ? PlayerDirection.DOWN : PlayerDirection.UP;
      }
    } else if (movedDistance > EPSILON) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.direction = deltaX > 0 ? PlayerDirection.RIGHT : PlayerDirection.LEFT;
      } else {
        this.direction = deltaY > 0 ? PlayerDirection.DOWN : PlayerDirection.UP;
      }
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


