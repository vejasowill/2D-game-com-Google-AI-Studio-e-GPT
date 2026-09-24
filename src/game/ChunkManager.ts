import { CHUNK_SIZE } from './constants.ts';
import { Chunk } from './Chunk.ts';
import { ChunkCoord, ChunkTileCoord, Tile, TileType } from './types.ts';
import { WorldGenerator } from './WorldGenerator.ts';

/**
 * Interface para observadores do ciclo de vida dos chunks (carregamento e descarregamento).
 */
export interface ChunkLifecycleListener {
  onChunkLoaded?: (chunk: Chunk) => void;
  onChunkUnloaded?: (chunk: Chunk) => void;
}

/**
 * Gerenciador de Chunks.
 *
 * Responsável por:
 * - Armazenar os chunks carregados na memória;
 * - Indexar chunks através de chave determinística isolada;
 * - Fornecer a conversão matemática centralizada entre coordenadas globais de tile e coordenadas de chunk/locais;
 * - Solicitar geração sob demanda ao WorldGenerator quando um chunk ainda não existir na memória;
 * - Obter e modificar tiles no espaço de coordenadas globais;
 * - Notificar observadores sobre carregamento e descarregamento de chunks;
 * - Suportar nativamente coordenadas positivas e negativas para futura expansão procedural.
 */
export class ChunkManager {
  private readonly chunks: Map<string, Chunk> = new Map();
  private readonly worldGenerator: WorldGenerator;
  private lifecycleListener: ChunkLifecycleListener | null = null;

  constructor(worldGenerator: WorldGenerator = new WorldGenerator()) {
    this.worldGenerator = worldGenerator;
  }

  public setLifecycleListener(listener: ChunkLifecycleListener | null): void {
    this.lifecycleListener = listener;
  }

  public getWorldGenerator(): WorldGenerator {
    return this.worldGenerator;
  }

  /**
   * Converte uma coordenada global de tile (positiva ou negativa) para sua respectiva
   * ChunkCoord e coordenadas locais dentro do Chunk.
   */
  public static globalTileToChunkCoord(tileX: number, tileY: number): ChunkTileCoord {
    const chunkX = Math.floor(tileX / CHUNK_SIZE);
    const chunkY = Math.floor(tileY / CHUNK_SIZE);
    const localX = tileX - chunkX * CHUNK_SIZE;
    const localY = tileY - chunkY * CHUNK_SIZE;

    return {
      chunkCoord: { chunkX, chunkY },
      localX,
      localY,
    };
  }

  /**
   * Converte coordenadas de Chunk e coordenadas locais de volta para a coordenada global de tile.
   */
  public static chunkToGlobalTileCoord(
    chunkX: number,
    chunkY: number,
    localX: number,
    localY: number,
  ): { tileX: number; tileY: number } {
    return {
      tileX: chunkX * CHUNK_SIZE + localX,
      tileY: chunkY * CHUNK_SIZE + localY,
    };
  }

  /**
   * Gera a chave determinística usada internamente pelo Map.
   * Não é exposta para o restante do jogo.
   */
  private getChunkKey(chunkX: number, chunkY: number): string {
    return `${chunkX},${chunkY}`;
  }

  /**
   * Verifica se o chunk na coordenada especificada está carregado na memória.
   */
  public hasChunk(chunkX: number, chunkY: number): boolean {
    return this.chunks.has(this.getChunkKey(chunkX, chunkY));
  }

  /**
   * Alias semântico para verificar se um chunk está carregado na memória.
   */
  public isChunkLoaded(chunkX: number, chunkY: number): boolean {
    return this.hasChunk(chunkX, chunkY);
  }

  /**
   * Carrega ou gera sob demanda o chunk na coordenada especificada.
   */
  public loadChunk(chunkX: number, chunkY: number): Chunk {
    return this.getChunk(chunkX, chunkY);
  }

