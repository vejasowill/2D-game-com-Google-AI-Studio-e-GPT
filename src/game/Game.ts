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
    // 1. Instanciar o World (dados dos tiles)
    this.world = new World();

    // 2. Centralizar a Camera no centro lógico do mundo (calculado dinamicamente a partir de World e TILE_SIZE)
    const worldCenterX = this.world.getWorldWidthInPixels() / 2;
    const worldCenterY = this.world.getWorldHeightInPixels() / 2;
    this.camera = new Camera(worldCenterX, worldCenterY);

    // 3. Instanciar o Renderer gráfico
    this.renderer = new Renderer(canvas);

    // 4. Instanciar o GameLoop
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
