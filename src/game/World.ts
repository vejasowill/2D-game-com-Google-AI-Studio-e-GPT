import { ChunkManager } from './ChunkManager.ts';
import {
  DEFAULT_WORLD_HEIGHT,
  DEFAULT_WORLD_SEED,
  DEFAULT_WORLD_WIDTH,
  PLAYER_SIZE,
  TILE_SIZE,
} from './constants.ts';
import { TileRegistry } from './TileRegistry.ts';
import { Tile, TileCoord, TileType, WorldBounds, WorldCoord } from './types.ts';
import { WorldGenerator } from './WorldGenerator.ts';

export class World {
  public readonly width: number;
  public readonly height: number;
  private readonly worldGenerator: WorldGenerator;
  private readonly chunkManager: ChunkManager;

  constructor(
    width: number = DEFAULT_WORLD_WIDTH,
    height: number = DEFAULT_WORLD_HEIGHT,
    seed: number = DEFAULT_WORLD_SEED,
  ) {
    this.width = width;
    this.height = height;
    this.worldGenerator = new WorldGenerator(seed);
    this.chunkManager = new ChunkManager(this.worldGenerator);
  }

  public getSeed(): number {
    return this.worldGenerator.seed;
  }

  public getTile(tileX: number, tileY: number): Tile | null {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return null;
    }
    return this.chunkManager.getTile(tileX, tileY);
  }

  public setTile(tileX: number, tileY: number, type: TileType): boolean {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return false;
    }
    return this.chunkManager.setTile(tileX, tileY, type);
  }

  public isValidTileCoord(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileX < this.width && tileY >= 0 && tileY < this.height;
  }

  public isValidCoord(tileX: number, tileY: number): boolean {
    return this.isValidTileCoord(tileX, tileY);
  }

  /**
   * Localiza a coordenada de tile caminhável mais próxima a partir de um ponto central desejado.
   * Executa uma busca em anéis concêntricos a partir do centro até encontrar um tile com propriedade walkable.
   * Não depende de coordenadas fixas e funciona dinamicamente para qualquer seed e tamanho de mundo.
   */
  public findNearestWalkableTile(
    centerTileX: number = Math.floor(this.width / 2),
    centerTileY: number = Math.floor(this.height / 2),
  ): TileCoord {
    const isWalkable = (tx: number, ty: number): boolean => {
      const tile = this.getTile(tx, ty);
      if (!tile) {
        return false;
      }
      const def = TileRegistry.get(tile.type);
      return def.walkable;
    };

    if (isWalkable(centerTileX, centerTileY)) {
      return { tileX: centerTileX, tileY: centerTileY };
    }

    const maxRadius = Math.max(this.width, this.height);
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
            continue;
          }
          const tx = centerTileX + dx;
          const ty = centerTileY + dy;
          if (isWalkable(tx, ty)) {
            return { tileX: tx, tileY: ty };
          }
        }
      }
    }

    return { tileX: centerTileX, tileY: centerTileY };
  }

  /**
   * Retorna a posição inicial segura para o Player no espaço contínuo do mundo (pixels),
   * centralizado dentro de um tile garantidamente caminhável (GRASS) próximo ao centro do mundo.
   */
  public getSafeSpawnWorldPosition(entitySize: number = PLAYER_SIZE): WorldCoord {
    const spawnTile = this.findNearestWalkableTile();
    const tileWorld = this.tileToWorld(spawnTile);
    return {
      worldX: tileWorld.worldX + (TILE_SIZE - entitySize) / 2,
      worldY: tileWorld.worldY + (TILE_SIZE - entitySize) / 2,
    };
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
}

