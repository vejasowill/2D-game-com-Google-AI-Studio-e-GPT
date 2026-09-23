import { CHUNK_SIZE } from './constants.ts';
import { TileType } from './types.ts';

/**
 * Representa um registro atômico de modificação de tile no mundo realizada pelo jogador.
 */
export interface TileModification {
  readonly tileX: number;
  readonly tileY: number;
  readonly type: TileType;
  readonly modifiedAt?: number;
}

/**
 * Registro em tempo de execução para modificações de terreno efetuadas pelo jogador.
 *
 * Princípios arquiteturais:
 * 1. Não copia o mundo inteiro para a memória: armazena apenas células explicitamente modificadas;
 * 2. Puramente determinístico e espacial: indexação O(1) com suporte pleno a coordenadas
 *    positivas, negativas, fronteiras de chunks e grandes distâncias;
 * 3. Consultas O(1) leves sem NUNCA materializar ou alocar Chunks no ChunkManager;
 * 4. Sobrevive aos ciclos de streaming de chunks (unload e reload);
 * 5. Agrupamento por chunk em índice secundário O(1) para restauração rápida ao carregar chunks;
 * 6. Desacoplado de Renderer, Canvas, Input e física do Player.
 */
export class TileModificationRegistry {
  /** Armazenamento principal indexado pela chave global estável `tileX,tileY` */
  private readonly modifications: Map<string, TileModification> = new Map();

  /** Índice secundário para mapear chave de chunk `chunkX,chunkY` para as chaves de tiles modificados */
  private readonly chunkTileIndex: Map<string, Set<string>> = new Map();

  /**
   * Constrói a chave determinística única para uma coordenada global de tile.
   * Formato estável: `<tileX>,<tileY>`
   */
  public static createCoordKey(tileX: number, tileY: number): string {
    return `${Math.floor(tileX)},${Math.floor(tileY)}`;
  }

  /**
   * Constrói a chave determinística para uma coordenada de chunk.
   * Formato estável: `<chunkX>,<chunkY>`
   */
  public static createChunkKey(chunkX: number, chunkY: number): string {
    return `${Math.floor(chunkX)},${Math.floor(chunkY)}`;
  }

  /**
   * Registra ou atualiza a modificação de um tile.
   * Operação idempotente e imune a duplicações na mesma coordenada.
   */
  public registerModification(modification: TileModification): void {
    const tileX = Math.floor(modification.tileX);
    const tileY = Math.floor(modification.tileY);
    const coordKey = TileModificationRegistry.createCoordKey(tileX, tileY);

    const chunkX = Math.floor(tileX / CHUNK_SIZE);
    const chunkY = Math.floor(tileY / CHUNK_SIZE);
    const chunkKey = TileModificationRegistry.createChunkKey(chunkX, chunkY);

    // Salva ou sobrescreve no mapa principal
    this.modifications.set(coordKey, {
      tileX,
      tileY,
      type: modification.type,
      modifiedAt: modification.modifiedAt,
    });

    // Atualiza índice de chunks
    let chunkSet = this.chunkTileIndex.get(chunkKey);
    if (!chunkSet) {
      chunkSet = new Set();
      this.chunkTileIndex.set(chunkKey, chunkSet);
    }
    chunkSet.add(coordKey);
  }

  /**
   * Remove o registro de modificação em uma coordenada global, restaurando o estado procedural original.
   */
  public removeModification(tileX: number, tileY: number): boolean {
    const normalizedX = Math.floor(tileX);
    const normalizedY = Math.floor(tileY);
    const coordKey = TileModificationRegistry.createCoordKey(normalizedX, normalizedY);

    const existed = this.modifications.delete(coordKey);
    if (existed) {
      const chunkX = Math.floor(normalizedX / CHUNK_SIZE);
      const chunkY = Math.floor(normalizedY / CHUNK_SIZE);
      const chunkKey = TileModificationRegistry.createChunkKey(chunkX, chunkY);
      const chunkSet = this.chunkTileIndex.get(chunkKey);
      if (chunkSet) {
        chunkSet.delete(coordKey);
        if (chunkSet.size === 0) {
          this.chunkTileIndex.delete(chunkKey);
        }
      }
    }
    return existed;
  }

  /**
   * Consulta se existe uma modificação registrada na coordenada especificada.
   * Custo O(1), sem materializar chunks.
   */
  public hasModification(tileX: number, tileY: number): boolean {
    const coordKey = TileModificationRegistry.createCoordKey(tileX, tileY);
    return this.modifications.has(coordKey);
  }

  /**
   * Obtém a modificação registrada na coordenada especificada, ou null caso permaneça puramente procedural.
   * Custo O(1), sem materializar chunks.
   */
  public getModification(tileX: number, tileY: number): TileModification | null {
    const coordKey = TileModificationRegistry.createCoordKey(tileX, tileY);
    return this.modifications.get(coordKey) ?? null;
  }

  /**
   * Retorna todas as modificações pertencentes a uma determinada coordenada de Chunk.
   * Permite reidratar chunks recarregados de forma extremamente eficiente sem varrer o mapa inteiro.
   */
  public getModificationsInChunk(chunkX: number, chunkY: number): readonly TileModification[] {
    const chunkKey = TileModificationRegistry.createChunkKey(chunkX, chunkY);
    const coordKeys = this.chunkTileIndex.get(chunkKey);
    if (!coordKeys || coordKeys.size === 0) {
      return [];
    }

    const result: TileModification[] = [];
    for (const key of coordKeys) {
      const mod = this.modifications.get(key);
      if (mod) {
        result.push(mod);
      }
    }
    return result;
  }

  /**
   * Retorna o total de modificações registradas globalmente na sessão.
   */
  public getModificationCount(): number {
    return this.modifications.size;
  }

  /**
   * Retorna uma cópia somente-leitura de todas as modificações registradas.
   */
  public getAllModifications(): readonly TileModification[] {
    return Array.from(this.modifications.values());
  }

  /**
   * Limpa todas as modificações registradas (redefinindo o mundo para o estado puramente procedural).
   */
  public clear(): void {
    this.modifications.clear();
    this.chunkTileIndex.clear();
  }
}
