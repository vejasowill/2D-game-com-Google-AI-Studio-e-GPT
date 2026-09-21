import { TILE_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { GameLoop } from './GameLoop.ts';
import { Renderer } from './Renderer.ts';
import { World } from './World.ts';

export class Game {
  private world: World;
  private camera: Camera;
  private renderer: Renderer;
  private loop: GameLoop;
  private resizeObserver: ResizeObserver | null = null;
  private handleWindowResize: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.world = new World();

    // Centralizar câmera no mundo de tiles (coordenadas do mundo em pixels)
    const worldPixelWidth = this.world.width * TILE_SIZE;
    const worldPixelHeight = this.world.height * TILE_SIZE;
    this.camera = new Camera(worldPixelWidth / 2, worldPixelHeight / 2);

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
    // Atualizações de lógica do mundo (vazia nesta etapa conceitual)
  }

  private render(): void {
    // Renderiza o mundo através da câmera no canvas
    this.renderer.render(this.world, this.camera);
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
