import { AnimationDefinition, SpriteFrame } from './SpriteAnimation.ts';

/**
 * Definição completa e estruturada de um Spritesheet.
 * Centraliza os metadados de resolução nativa, imagem fonte e coleção de animações.
 */
export interface SpriteSheetDefinition {
  /** Identificador único do spritesheet no AssetManager (ex: 'player', 'tree_oak', 'boar') */
  readonly id: string;
  /** Caminho relativo ou URL do asset de imagem (ex: '/assets/player/player.png') */
  readonly imagePath?: string;
  /** Imagem carregada disponível em runtime para o Canvas (ou null se ainda usando fallback técnico) */
  imageSource: CanvasImageSource | null;
  /** Largura nativa de cada frame na imagem em pixels (ex: 32) */
  readonly frameWidth: number;
  /** Altura nativa de cada frame na imagem em pixels (ex: 64) */
  readonly frameHeight: number;
  /** Coleção de animações disponíveis neste spritesheet indexadas por nome */
  readonly animations: Readonly<Record<string, AnimationDefinition>>;

  /**
   * Obtém a definição de uma animação registrada.
   */
  getAnimation(name: string): AnimationDefinition | undefined;

  /**
   * Resolve diretamente um frame específico a partir de animação, direção e índice.
   */
  getFrame(animationName: string, direction?: string, frameIndex?: number): SpriteFrame | null;
}

/**
 * Classe padrão que implementa SpriteSheetDefinition.
 */
export class SpriteSheet implements SpriteSheetDefinition {
  public imageSource: CanvasImageSource | null = null;

  constructor(
    public readonly id: string,
    public readonly frameWidth: number,
    public readonly frameHeight: number,
    public readonly animations: Record<string, AnimationDefinition>,
    public readonly imagePath?: string,
    imageSource?: CanvasImageSource | null,
  ) {
    if (imageSource) {
      this.imageSource = imageSource;
    }
  }

  public getAnimation(name: string): AnimationDefinition | undefined {
    return this.animations[name];
  }

  public getFrame(
    animationName: string,
    direction: string = 'down',
    frameIndex: number = 0,
  ): SpriteFrame | null {
    const anim = this.getAnimation(animationName);
    if (!anim) return null;

    let frames: readonly SpriteFrame[] | undefined;
    if (anim.directionalFrames) {
      frames = anim.directionalFrames[direction] ?? anim.directionalFrames['down'];
    } else {
      frames = anim.frames;
    }

    if (!frames || frames.length === 0) return null;
    const clampedIndex = Math.min(Math.max(0, frameIndex), frames.length - 1);
    return frames[clampedIndex] ?? null;
  }
}

/**
 * Configuração auxiliar para geração automática de animações organizadas em grade padrão top-down.
 */
export interface GridSpriteSheetOptions {
  id: string;
  imagePath?: string;
  imageSource?: CanvasImageSource | null;
  frameWidth: number;
  frameHeight: number;
  /**
   * Definição das animações no grid.
   * Exemplo:
   * {
   *   idle: { rowStart: 0, frameCount: 2, frameDuration: 0.5, hasDirections: true },
   *   walk: { rowStart: 4, frameCount: 4, frameDuration: 0.15, hasDirections: true }
   * }
   * Se hasDirections = true, utiliza 4 linhas consecutivas para as direções ['down', 'up', 'left', 'right'].
   */
  animationConfigs: Record<
    string,
    {
      rowStart: number;
      frameCount: number;
      frameDuration: number;
      hasDirections?: boolean;
      loop?: boolean;
    }
  >;
}

/**
 * Helper declarativo que gera um SpriteSheet completo com cálculo automático de recortes (sx, sy, sWidth, sHeight)
 * para grades clássicas de Pixel Art.
 */
export function createGridSpriteSheet(options: GridSpriteSheetOptions): SpriteSheet {
  const directions = ['down', 'up', 'left', 'right'] as const;
  const animations: Record<string, AnimationDefinition> = {};

  for (const [animName, cfg] of Object.entries(options.animationConfigs)) {
    if (cfg.hasDirections) {
      const directionalFrames: Record<string, SpriteFrame[]> = {};
      directions.forEach((dir, dirIndex) => {
        const row = cfg.rowStart + dirIndex;
        const frames: SpriteFrame[] = [];
        for (let col = 0; col < cfg.frameCount; col++) {
          frames.push({
            sx: col * options.frameWidth,
            sy: row * options.frameHeight,
            sWidth: options.frameWidth,
            sHeight: options.frameHeight,
          });
        }
        directionalFrames[dir] = frames;
      });

      animations[animName] = {
        name: animName,
        frameDuration: cfg.frameDuration,
        loop: cfg.loop ?? true,
        directionalFrames,
      };
    } else {
      const frames: SpriteFrame[] = [];
      for (let col = 0; col < cfg.frameCount; col++) {
        frames.push({
          sx: col * options.frameWidth,
          sy: cfg.rowStart * options.frameHeight,
          sWidth: options.frameWidth,
          sHeight: options.frameHeight,
        });
      }

      animations[animName] = {
        name: animName,
        frameDuration: cfg.frameDuration,
        loop: cfg.loop ?? true,
        frames,
      };
    }
  }

  return new SpriteSheet(
    options.id,
    options.frameWidth,
    options.frameHeight,
    animations,
    options.imagePath,
    options.imageSource,
  );
}

/**
 * Helper para criar uma definição de spritesheet estático de frame único (ex: árvores, rochas, itens).
 */
export function createStaticSpriteSheet(
  id: string,
  width: number,
  height: number,
  imagePath?: string,
  imageSource?: CanvasImageSource | null,
): SpriteSheet {
  const singleFrame: SpriteFrame = {
    sx: 0,
    sy: 0,
    sWidth: width,
    sHeight: height,
  };

  const animations: Record<string, AnimationDefinition> = {
    default: {
      name: 'default',
      frameDuration: 1.0,
      loop: true,
      frames: [singleFrame],
    },
  };

  return new SpriteSheet(id, width, height, animations, imagePath, imageSource);
}
