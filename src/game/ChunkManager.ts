import { CHUNK_SIZE } from './constants.ts';
import { Chunk } from './Chunk.ts';
import { ChunkCoord, ChunkTileCoord, Tile, TileType } from './types.ts';

/**
 * Gerenciador de Chunks.
 *
 * Responsável por:
 * - Armazenar os chunks carregados na memória;
 * - Indexar chunks através de chave determinística isolada;
 * - Fornecer a conversão matemática centralizada entre coordenadas globais de tile e coordenadas de chunk/locais;
 * - Obter e modificar tiles no espaço de coordenadas globais;
 * - Suportar nativamente coordenadas positivas e negativas para futura expansão procedural.
 */
export class ChunkManager {
  private readonly chunks: Map<string, Chunk> = new Map();

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
   * Obtém o chunk na coordenada especificada, se estiver carregado.
   */
  public getChunk(chunkX: number, chunkY: number): Chunk | null {
    return this.chunks.get(this.getChunkKey(chunkX, chunkY)) ?? null;
  }

  /**
   * Adiciona um chunk já instanciado ao gerenciador.
   */
  public addChunk(chunk: Chunk): void {
    this.chunks.set(this.getChunkKey(chunk.coord.chunkX, chunk.coord.chunkY), chunk);
  }

  /**
   * Obtém um chunk ou o cria e armazena caso ainda não exista.
   */
  public getOrCreateChunk(
    chunkX: number,
    chunkY: number,
    defaultTileType: TileType = TileType.GRASS,
  ): Chunk {
    const key = this.getChunkKey(chunkX, chunkY);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(chunkX, chunkY, defaultTileType);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /**
   * Remove um chunk da memória.
   */
  public removeChunk(chunkX: number, chunkY: number): boolean {
    return this.chunks.delete(this.getChunkKey(chunkX, chunkY));
  }

  /**
   * Retorna a quantidade de chunks atualmente armazenados.
   */
  public getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Obtém o tile em uma coordenada global de tile através do Chunk correspondente.
   * Se o chunk não estiver carregado, retorna null.
   */
  public getTile(tileX: number, tileY: number): Tile | null {
    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const chunk = this.getChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    if (!chunk) {
      return null;
    }
    return chunk.getTile(localX, localY);
  }

  /**
   * Define o tipo de tile em uma coordenada global através do Chunk correspondente.
   * Cria o chunk automaticamente se ele ainda não estiver carregado.
   */
  public setTile(tileX: number, tileY: number, type: TileType): boolean {
    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const chunk = this.getOrCreateChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    return chunk.setTile(localX, localY, type);
  }

  /**
   * Limpa todos os chunks carregados.
   */
  public clear(): void {
    this.chunks.clear();
  }
}
