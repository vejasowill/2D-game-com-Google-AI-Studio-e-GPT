import { ChunkManager } from './ChunkManager.ts';
import { DEFAULT_WORLD_SEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { TileRegistry } from './TileRegistry.ts';
import { Tile, TileCoord, TileType, WorldCoord } from './types.ts';
import { WorldGenerator } from './WorldGenerator.ts';

export class World {
  private readonly worldGenerator: WorldGenerator;
  private readonly chunkManager: ChunkManager;

  constructor(seed: number = DEFAULT_WORLD_SEED) {
    this.worldGenerator = new WorldGenerator(seed);
    this.chunkManager = new ChunkManager(this.worldGenerator);
  }

  public getSeed(): number {
    return this.worldGenerator.seed;
  }

  /**
   * Consulta um tile global em qualquer coordenada espacial inteira (positiva, negativa ou distante).
   * O ChunkManager carrega/gera o chunk sob demanda de forma determinística.
   */
  public getTile(tileX: number, tileY: number): Tile | null {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return null;
    }
    return this.chunkManager.getTile(tileX, tileY);
  }

  /**
   * Define o tipo de tile em uma coordenada global.
   */
  public setTile(tileX: number, tileY: number, type: TileType): boolean {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return false;
    }
    return this.chunkManager.setTile(tileX, tileY, type);
  }

  /**
   * O espaço do World é ilimitado em coordenadas de grade; qualquer par de inteiros é uma coordenada válida.
   */
  public isValidTileCoord(tileX: number, tileY: number): boolean {
    return Number.isInteger(tileX) && Number.isInteger(tileY);
  }

  public isValidCoord(tileX: number, tileY: number): boolean {
    return this.isValidTileCoord(tileX, tileY);
  }

  /**
   * O World é ilimitado e não possui bordas globais finitas.
   */
  public hasBounds(): boolean {
    return false;
  }

  /**
   * Localiza a coordenada de tile caminhável mais próxima a partir de um ponto de referência global (padrão: 0, 0).
   * Executa busca em anéis concêntricos determinísticos ao redor da origem.
   */
  public findNearestWalkableTile(
    startTileX: number = 0,
    startTileY: number = 0,
  ): TileCoord {
    const isWalkable = (tx: number, ty: number): boolean => {
      const tile = this.getTile(tx, ty);
      if (!tile) {
        return false;
      }
      const def = TileRegistry.get(tile.type);
      return def.walkable;
    };

    if (isWalkable(startTileX, startTileY)) {
      return { tileX: startTileX, tileY: startTileY };
    }

    // Busca concêntrica determinística em anéis
    const maxSearchRadius = 128;
    for (let radius = 1; radius <= maxSearchRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
            continue;
          }
          const tx = startTileX + dx;
          const ty = startTileY + dy;
          if (isWalkable(tx, ty)) {
            return { tileX: tx, tileY: ty };
          }
        }
      }
    }

    return { tileX: startTileX, tileY: startTileY };
  }

  /**
   * Retorna a posição inicial segura para o Player no espaço contínuo do mundo (pixels),
   * centralizado dentro de um tile garantidamente caminhável próximo à origem (0,0).
   */
  public getSafeSpawnWorldPosition(entitySize: number = PLAYER_SIZE): WorldCoord {
    const spawnTile = this.findNearestWalkableTile(0, 0);
    const tileWorld = this.tileToWorld(spawnTile);
    return {
      worldX: tileWorld.worldX + (TILE_SIZE - entitySize) / 2,
      worldY: tileWorld.worldY + (TILE_SIZE - entitySize) / 2,
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


