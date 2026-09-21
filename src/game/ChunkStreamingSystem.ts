import { CHUNK_LOAD_RADIUS, CHUNK_UNLOAD_RADIUS } from './constants.ts';
import { ChunkManager } from './ChunkManager.ts';
import { ChunkCoord, WorldCoord } from './types.ts';
import { World } from './World.ts';

/**
 * Sistema de Streaming de Chunks.
 *
 * Responsabilidade única:
 * Gerenciar quais chunks devem permanecer carregados ao redor do Player no mundo aberto procedural.
 *
 * Princípios arquiteturais:
 * - O Player NÃO conhece ChunkManager ou Chunk.
 * - O Renderer NÃO gera chunks (somente lê chunks já carregados).
 * - O WorldGenerator permanece determinístico e puro.
 * - O ChunkManager continua sendo a autoridade de ciclo de vida (armazenamento, geração e descarregamento).
 * - Não roda computação pesada a cada pixel ou frame se o Player permanecer dentro do mesmo chunk.
 */
export class ChunkStreamingSystem {
  private readonly world: World;
  private readonly chunkManager: ChunkManager;

  private loadRadius: number;
  private unloadRadius: number;

  private lastPlayerChunkCoord: ChunkCoord | null = null;

  constructor(
    world: World,
    loadRadius: number = CHUNK_LOAD_RADIUS,
    unloadRadius: number = CHUNK_UNLOAD_RADIUS,
  ) {
    this.world = world;
    this.chunkManager = world.getChunkManager();
    this.loadRadius = loadRadius;
    this.unloadRadius = unloadRadius;
  }

  public getLoadRadius(): number {
    return this.loadRadius;
  }

  public getUnloadRadius(): number {
    return this.unloadRadius;
  }

  public getLastPlayerChunkCoord(): ChunkCoord | null {
    return this.lastPlayerChunkCoord ? { ...this.lastPlayerChunkCoord } : null;
  }

  /**
   * Determina a coordenada de chunk onde a posição global no mundo se encontra.
   * Utiliza centralizadamente a conversão matemática do World e do ChunkManager.
   */
  public getChunkCoordFromWorldPosition(position: WorldCoord): ChunkCoord {
    const tileCoord = this.world.worldToTile(position);
    const { chunkCoord } = ChunkManager.globalTileToChunkCoord(tileCoord.tileX, tileCoord.tileY);
    return chunkCoord;
  }

  /**
   * Atualiza o streaming de chunks baseado na posição atual do Player no mundo.
   *
   * Otimização:
   * Se forceUpdate for falso e o Player ainda estiver no mesmo chunk da última atualização,
   * a rotina retorna imediatamente sem fazer iterações desnecessárias.
   *
   * Retorna true caso uma atualização de streaming tenha sido processada, ou false se foi ignorada.
   */
  public update(playerPosition: WorldCoord, forceUpdate: boolean = false): boolean {
    const currentChunkCoord = this.getChunkCoordFromWorldPosition(playerPosition);

    if (
      !forceUpdate &&
      this.lastPlayerChunkCoord !== null &&
      this.lastPlayerChunkCoord.chunkX === currentChunkCoord.chunkX &&
      this.lastPlayerChunkCoord.chunkY === currentChunkCoord.chunkY
    ) {
      return false;
    }

    this.lastPlayerChunkCoord = { ...currentChunkCoord };
    this.processStreaming(currentChunkCoord);
    return true;
  }

  /**
   * Executa a rotina de streaming:
   * 1. Garante que todos os chunks dentro de loadRadius ao redor de playerChunk estejam carregados.
   * 2. Descarrega todos os chunks cuja distância de Chebyshev em relação a playerChunk for maior que unloadRadius.
   */
  private processStreaming(playerChunk: ChunkCoord): void {
    const pX = playerChunk.chunkX;
    const pY = playerChunk.chunkY;

    // 1. CARREGAMENTO: Percorre todos os chunks dentro de loadRadius
    for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
      for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
        const targetChunkX = pX + dx;
        const targetChunkY = pY + dy;
        this.chunkManager.getOrCreateChunk(targetChunkX, targetChunkY);
      }
    }

    // 2. DESCARREGAMENTO: Percorre todos os chunks atualmente carregados
    // Distância de Chebyshev: max(abs(chunkX - pX), abs(chunkY - pY))
    const loadedCoords = this.chunkManager.getLoadedChunkCoords();
    for (const coord of loadedCoords) {
      const distX = Math.abs(coord.chunkX - pX);
      const distY = Math.abs(coord.chunkY - pY);

      if (distX > this.unloadRadius || distY > this.unloadRadius) {
        this.chunkManager.unloadChunk(coord.chunkX, coord.chunkY);
      }
    }
  }

  /**
   * Força uma atualização imediata do streaming para a posição informada.
   */
  public forceUpdate(playerPosition: WorldCoord): void {
    this.update(playerPosition, true);
  }
}