  /**
   * Retorna o chunk se já estiver carregado na memória, sem disparar geração.
   */
  public getLoadedChunk(chunkX: number, chunkY: number): Chunk | null {
    return this.chunks.get(this.getChunkKey(chunkX, chunkY)) ?? null;
  }

  /**
   * Obtém o chunk na coordenada especificada.
   * Caso ainda não esteja carregado na memória, solicita a geração sob demanda ao WorldGenerator.
   */
  public getChunk(chunkX: number, chunkY: number): Chunk {
    const key = this.getChunkKey(chunkX, chunkY);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.worldGenerator.generateChunk({ chunkX, chunkY });
      this.chunks.set(key, chunk);
      this.lifecycleListener?.onChunkLoaded?.(chunk);
    }
    return chunk;
  }

  /**
   * Adiciona um chunk já instanciado ao gerenciador.
   */
  public addChunk(chunk: Chunk): void {
    const key = this.getChunkKey(chunk.coord.chunkX, chunk.coord.chunkY);
    const existed = this.chunks.has(key);
    this.chunks.set(key, chunk);
    if (!existed) {
      this.lifecycleListener?.onChunkLoaded?.(chunk);
    }
  }

  /**
   * Obtém um chunk existente ou gera um novo através do WorldGenerator.
   */
  public getOrCreateChunk(chunkX: number, chunkY: number): Chunk {
    return this.getChunk(chunkX, chunkY);
  }

  /**
   * Remove um chunk da memória.
   * Notifica os observadores de ciclo de vida antes da remoção.
   */
  public removeChunk(chunkX: number, chunkY: number): boolean {
    const key = this.getChunkKey(chunkX, chunkY);
    const chunk = this.chunks.get(key);
    if (chunk) {
      this.lifecycleListener?.onChunkUnloaded?.(chunk);
      return this.chunks.delete(key);
    }
    return false;
  }

  /**
   * Descarrega um chunk da memória (alias explícito para ciclo de vida de streaming).
   */
  public unloadChunk(chunkX: number, chunkY: number): boolean {
    return this.removeChunk(chunkX, chunkY);
  }

  /**
   * Retorna uma lista de todos os chunks atualmente carregados na memória.
   * Não expõe a estrutura interna Map.
   */
  public getLoadedChunks(): Chunk[] {
    return Array.from(this.chunks.values());
  }

  /**
   * Retorna as coordenadas de todos os chunks atualmente carregados na memória.
   */
  public getLoadedChunkCoords(): ChunkCoord[] {
    return Array.from(this.chunks.values()).map((chunk) => ({ ...chunk.coord }));
  }

  /**
   * Retorna a quantidade de chunks atualmente armazenados.
   */
  public getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Obtém o tile em uma coordenada global de tile através do Chunk correspondente.
   * Carrega/gera o chunk sob demanda caso necessário.
   */
  public getTile(tileX: number, tileY: number): Tile | null {
    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const chunk = this.getChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    return chunk.getTile(localX, localY);
  }

  /**
   * Consulta um tile SOMENTE se o chunk correspondente já estiver carregado na memória.
   * NUNCA gera um novo chunk. Retorna null se o chunk não estiver carregado.
   */
  public getLoadedTile(tileX: number, tileY: number): Tile | null {
    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const chunk = this.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    if (!chunk) {
      return null;
    }
    return chunk.getTile(localX, localY);
  }

  /**
   * Define o tipo de tile em uma coordenada global através do Chunk correspondente.
   * Garante que o chunk esteja carregado/gerado antes da modificação.
   */
  public setTile(tileX: number, tileY: number, type: TileType): boolean {
    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const chunk = this.getChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    return chunk.setTile(localX, localY, type);
  }

  /**
   * Limpa todos os chunks carregados.
   * Notifica descarregamento para todos os chunks ativos antes de limpar o armazenamento.
   */
  public clear(): void {
    if (this.lifecycleListener?.onChunkUnloaded) {
      for (const chunk of this.chunks.values()) {
        this.lifecycleListener.onChunkUnloaded(chunk);
      }
    }
    this.chunks.clear();
  }
}

