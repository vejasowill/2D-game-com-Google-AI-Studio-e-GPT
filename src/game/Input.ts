import { InputSource, Vector2D } from './types.ts';

export class Input implements InputSource {
  private activeKeys: Set<string> = new Set();
  private justPressedKeys: Set<string> = new Set();
  private handleKeyDown: (event: KeyboardEvent) => void;
  private handleKeyUp: (event: KeyboardEvent) => void;

  /** Mapeamento de ações abstratas para teclas físicas e lógicas */
  private actionBindings: Record<string, string[]> = {
    interact: ['KeyE', 'e', 'Space', ' ', 'Enter'],
  };

  constructor() {
    this.handleKeyDown = (event: KeyboardEvent) => {
      // Evita interceptar teclas caso o foco esteja em um input do DOM
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      const code = event.code;
      const key = event.key.toLowerCase();

      // Apenas marca como justPressed no momento inicial em que a tecla é abaixada
      // Impede que o auto-repeat do sistema operacional gere múltiplos justPressed
      if (!this.activeKeys.has(code) && !this.activeKeys.has(key)) {
        this.justPressedKeys.add(code);
        this.justPressedKeys.add(key);
      }

      this.activeKeys.add(code);
      this.activeKeys.add(key);
    };

    this.handleKeyUp = (event: KeyboardEvent) => {
      const code = event.code;
      const key = event.key.toLowerCase();

      this.activeKeys.delete(code);
      this.activeKeys.delete(key);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
    }
  }

  private isPressed(...keys: string[]): boolean {
    return keys.some((k) => this.activeKeys.has(k));
  }

  /**
   * Retorna o vetor direcional normalizado da intenção de movimento.
   */
  public getMovementDirection(): Vector2D {
    let dx = 0;
    let dy = 0;

    // Cima: W ou ArrowUp
    if (this.isPressed('KeyW', 'ArrowUp', 'w', 'arrowup')) {
      dy -= 1;
    }

    // Baixo: S ou ArrowDown
    if (this.isPressed('KeyS', 'ArrowDown', 's', 'arrowdown')) {
      dy += 1;
    }

    // Esquerda: A ou ArrowLeft
    if (this.isPressed('KeyA', 'ArrowLeft', 'a', 'arrowleft')) {
      dx -= 1;
    }

    // Direita: D ou ArrowRight
    if (this.isPressed('KeyD', 'ArrowRight', 'd', 'arrowright')) {
      dx += 1;
    }

    // Normalização para movimento diagonal uniforme
    if (dx !== 0 && dy !== 0) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
    }

    return { x: dx, y: dy };
  }

  /**
   * Verifica se a ação abstrata está continuamente pressionada (held).
   */
  public isActionPressed(action: string): boolean {
    const keys = this.actionBindings[action] || [action];
    return keys.some((k) => this.activeKeys.has(k));
  }

  /**
   * Verifica se a ação abstrata foi acionada neste frame específico (discreta / just pressed).
   * Impede interações repetidas contínuas enquanto a tecla permanece segurada.
   */
  public isActionJustPressed(action: string): boolean {
    const keys = this.actionBindings[action] || [action];
    return keys.some((k) => this.justPressedKeys.has(k));
  }

  /**
   * Limpa o estado transitório de teclas pressionadas no frame.
   * Chamado ao final de cada frame no GameLoop.
   */
  public clearFrameState(): void {
    this.justPressedKeys.clear();
  }

  /**
   * Permite configurar teclas vinculadas a uma ação abstrata.
   */
  public setActionBinding(action: string, keys: string[]): void {
    this.actionBindings[action] = [...keys];
  }

  /**
   * Simulação programática de tecla pressionada (útil para testes unitários / automação).
   */
  public triggerKeyDown(keyOrCode: string): void {
    const lower = keyOrCode.toLowerCase();
    if (!this.activeKeys.has(keyOrCode) && !this.activeKeys.has(lower)) {
      this.justPressedKeys.add(keyOrCode);
      this.justPressedKeys.add(lower);
    }
    this.activeKeys.add(keyOrCode);
    this.activeKeys.add(lower);
  }

  /**
   * Simulação programática de tecla solta.
   */
  public triggerKeyUp(keyOrCode: string): void {
    const lower = keyOrCode.toLowerCase();
    this.activeKeys.delete(keyOrCode);
    this.activeKeys.delete(lower);
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }
    this.activeKeys.clear();
    this.justPressedKeys.clear();
  }
}
