import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH, TILE_SIZE } from './constants.ts';
import { Tile, TileCoord, TileType, WorldBounds, WorldCoord } from './types.ts';

export class World {
  public readonly width: number;
  public readonly height: number;
  private readonly tiles: Tile[];

  constructor(
    width: number = DEFAULT_WORLD_WIDTH,
    height: number = DEFAULT_WORLD_HEIGHT,
  ) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height);

    this.initializeTiles();
  }

  private initializeTiles(): void {
    for (let tileY = 0; tileY < this.height; tileY++) {
      for (let tileX = 0; tileX < this.width; tileX++) {
        this.tiles[this.getIndex(tileX, tileY)] = {
          type: TileType.GRASS,
        };
      }
    }
  }

  public getTile(tileX: number, tileY: number): Tile | null {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return null;
    }
    return this.tiles[this.getIndex(tileX, tileY)];
  }

  public isValidTileCoord(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileX < this.width && tileY >= 0 && tileY < this.height;
  }

  public isValidCoord(tileX: number, tileY: number): boolean {
    return this.isValidTileCoord(tileX, tileY);
  }

  /**
   * Retorna a largura total do mundo em coordenadas de mundo (pixels).
   */
  public getWorldWidthInPixels(): number {
    return this.width * TILE_SIZE;
  }

  /**
   * Retorna a altura total do mundo em coordenadas de mundo (pixels).
   */
  public getWorldHeightInPixels(): number {
    return this.height * TILE_SIZE;
  }

  /**
   * Retorna a representação explícita dos limites espaciais do mundo em coordenadas de mundo (pixels).
   */
  public getBounds(): WorldBounds {
    const width = this.getWorldWidthInPixels();
    const height = this.getWorldHeightInPixels();
    return {
      minX: 0,
      minY: 0,
      maxX: width,
      maxY: height,
      width,
      height,
    };
  }

  /**
   * Conversão explícita: Coordenadas de Tile -> Coordenadas de Mundo (pixels).
   */
  public tileToWorld(tileCoord: TileCoord): WorldCoord {
    return {
      worldX: tileCoord.tileX * TILE_SIZE,
      worldY: tileCoord.tileY * TILE_SIZE,
    };
  }

  /**
   * Conversão explícita: Coordenadas de Mundo (pixels) -> Coordenadas de Tile.
   */
  public worldToTile(worldCoord: WorldCoord): TileCoord {
    return {
      tileX: Math.floor(worldCoord.worldX / TILE_SIZE),
      tileY: Math.floor(worldCoord.worldY / TILE_SIZE),
    };
  }

  private getIndex(tileX: number, tileY: number): number {
    return tileY * this.width + tileX;
  }
}
