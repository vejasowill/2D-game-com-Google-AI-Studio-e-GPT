import { PLAYER_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { GameLoop } from './GameLoop.ts';
import { Input } from './Input.ts';
import { Player } from './Player.ts';
import { Renderer } from './Renderer.ts';
import { World } from './World.ts';
import { WorldCoord } from './types.ts';

export class Game {
  private world: World;
  private camera: Camera;
  private player: Player;
  private input: Input;
  private renderer: Renderer;
  private loop: GameLoop;
  private resizeObserver: ResizeObserver | null = null;
  private handleWindowResize: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // 1. Instanciar o World (dados dos tiles)
    this.world = new World();

    // 2. Calcular a posição inicial do Player centralizado no mundo (sem números mágicos)
    const worldCenterX = this.world.getWorldWidthInPixels() / 2;
    const worldCenterY = this.world.getWorldHeightInPixels() / 2;

    const initialPlayerPosition: WorldCoord = {
      worldX: worldCenterX - PLAYER_SIZE / 2,
      worldY: worldCenterY - PLAYER_SIZE / 2,
    };
    this.player = new Player(initialPlayerPosition);

    // 3. Instanciar a Camera centralizada no Player
    const playerCenter = this.player.getCenter();
    this.camera = new Camera(playerCenter.worldX, playerCenter.worldY);

    // 4. Instanciar o subsistema de Input
    this.input = new Input();

    // 5. Instanciar o Renderer gráfico
    this.renderer = new Renderer(canvas);

    // Aplicar clamp inicial na Camera com os limites do mundo e tamanho da viewport
    this.camera.clampToBounds(this.world.getBounds(), this.renderer.getViewportSize());

    // 6. Instanciar o GameLoop
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

    this.input.destroy();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.handleWindowResize) {
      window.removeEventListener('resize', this.handleWindowResize);
      this.handleWindowResize = null;
    }
  }

  private update(deltaTime: number): void {
    // Obter limites espaciais do mundo e tamanho da viewport
    const worldBounds = this.world.getBounds();
    const viewport = this.renderer.getViewportSize();

    // Ordem: GameLoop -> Input -> Player.update -> Camera
    // 1. Atualizar o Player com o estado do Input, deltaTime e limites do mundo
    this.player.update(deltaTime, this.input, worldBounds);

    // 2. Atualizar a Camera acompanhando a posição do Player
    const playerCenter = this.player.getCenter();
    this.camera.setPosition(playerCenter.worldX, playerCenter.worldY);

    // 3. Limitar a Camera aos limites do mundo e viewport
    this.camera.clampToBounds(worldBounds, viewport);
  }

  private render(): void {
    // Renderiza o mundo e o jogador através da câmera no canvas
    this.renderer.render(this.world, this.camera, this.player);
  }

  private setupResize(canvas: HTMLCanvasElement): void {
    this.handleWindowResize = () => {
      this.renderer.resize();
      this.camera.clampToBounds(this.world.getBounds(), this.renderer.getViewportSize());
    };
    window.addEventListener('resize', this.handleWindowResize);

    if (canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        this.renderer.resize();
        this.camera.clampToBounds(this.world.getBounds(), this.renderer.getViewportSize());
      });
      this.resizeObserver.observe(canvas.parentElement);
    }
  }
}
