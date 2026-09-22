import { CHUNK_SIZE } from './constants.ts';
import { ChunkCoord, Tile, TileType } from './types.ts';
import { WorldObject } from './WorldObject.ts';

/**
 * Representa uma unidade de armazenamento espacial do mundo (Chunk).
 * É uma região contígua e fixa de CHUNK_SIZE × CHUNK_SIZE tiles.
 *
 * Responsável estritamente por armazenar o estado local de seus tiles
 * e a coleção de objetos naturais pertencentes à sua área espacial.
 * Desacoplado de Camera, Renderer, Player, Input e GameLoop.
 */
export class Chunk {
  public readonly coord: ChunkCoord;
  private readonly tiles: Tile[];
  private naturalObjects: WorldObject[] = [];

  constructor(
    chunkX: number,
    chunkY: number,
    defaultTileType: TileType = TileType.GRASS,
  ) {
    this.coord = { chunkX, chunkY };
    this.tiles = new Array(CHUNK_SIZE * CHUNK_SIZE);

    this.initializeTiles(defaultTileType);
  }

  private initializeTiles(defaultTileType: TileType): void {
    const totalTiles = CHUNK_SIZE * CHUNK_SIZE;
    for (let i = 0; i < totalTiles; i++) {
      this.tiles[i] = { type: defaultTileType };
    }
  }

  /**
   * Valida se as coordenadas locais estão no intervalo [0, CHUNK_SIZE - 1].
   */
  public isValidLocalCoord(localX: number, localY: number): boolean {
    return (
      localX >= 0 &&
      localX < CHUNK_SIZE &&
      localY >= 0 &&
      localY < CHUNK_SIZE
    );
  }

  /**
   * Obtém o tile em coordenadas locais do chunk.
   */
  public getTile(localX: number, localY: number): Tile | null {
    if (!this.isValidLocalCoord(localX, localY)) {
      return null;
    }
    return this.tiles[this.getLocalIndex(localX, localY)];
  }

  /**
   * Modifica o tipo do tile em coordenadas locais do chunk.
   */
  public setTile(localX: number, localY: number, type: TileType): boolean {
    if (!this.isValidLocalCoord(localX, localY)) {
      return false;
    }
    this.tiles[this.getLocalIndex(localX, localY)] = { type };
    return true;
  }

  /**
   * Retorna o total de células/tiles alocadas neste Chunk.
   */
  public getTileCount(): number {
    return this.tiles.length;
  }

  /**
   * Retorna os objetos naturais procedurais pertencentes a este Chunk.
   */
  public getNaturalObjects(): readonly WorldObject[] {
    return this.naturalObjects;
  }

  /**
   * Define os objetos naturais procedurais pertencentes a este Chunk.
   */
  public setNaturalObjects(objects: WorldObject[]): void {
    this.naturalObjects = [...objects];
  }

  private getLocalIndex(localX: number, localY: number): number {
    return localY * CHUNK_SIZE + localX;
  }
}
