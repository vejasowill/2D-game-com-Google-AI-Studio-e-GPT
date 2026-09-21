import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH } from './constants.ts';
import { Tile, TileType } from './types.ts';

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
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.tiles[this.getIndex(x, y)] = {
          type: TileType.GRASS,
        };
      }
    }
  }

  public getTile(x: number, y: number): Tile | null {
    if (!this.isValidCoord(x, y)) {
      return null;
    }
    return this.tiles[this.getIndex(x, y)];
  }

  public isValidCoord(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  private getIndex(x: number, y: number): number {
    return y * this.width + x;
  }
}
