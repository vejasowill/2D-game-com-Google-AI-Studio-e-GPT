import { CHUNK_SIZE, DEFAULT_WORLD_SEED } from './constants.ts';
import { Chunk } from './Chunk.ts';
import { ChunkCoord, TileType } from './types.ts';

/**
 * Função hash determinística 32-bit (sem estado mutável, pura e estritamente matemática).
 * Mapeia (seed, x, y) inteiros (inclusive negativos) em um uint32 pseudoaleatório uniforme.
 */
export function deterministicHash2D(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Normaliza um hash uint32 para o intervalo contínuo [0, 1).
 */
export function normalizeHash(hash: number): number {
  return hash / 4294967296;
}

/**
 * Gerador procedural determinístico de mundo baseado em SEED.
 *
 * Responsável por:
 * - Gerar o terreno (TileType) para coordenadas globais com base na seed;
 * - Produzir Chunks contíguos de forma 100% determinística;
 * - Manter coerência espacial (regiões contínuas de WATER e GRASS predominante);
 * - Independer da ordem em que os Chunks são solicitados.
 *
 * Desacoplado de: Player, Camera, Renderer, Canvas, Input, GameLoop, CollisionSystem.
 */
export class WorldGenerator {
  public readonly seed: number;

  // Tamanho da célula da grade de interpolação para coerência espacial de terreno
  private static readonly COARSE_GRID_SIZE = 8;
  // Limiar para definição de água: valores abaixo deste limiar se tornam WATER
  private static readonly WATER_THRESHOLD = 0.28;

  constructor(seed: number = DEFAULT_WORLD_SEED) {
    this.seed = seed | 0;
  }

  /**
   * Determina deterministicamente o TileType para uma coordenada global de tile.
   * Utiliza interpolação cúbica (smoothstep) sobre vértices de hash da grade grossa,
   * gerando lagoas e manchas orgânicas suaves sem ruído branco desconexo.
   */
  public getTileTypeAt(globalTileX: number, globalTileY: number): TileType {
    const value = this.sampleSpatialCoherence(globalTileX, globalTileY);
    if (value < WorldGenerator.WATER_THRESHOLD) {
      return TileType.WATER;
    }
    return TileType.GRASS;
  }

  /**
   * Gera um Chunk completo e determinístico para a ChunkCoord especificada.
   * Cada tile dentro do Chunk é amostrado usando suas coordenadas globais correspondentes.
   */
  public generateChunk(chunkCoord: ChunkCoord): Chunk {
    const chunk = new Chunk(chunkCoord.chunkX, chunkCoord.chunkY);

    for (let localY = 0; localY < CHUNK_SIZE; localY++) {
      const globalTileY = chunkCoord.chunkY * CHUNK_SIZE + localY;
      for (let localX = 0; localX < CHUNK_SIZE; localX++) {
        const globalTileX = chunkCoord.chunkX * CHUNK_SIZE + localX;
        const tileType = this.getTileTypeAt(globalTileX, globalTileY);
        chunk.setTile(localX, localY, tileType);
      }
    }

    return chunk;
  }

  /**
   * Amostra um valor contínuo e suave em [0, 1) na coordenada global de tile.
   * Suporta nativamente números negativos através de Math.floor.
   */
  private sampleSpatialCoherence(globalTileX: number, globalTileY: number): number {
    const gridSize = WorldGenerator.COARSE_GRID_SIZE;

    const gx = Math.floor(globalTileX / gridSize);
    const gy = Math.floor(globalTileY / gridSize);

    const fx = (globalTileX - gx * gridSize) / gridSize;
    const fy = (globalTileY - gy * gridSize) / gridSize;

    // Curva S cúbica suave (Hermite / Smoothstep): 3*t^2 - 2*t^3
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    // Amostragem nos 4 cantos da célula da grade com a seed
    const h00 = normalizeHash(deterministicHash2D(this.seed, gx, gy));
    const h10 = normalizeHash(deterministicHash2D(this.seed, gx + 1, gy));
    const h01 = normalizeHash(deterministicHash2D(this.seed, gx, gy + 1));
    const h11 = normalizeHash(deterministicHash2D(this.seed, gx + 1, gy + 1));

    // Interpolação bilinear suave
    const top = (1 - sx) * h00 + sx * h10;
    const bottom = (1 - sx) * h01 + sx * h11;

    return (1 - sy) * top + sy * bottom;
  }
}
