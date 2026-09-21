import { GameLoop } from './GameLoop.ts';
import { Renderer } from './Renderer.ts';

export class Game {
  private renderer: Renderer;
  private loop: GameLoop;
  private resizeObserver: ResizeObserver | null = null;
  private handleWindowResize: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);

    this.loop = new GameLoop({
      update: (dt: number) => this.update(dt),
      render: () => this.render(),
    });

    this.setupResize(canvas);
  }

  public start(): void {
    this.loop.start();
  }

  public stop(): void {
    this.loop.stop();
  }

  public destroy(): void {
    this.stop();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.handleWindowResize) {
      window.removeEventListener('resize', this.handleWindowResize);
      this.handleWindowResize = null;
    }
  }

  private update(_deltaTime: number): void {
    // Game logic update (state, entities, world simulation)
    // Kept minimal for this initial validation step
  }

  private render(): void {
    // Render layer pass
    this.renderer.render();
  }

  private setupResize(canvas: HTMLCanvasElement): void {
    this.handleWindowResize = () => {
      this.renderer.resize();
    };
    window.addEventListener('resize', this.handleWindowResize);

    if (canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        this.renderer.resize();
      });
      this.resizeObserver.observe(canvas.parentElement);
    }
  }
}
