import { TILE_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { World } from './World.ts';
import { TileType } from './types.ts';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;

  // Visual styling
  private readonly clearColor: string = '#121316';
  private readonly grassColor: string = '#2e7d32';
  private readonly tileBorderColor: string = '#256629';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to obtain CanvasRenderingContext2D.');
    }
    this.ctx = context;
    this.resize();
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    const displayWidth = parent ? parent.clientWidth : window.innerWidth;
    const displayHeight = parent ? parent.clientHeight : window.innerHeight;

    // Support devicePixelRatio for sharp rendering on mobile / high-DPI screens
    const dpr = window.devicePixelRatio || 1;
    this.width = displayWidth;
    this.height = displayHeight;

    this.canvas.width = Math.floor(displayWidth * dpr);
    this.canvas.height = Math.floor(displayHeight * dpr);
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public render(world: World, camera: Camera): void {
    // 1. Limpar fundo escuro
    this.ctx.fillStyle = this.clearColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 2. Renderizar os tiles do mundo através da projeção da câmera
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.getTile(x, y);
        if (!tile) continue;

        // Converter posição do tile no mundo (pixels) para tela via Camera
        const worldX = x * TILE_SIZE;
        const worldY = y * TILE_SIZE;
        const screenPos = camera.worldToScreen(
          worldX,
          worldY,
          this.width,
          this.height,
        );

        // Frustum culling (descartar tiles fora da visualização visível)
        if (
          screenPos.x + TILE_SIZE < 0 ||
          screenPos.x > this.width ||
          screenPos.y + TILE_SIZE < 0 ||
          screenPos.y > this.height
        ) {
          continue;
        }

        // Desenhar quadrado representativo do tile
        if (tile.type === TileType.GRASS) {
          this.ctx.fillStyle = this.grassColor;
          this.ctx.fillRect(screenPos.x, screenPos.y, TILE_SIZE, TILE_SIZE);

          // Contorno fino para evidenciar a malha de tiles
          this.ctx.strokeStyle = this.tileBorderColor;
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(
            screenPos.x + 0.5,
            screenPos.y + 0.5,
            TILE_SIZE - 1,
            TILE_SIZE - 1,
          );
        }
      }
    }
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }
}
