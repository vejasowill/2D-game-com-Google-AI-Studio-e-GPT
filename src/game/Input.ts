import { InputSource, Vector2D } from './types.ts';

export class Input implements InputSource {
  private activeKeys: Set<string> = new Set();
  private handleKeyDown: (event: KeyboardEvent) => void;
  private handleKeyUp: (event: KeyboardEvent) => void;

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

      this.activeKeys.add(event.code);
      this.activeKeys.add(event.key.toLowerCase());
    };

    this.handleKeyUp = (event: KeyboardEvent) => {
      this.activeKeys.delete(event.code);
      this.activeKeys.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
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

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.activeKeys.clear();
  }
}
