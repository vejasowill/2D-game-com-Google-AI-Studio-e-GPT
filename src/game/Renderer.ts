import { TILE_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { Player } from './Player.ts';
import { TileRegistry } from './TileRegistry.ts';
import { World } from './World.ts';
import { ViewportSize } from './types.ts';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;

  // Estilo visual inicial de fundo e do jogador
  private readonly clearColor: string = '#121316';
  private readonly playerColor: string = '#3b82f6';
  private readonly playerBorderColor: string = '#1d4ed8';

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

    // Suporte a telas de alta densidade de pixels (Retina / mobile)
    const dpr = window.devicePixelRatio || 1;
    this.width = displayWidth;
    this.height = displayHeight;

    this.canvas.width = Math.floor(displayWidth * dpr);
    this.canvas.height = Math.floor(displayHeight * dpr);
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public getViewportSize(): ViewportSize {
    return { width: this.width, height: this.height };
  }

  /**
   * Transforma os dados do World em pixels na tela através da Camera
   */
  public render(world: World, camera: Camera, player: Player): void {
    // 1. Limpar fundo escuro
    this.ctx.fillStyle = this.clearColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const viewport = this.getViewportSize();

    // 2. Renderizar os tiles do mundo através da projeção da câmera
    for (let tileY = 0; tileY < world.height; tileY++) {
      for (let tileX = 0; tileX < world.width; tileX++) {
        const tile = world.getTile(tileX, tileY);
        if (!tile) continue;

        // Passo 1: Converter Coordenadas de Tile -> Coordenadas de Mundo (pixels)
        const worldCoord = world.tileToWorld({ tileX, tileY });

        // Passo 2: Converter Coordenadas de Mundo -> Coordenadas de Tela via Camera
        const screenCoord = camera.worldToScreen(worldCoord, viewport);

        // Passo 3: Frustum culling simples e direto
        if (
          screenCoord.screenX + TILE_SIZE < 0 ||
          screenCoord.screenX > this.width ||
          screenCoord.screenY + TILE_SIZE < 0 ||
          screenCoord.screenY > this.height
        ) {
          continue;
        }

        // Passo 4: Desenhar o tile no Canvas de acordo com sua definição registrada
        const tileDef = TileRegistry.get(tile.type);
        this.ctx.fillStyle = tileDef.color;
        this.ctx.fillRect(
          screenCoord.screenX,
          screenCoord.screenY,
          TILE_SIZE,
          TILE_SIZE,
        );

        if (tileDef.borderColor) {
          // Contorno sutil para evidenciar a malha de tiles
          this.ctx.strokeStyle = tileDef.borderColor;
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(
            screenCoord.screenX + 0.5,
            screenCoord.screenY + 0.5,
            TILE_SIZE - 1,
            TILE_SIZE - 1,
          );
        }
      }
    }

    // 3. Renderizar o Player através da projeção da câmera
    const playerScreenCoord = camera.worldToScreen(player.position, viewport);

    // Frustum culling para o Player
    if (
      playerScreenCoord.screenX + player.size >= 0 &&
      playerScreenCoord.screenX <= this.width &&
      playerScreenCoord.screenY + player.size >= 0 &&
      playerScreenCoord.screenY <= this.height
    ) {
      this.ctx.fillStyle = this.playerColor;
      this.ctx.fillRect(
        playerScreenCoord.screenX,
        playerScreenCoord.screenY,
        player.size,
        player.size,
      );

      this.ctx.strokeStyle = this.playerBorderColor;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(
        playerScreenCoord.screenX + 0.5,
        playerScreenCoord.screenY + 0.5,
        player.size - 1,
        player.size - 1,
      );
    }
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }
}
