import { PlayerDirection } from './Player.ts';
import { WorldCoord } from './types.ts';

/**
 * Configuração de dimensões visuais e ponto de ancoragem do Player.
 * Permite separar a representação gráfica (ex: sprite 32×64 px) da hitbox física (ex: 24×24 px).
 */
export interface PlayerVisualConfig {
  /** Largura do sprite/representação visual em pixels no mundo (ex: 32) */
  readonly visualWidth: number;
  /** Altura do sprite/representação visual em pixels no mundo (ex: 64) */
  readonly visualHeight: number;
  /**
   * Ponto de ancoragem horizontal relativo [0.0 = esquerda, 0.5 = centro, 1.0 = direita].
   * O padrão 0.5 centraliza o sprite com a linha média da hitbox física.
   */
  readonly anchorX: number;
  /**
   * Ponto de ancoragem vertical relativo [0.0 = topo, 1.0 = base dos pés].
   * O padrão 1.0 fixa a base inferior do sprite diretamente na linha dos pés física do personagem.
   */
  readonly anchorY: number;
}

/**
 * Configuração visual padrão preparada para receber sprites 32×64 px (1×2 tiles de 32px),
 * com ancoragem centralizada no eixo X (0.5) e alinhada à linha dos pés no eixo Y (1.0).
 */
export const DEFAULT_PLAYER_VISUAL_CONFIG: PlayerVisualConfig = {
  visualWidth: 32,
  visualHeight: 64,
  anchorX: 0.5,
  anchorY: 1.0,
};

/**
 * Limites da caixa delimitadora visual no espaço do mundo.
 */
export interface VisualBounds {
  readonly worldX: number;
  readonly worldY: number;
  readonly width: number;
  readonly height: number;
}

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
  // Ponto de referência absoluto do solo / base dos pés do personagem
  const footBaseX = position.worldX + physicalSize / 2;
  const footBaseY = position.worldY + physicalSize;

  // O sprite é posicionado de modo que seu ponto (anchorX, anchorY) coincida com (footBaseX, footBaseY)
  const worldX = footBaseX - config.visualWidth * config.anchorX;
  const worldY = footBaseY - config.visualHeight * config.anchorY;

  return {
    worldX,
    worldY,
    width: config.visualWidth,
    height: config.visualHeight,
  };
}

/**
 * Parâmetros de temporização da animação do personagem.
 */
export interface PlayerAnimationConfig {
  /** Quantidade de frames na animação de repouso (idle) */
  readonly idleFramesCount: number;
  /** Quantidade de frames na animação de caminhada (walk) */
  readonly walkFramesCount: number;
  /** Duração de cada frame de idle em segundos */
  readonly idleFrameDuration: number;
  /** Duração de cada frame de caminhada em segundos */
  readonly walkFrameDuration: number;
}

export const DEFAULT_PLAYER_ANIMATION_CONFIG: PlayerAnimationConfig = {
  idleFramesCount: 2,
  walkFramesCount: 4,
  idleFrameDuration: 0.5,
  walkFrameDuration: 0.15,
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
export interface SpriteFrameRect {
  readonly sx: number;
  readonly sy: number;
  readonly sWidth: number;
  readonly sHeight: number;
}

/**
 * Abstração de spritesheet para quando sprites pixel art reais forem introduzidos futuramente.
 * Permite selecionar o retângulo de recorte (sx, sy, sWidth, sHeight) com base em
 * direção, estado de movimento e índice do frame de animação.
 */
export interface PlayerSpriteSheetDefinition {
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly imageSource?: CanvasImageSource | null;
  getFrameRect(direction: PlayerDirection, isMoving: boolean, frameIndex: number): SpriteFrameRect;
}
