import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE } from './constants.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import {
  DEFAULT_PLAYER_VISUAL_CONFIG,
  PlayerAnimationState,
  PlayerVisualConfig,
  VisualBounds,
  calculatePlayerVisualBounds,
} from './PlayerVisual.ts';
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

  /** Configuração das dimensões visuais e ancoragem gráfica (independente da hitbox física) */
  public visualConfig: PlayerVisualConfig = DEFAULT_PLAYER_VISUAL_CONFIG;

  /** Gerenciador de estado e ciclo de frames de animação */
  public readonly animationState: PlayerAnimationState = new PlayerAnimationState();

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
   * Atualiza o ciclo de frames da animação de forma determinística com o deltaTime.
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

    // Avança a máquina de estados de animação determinística
    this.animationState.update(deltaTime, this.isMoving);
  }

  /**
   * Retorna a coordenada Y global da linha de base dos pés do jogador.
   * Este é o ponto fundamental de ancoragem física no solo e critério estrito de Y-sorting.
   * Não é afetado por qualquer expansão na altura gráfica do sprite.
   */
  public getFootBaseY(): number {
    return this.position.worldY + this.size;
  }

  /**
   * Retorna a posição central dos pés do jogador no plano do solo em coordenadas mundiais.
   */
  public getFootPosition(): WorldCoord {
    return {
      worldX: this.position.worldX + this.size / 2,
      worldY: this.position.worldY + this.size,
    };
  }

  /**
   * Retorna os limites visuais (bounding box) da renderização gráfica do jogador,
   * calculados a partir da linha de base dos pés e da configuração visual ativa.
   */
  public getVisualBounds(config: PlayerVisualConfig = this.visualConfig): VisualBounds {
    return calculatePlayerVisualBounds(this.position, this.size, config);
  }

  /**
   * Retorna o centro geométrico da hitbox física do jogador no espaço de coordenadas do mundo.
   * Utilizado pelo sistema de acompanhamento da câmera para manter o foco inalterado.
   */
  public getCenter(): WorldCoord {
    return {
      worldX: this.position.worldX + this.size / 2,
      worldY: this.position.worldY + this.size / 2,
    };
  }
}


