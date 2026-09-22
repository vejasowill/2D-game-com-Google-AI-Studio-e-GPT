/**
 * Coordenadas de recorte de um frame retangular na imagem do spritesheet fonte.
 */
export interface SpriteFrame {
  /** Coordenada X inicial de recorte na imagem fonte (em pixels nativos do arquivo) */
  readonly sx: number;
  /** Coordenada Y inicial de recorte na imagem fonte (em pixels nativos do arquivo) */
  readonly sy: number;
  /** Largura do recorte na imagem fonte (em pixels nativos do arquivo) */
  readonly sWidth: number;
  /** Altura do recorte na imagem fonte (em pixels nativos do arquivo) */
  readonly sHeight: number;
}

/**
 * Definição declarativa e data-driven de uma animação.
 * Suporta sequências lineares de frames ou sequências particionadas por direção ('down', 'up', 'left', 'right', etc.).
 */
export interface AnimationDefinition {
  /** Nome identificador da animação (ex: 'idle', 'walk', 'run', 'attack') */
  readonly name: string;
  /** Duração em segundos de cada frame individual (ex: 0.15 para 150ms) */
  readonly frameDuration: number;
  /** Se a animação reinicia em loop contínuo ao atingir o último frame (padrão: true) */
  readonly loop?: boolean;
  /**
   * Lista linear de frames para animações sem variação de direção (ex: efeitos, tochas, itens no chão).
   */
  readonly frames?: readonly SpriteFrame[];
  /**
   * Mapeamento de frames por direção cardinal/ordinal para personagens, monstros e animais.
   * Chaves típicas: 'down', 'up', 'left', 'right'
   */
  readonly directionalFrames?: Readonly<Record<string, readonly SpriteFrame[]>>;
}

/**
 * Parâmetros de inicialização do estado de animação.
 */
export interface AnimationStateOptions {
  initialAnimation?: string;
  initialDirection?: string;
  speedMultiplier?: number;
}

/**
 * Gerenciador determinístico de estado de animação em tempo de execução.
 * Isolado de regras de física e rendering: avança estritamente por deltaTime e dados configurados.
 * Nenhuma chamada a Math.random(), garantindo reprodução consistente frame a frame.
 */
export class AnimationState {
  public animationName: string;
  public direction: string;
  public elapsedTime: number = 0;
  public currentFrameIndex: number = 0;
  public isFinished: boolean = false;
  public speedMultiplier: number = 1.0;

  private lastAnimationName: string;
  private lastDirection: string;

  constructor(options?: AnimationStateOptions) {
    this.animationName = options?.initialAnimation ?? 'idle';
    this.direction = options?.initialDirection ?? 'down';
    this.speedMultiplier = options?.speedMultiplier ?? 1.0;
    this.lastAnimationName = this.animationName;
    this.lastDirection = this.direction;
  }

  /**
   * Comanda a transição para uma animação e/ou direção.
   * Se os valores mudarem, reseta o ciclo para o primeiro frame determinísticamente.
   */
  public play(animationName: string, direction?: string, forceReset: boolean = false): void {
    const dir = direction ?? this.direction;
    const changed = animationName !== this.lastAnimationName || dir !== this.lastDirection;

    if (changed || forceReset) {
      this.animationName = animationName;
      this.direction = dir;
      this.elapsedTime = 0;
      this.currentFrameIndex = 0;
      this.isFinished = false;
      this.lastAnimationName = animationName;
      this.lastDirection = dir;
    }
  }

  /**
   * Atualiza o temporizador e o índice do frame atual com base no tempo decorrido.
   *
   * @param deltaTime Tempo decorrido em segundos desde o último frame (fornecido pelo GameLoop).
   * @param animationDef Definição declarativa da animação atual (obtida do SpriteSheet).
   */
  public update(deltaTime: number, animationDef?: AnimationDefinition): void {
    if (deltaTime <= 0 || !animationDef) {
      return;
    }

    const frames = this.getFramesList(animationDef);
    const totalFrames = frames.length;

    // Caso de entidade estática ou animação com apenas 1 frame
    if (totalFrames <= 1) {
      this.currentFrameIndex = 0;
      this.isFinished = true;
      return;
    }

    const duration = animationDef.frameDuration > 0 ? animationDef.frameDuration : 0.1;
    const loop = animationDef.loop !== false; // Padrão: true

    this.elapsedTime += deltaTime * this.speedMultiplier;

    if (this.elapsedTime >= duration) {
      const steps = Math.floor(this.elapsedTime / duration);
      this.elapsedTime -= steps * duration;

      if (loop) {
        this.currentFrameIndex = (this.currentFrameIndex + steps) % totalFrames;
      } else {
        const nextIndex = this.currentFrameIndex + steps;
        if (nextIndex >= totalFrames - 1) {
          this.currentFrameIndex = totalFrames - 1;
          this.isFinished = true;
        } else {
          this.currentFrameIndex = nextIndex;
        }
      }
    }
  }

  /**
   * Retorna as coordenadas de recorte (SpriteFrame) correspondentes ao frame atual da animação ativa.
   */
  public getCurrentFrame(animationDef?: AnimationDefinition): SpriteFrame | null {
    if (!animationDef) return null;
    const frames = this.getFramesList(animationDef);
    if (frames.length === 0) return null;
    const index = Math.min(Math.max(0, this.currentFrameIndex), frames.length - 1);
    return frames[index] ?? null;
  }

  /**
   * Reinicia completamente o estado da animação.
   */
  public reset(): void {
    this.elapsedTime = 0;
    this.currentFrameIndex = 0;
    this.isFinished = false;
  }

  /**
   * Extrai a lista de frames apropriada da definição (considerando a direção ativa).
   */
  private getFramesList(animationDef: AnimationDefinition): readonly SpriteFrame[] {
    if (animationDef.directionalFrames) {
      const dirFrames = animationDef.directionalFrames[this.direction];
      if (dirFrames && dirFrames.length > 0) {
        return dirFrames;
      }
      // Fallback para 'down' se a direção específica não existir no mapa
      if (animationDef.directionalFrames['down']) {
        return animationDef.directionalFrames['down'];
      }
    }
    return animationDef.frames ?? [];
  }
}
