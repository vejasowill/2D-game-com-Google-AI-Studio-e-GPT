import { Biome } from './Biome.ts';
import { BiomeResolver } from './BiomeResolver.ts';
import { CHUNK_SIZE, DEFAULT_WORLD_SEED } from './constants.ts';
import { Chunk } from './Chunk.ts';
import { ChunkCoord, EnvironmentalData, TileType } from './types.ts';

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
 * - Gerar campos ambientais matemáticos suaves e contínuos: temperatura, umidade, elevação em [0, 1);
 * - Resolver biomas (Biome) através do BiomeResolver;
 * - Mapear biomas para os TileTypes do terreno na grade de Chunks;
 * - Manter coerência espacial em escala global, sem ruído branco tile-a-tile;
 * - Ser 100% determinístico e independente da ordem de requisições ou posições de câmera/player.
 *
 * Desacoplado de: Player, Camera, Renderer, Canvas, Input, GameLoop, CollisionSystem.
 */
export class WorldGenerator {
  public readonly seed: number;

  // Sementes derivadas para cada campo escalar (garantindo ortogonalidade dos ruídos)
  private readonly seedElevation: number;
  private readonly seedTemperature: number;
  private readonly seedHumidity: number;

  // Tamanhos de grade para interpolação contínua (macro-regiões climáticas)
  // Grade de elevação (8 tiles = 256px = meia chunk): formas costeiras e corpos d'água orgânicos
  private static readonly ELEVATION_GRID_SIZE = 8;
  // Grade de temperatura (48 tiles = 1536px): grandes zonas climáticas
  private static readonly TEMPERATURE_GRID_SIZE = 48;
  // Grade de umidade (36 tiles = 1152px): frentes de umidade e pluviosidade
  private static readonly HUMIDITY_GRID_SIZE = 36;

  constructor(seed: number = DEFAULT_WORLD_SEED) {
    this.seed = seed | 0;
    // Derivação de seeds específicas e ortogonais para cada campo escalar
    this.seedElevation = (this.seed ^ 0x3d7b5129) | 0;
    this.seedTemperature = (this.seed ^ 0x6e9f1a85) | 0;
    this.seedHumidity = (this.seed ^ 0x1b56c4e9) | 0;
  }

  /**
   * Amostra a elevação matemática contínua na coordenada global [0, 1).
   * Valores < WATER_ELEVATION (0.35) definem massas de água (OCEAN -> WATER).
   */
  public getElevationAt(globalTileX: number, globalTileY: number): number {
    return this.sampleSmoothField(
      this.seedElevation,
      globalTileX,
      globalTileY,
      WorldGenerator.ELEVATION_GRID_SIZE,
    );
  }

  /**
   * Amostra a temperatura contínua na coordenada global [0, 1).
   * Incorpora um gradiente sutil de macro-latitude no eixo Y combinado ao ruído suave.
   */
  public getTemperatureAt(globalTileX: number, globalTileY: number): number {
    const noise = this.sampleSmoothField(
      this.seedTemperature,
      globalTileX,
      globalTileY,
      WorldGenerator.TEMPERATURE_GRID_SIZE,
    );

    // Gradiente suave de latitude: modulação de onda senoidal de período amplo (256 tiles)
    // Mantém a variação suave e determinística sem estourar o intervalo [0, 1)
    const latitudeFactor = Math.sin(globalTileY * 0.02) * 0.15;
    const temp = noise + latitudeFactor;

    // Garante normalização estrita em [0, 1)
    if (temp <= 0) return 0;
    if (temp >= 1) return 0.999999;
    return temp;
  }

  /**
   * Amostra a umidade contínua na coordenada global [0, 1).
   * Campo espacial desacoplado da temperatura e elevação.
   */
  public getHumidityAt(globalTileX: number, globalTileY: number): number {
    return this.sampleSmoothField(
      this.seedHumidity,
      globalTileX,
      globalTileY,
      WorldGenerator.HUMIDITY_GRID_SIZE,
    );
  }

  /**
   * Retorna o pacote completo de dados ambientais normalizados [0, 1) para a coordenada global.
   * Não instancia chunks nem aloca memória desnecessária.
   */
  public getEnvironmentalDataAt(globalTileX: number, globalTileY: number): EnvironmentalData {
    return {
      temperature: this.getTemperatureAt(globalTileX, globalTileY),
      humidity: this.getHumidityAt(globalTileX, globalTileY),
      elevation: this.getElevationAt(globalTileX, globalTileY),
    };
  }

  /**
   * Resolve o bioma correspondente à coordenada global através do BiomeResolver.
   * Não materializa chunks na memória.
   */
  public getBiomeAt(globalTileX: number, globalTileY: number): Biome {
    const env = this.getEnvironmentalDataAt(globalTileX, globalTileY);
    return BiomeResolver.resolveBiome(env);
  }

  /**
   * Determina deterministicamente o TileType para uma coordenada global de tile.
   *
   * Fluxo arquitetural:
   * Coordenada Global -> Dados Ambientais -> Biome -> TileType
   */
  public getTileTypeAt(globalTileX: number, globalTileY: number): TileType {
    const biome = this.getBiomeAt(globalTileX, globalTileY);
    return BiomeResolver.biomeToTileType(biome);
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
   * Amostra um campo contínuo suave em [0, 1) em grade regular com curva Hermite (Smoothstep).
   * Suporta coordenadas positivas, negativas ou distantes através de Math.floor.
   */
  private sampleSmoothField(
    fieldSeed: number,
    globalTileX: number,
    globalTileY: number,
    gridSize: number,
  ): number {
    const gx = Math.floor(globalTileX / gridSize);
    const gy = Math.floor(globalTileY / gridSize);

    const fx = (globalTileX - gx * gridSize) / gridSize;
    const fy = (globalTileY - gy * gridSize) / gridSize;

    // Curva S cúbica suave (Hermite / Smoothstep): 3*t^2 - 2*t^3
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    // Amostragem nos 4 vértices da célula de grade
    const h00 = normalizeHash(deterministicHash2D(fieldSeed, gx, gy));
    const h10 = normalizeHash(deterministicHash2D(fieldSeed, gx + 1, gy));
    const h01 = normalizeHash(deterministicHash2D(fieldSeed, gx, gy + 1));
    const h11 = normalizeHash(deterministicHash2D(fieldSeed, gx + 1, gy + 1));

    // Interpolação bilinear suave
    const top = (1 - sx) * h00 + sx * h10;
    const bottom = (1 - sx) * h01 + sx * h11;

    const val = (1 - sy) * top + sy * bottom;
    if (val < 0) return 0;
    if (val >= 1) return 0.999999;
    return val;
  }
}
