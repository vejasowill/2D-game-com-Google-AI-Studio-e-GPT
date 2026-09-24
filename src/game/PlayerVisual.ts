import { PlayerDirection } from './Player.ts';
import { SpriteFrame } from './SpriteAnimation.ts';
import { WorldCoord } from './types.ts';
import {
  ANCHOR_FEET,
  VisualBounds,
  VisualConfig,
  calculateEntityVisualBounds,
} from './VisualAnchor.ts';

// Reexportações para compatibilidade arquitetural ampla
export { ANCHOR_FEET, calculateEntityVisualBounds };
export type { VisualBounds, VisualConfig };

/**
 * Configuração de dimensões visuais e ponto de ancoragem do Player.
 * Permite separar a representação gráfica (ex: sprite 32×64 px) da hitbox física (ex: 24×24 px).
 */
export interface PlayerVisualConfig extends VisualConfig {
  readonly visualWidth: number;
  readonly visualHeight: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly scale?: number;
}

/**
 * Configuração visual padrão preparada para receber sprites 32×64 px (1×2 tiles de 32px),
 * com ancoragem centralizada no eixo X (0.5) e alinhada à linha dos pés no eixo Y (1.0).
 */
export const DEFAULT_PLAYER_VISUAL_CONFIG: PlayerVisualConfig = {
  visualWidth: 32,
  visualHeight: 64,
  anchorX: ANCHOR_FEET.anchorX,
  anchorY: ANCHOR_FEET.anchorY,
  scale: 1.0,
};

/**
 * Calcula os limites visuais (bounding box) da renderização a partir da posição física
 * e da ancoragem dos pés. Função pura e determinística.
 *
 * @param position Posição física superior-esquerda da hitbox do Player.
 * @param physicalSize Tamanho da hitbox física do Player (ex: 24px).
 * @param config Configuração de dimensões visuais e ancoragem.
 */
export function calculatePlayerVisualBounds(
  position: WorldCoord,
  physicalSize: number,
  config: PlayerVisualConfig = DEFAULT_PLAYER_VISUAL_CONFIG,
): VisualBounds {
  return calculateEntityVisualBounds(position, physicalSize, physicalSize, config);
}

/**
 * Estados fundamentais de ação do personagem na camada de gameplay.
 */
export enum PlayerActionState {
  IDLE = 'idle',
  WALK = 'walk',
  USE_ITEM = 'use_item',
  HARVEST = 'harvest',
}

/**
 * Representação imutável de uma ação temporária de ferramenta ou item em execução pelo Player.
 * Totalmente desacoplada de contagem fixa de frames de sprite ou dimensões de hitbox.
 */
export interface PlayerActiveAction {
  /** Identificador canônico da ação sendo executada (ex: 'chop', 'mine', 'attack') */
  readonly action: string;
  /** Identificador do item utilizado (ex: 'axe') */
  readonly itemId: string;
  /** Duração total da ação em segundos (ex: 0.4s) */
  readonly duration: number;
  /** Tempo já decorrido desde o início da ação em segundos */
  readonly elapsedTime: number;
  /** Progresso normalizado da ação entre 0.0 (início) e 1.0 (conclusão) */
  readonly progress: number;
  /** Direção cardinal em que o jogador estava virado ao disparar a ação */
  readonly direction: PlayerDirection;
}

/**
 * Parâmetros de temporização da animação do personagem.
 */
export interface PlayerAnimationConfig {
  readonly idleFramesCount: number;
  readonly walkFramesCount: number;
  readonly idleFrameDuration: number;
  readonly walkFrameDuration: number;
  readonly useItemFramesCount?: number;
  readonly useItemFrameDuration?: number;
}

export const DEFAULT_PLAYER_ANIMATION_CONFIG: PlayerAnimationConfig = {
  idleFramesCount: 2,
  walkFramesCount: 4,
  useItemFramesCount: 4,
  idleFrameDuration: 0.5,
  walkFrameDuration: 0.15,
  useItemFrameDuration: 0.1,
};

/**
 * Gerenciador determinístico de estado e ciclo de frames de animação do Player.
 * Baseado estritamente em deltaTime, isMoving e na direção atual.
 */
export class PlayerAnimationState {
  private timer: number = 0;
  public currentFrame: number = 0;
  private lastIsMoving: boolean = false;

  constructor(public readonly config: PlayerAnimationConfig = DEFAULT_PLAYER_ANIMATION_CONFIG) {}

  /**
   * Atualiza o ciclo de frame de forma determinística com base no tempo decorrido.
   */
  public update(deltaTime: number, isMoving: boolean): void {
    if (isMoving !== this.lastIsMoving) {
      // Transição de estado (parou ou começou a mover): reinicia ciclo de frame imediatamente
      this.timer = 0;
      this.currentFrame = 0;
      this.lastIsMoving = isMoving;
      return;
    }

    if (deltaTime <= 0) {
      return;
    }

    const duration = isMoving ? this.config.walkFrameDuration : this.config.idleFrameDuration;
    const totalFrames = isMoving ? this.config.walkFramesCount : this.config.idleFramesCount;

    if (totalFrames <= 1 || duration <= 0) {
      this.currentFrame = 0;
      return;
    }

    this.timer += deltaTime;
    if (this.timer >= duration) {
      const steps = Math.floor(this.timer / duration);
      this.timer -= steps * duration;
      this.currentFrame = (this.currentFrame + steps) % totalFrames;
    }
  }

  /**
   * Reinicia o estado de animação.
   */
  public reset(): void {
    this.timer = 0;
    this.currentFrame = 0;
    this.lastIsMoving = false;
  }
}

/**
 * Retângulo de recorte de um frame no spritesheet fonte.
 */
export type SpriteFrameRect = SpriteFrame;

/**
 * Abstração de spritesheet para quando sprites pixel art reais forem introduzidos futuramente.
 * Permite selecionar o retângulo de recorte (sx, sy, sWidth, sHeight) com base em
 * direção, estado de movimento e índice do frame de animação.
 */
export interface PlayerSpriteSheetDefinition {
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly imageSource?: CanvasImageSource | null;
  getFrameRect(direction: PlayerDirection, isMoving: boolean, frameIndex: number): SpriteFrame;
}
