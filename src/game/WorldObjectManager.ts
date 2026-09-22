import { CHUNK_SIZE, TILE_SIZE } from './constants.ts';
import { ChunkCoord, WorldCoord } from './types.ts';
import { WorldObject } from './WorldObject.ts';

/**
 * Gerenciador e armazenamento espacial dedicado para WorldObjects.
 *
 * Princípios arquiteturais:
 * - Totalmente separado do Chunk.tiles e do terreno procedural.
 * - Suporta coordenadas contínuas arbitrárias (positivas, negativas e distantes) no mundo infinito.
 * - Permite indexação espacial particionada em células de chunk (ChunkCoord) sem alocar arrays gigantes.
 * - Suporta busca por área (AABB), busca por ID e consultas por chunk para futuro streaming de objetos.
 * - Não acoplado a Renderer, Player, Camera ou Input.
 */
export class WorldObjectManager {
  /** Índice primário de objetos por ID único */
  private readonly objectsById: Map<string, WorldObject> = new Map();

  /**
   * Particionamento espacial por coordenada de chunk ("chunkX,chunkY" -> Set<objectId>).
   * Permite consultas espaciais rápidas e futura sincronização com o ciclo de vida dos chunks.
   */
  private readonly chunkIndex: Map<string, Set<string>> = new Map();

  /** Tamanho de uma célula de chunk em pixels */
  private static readonly CHUNK_PIXEL_SIZE = CHUNK_SIZE * TILE_SIZE;

  /**
   * Converte uma coordenada contínua de mundo (em pixels) para a coordenada de chunk espacial correspondente.
   * Suporta números negativos via Math.floor.
   */
  public static worldCoordToChunkCoord(coord: WorldCoord): ChunkCoord {
    const chunkX = Math.floor(coord.worldX / WorldObjectManager.CHUNK_PIXEL_SIZE);
    const chunkY = Math.floor(coord.worldY / WorldObjectManager.CHUNK_PIXEL_SIZE);
    return { chunkX, chunkY };
  }

  /**
   * Chave determinística de chunk para indexação interna.
   */
  private static getChunkKey(chunkX: number, chunkY: number): string {
    return `${chunkX},${chunkY}`;
  }

  /**
   * Adiciona um WorldObject ao armazenamento espacial.
   * Cria uma cópia defensiva da posição para proteger a invariância do índice espacial.
   * Retorna true se adicionado com sucesso, ou false se um objeto com o mesmo ID já existir.
   */
  public addObject(object: WorldObject): boolean {
    if (this.objectsById.has(object.id)) {
      return false;
    }

    this.objectsById.set(object.id, object);

    // Indexar nas células espaciais tocadas pelo AABB do objeto
    const touchedChunks = this.getChunksTouchedByObject(object);
    for (const chunkCoord of touchedChunks) {
      const key = WorldObjectManager.getChunkKey(chunkCoord.chunkX, chunkCoord.chunkY);
      let set = this.chunkIndex.get(key);
      if (!set) {
        set = new Set<string>();
        this.chunkIndex.set(key, set);
      }
      set.add(object.id);
    }

    return true;
  }

  /**
   * Move um WorldObject de forma atômica e atualiza seu índice espacial.
   *
   * Requisitos atendidos:
   * - Localiza o objeto pelo ID;
   * - Descobre as células/chunks antigas e as novas células tocadas;
   * - Se o conjunto de chunks não mudar, apenas atualiza a posição do objeto (otimização);
   * - Se mudar, remove o ID das células antigas que não são mais tocadas e adiciona nas novas;
   * - Preserva a integridade do índice mesmo com coordenadas negativas ou fronteiras de chunks;
   * - Impede referências duplicadas ou referências fantasmas obsoletas no índice;
   * - Retorna true se o objeto foi encontrado e movido, ou false se não existir.
   */
  public moveObject(id: string, newPosition: WorldCoord): boolean {
    const object = this.objectsById.get(id);
    if (!object) {
      return false;
    }

    const oldChunks = this.getChunksTouchedByObject(object);
    const oldKeys = new Set(
      oldChunks.map((c) => WorldObjectManager.getChunkKey(c.chunkX, c.chunkY)),
    );

    // Atualizar posição mantendo a instância do objeto
    (object as { position: WorldCoord }).position = { worldX: newPosition.worldX, worldY: newPosition.worldY };

    const newChunks = this.getChunksTouchedByObject(object);
    const newKeys = new Set(
      newChunks.map((c) => WorldObjectManager.getChunkKey(c.chunkX, c.chunkY)),
    );

    // Verificar se houve alteração nos chunks tocados
    let chunksChanged = oldKeys.size !== newKeys.size;
    if (!chunksChanged) {
      for (const k of oldKeys) {
        if (!newKeys.has(k)) {
          chunksChanged = true;
          break;
        }
      }
    }

    if (chunksChanged) {
      // Remover das células antigas que não estão mais presentes
      for (const oldKey of oldKeys) {
        if (!newKeys.has(oldKey)) {
          const set = this.chunkIndex.get(oldKey);
          if (set) {
            set.delete(id);
            if (set.size === 0) {
              this.chunkIndex.delete(oldKey);
            }
          }
        }
      }

      // Adicionar às novas células
      for (const newKey of newKeys) {
        if (!oldKeys.has(newKey)) {
          let set = this.chunkIndex.get(newKey);
          if (!set) {
            set = new Set<string>();
            this.chunkIndex.set(newKey, set);
          }
          set.add(id);
        }
      }
    }

    return true;
  }

  /**
   * Alias de conveniência para mover ou atualizar a posição de um objeto.
   */
  public updateObjectPosition(id: string, newPosition: WorldCoord): boolean {
    return this.moveObject(id, newPosition);
  }

  /**
   * Atualiza o estado interno de um WorldObject mesclando o novo patch com o estado prévio.
   * Não afeta índices espaciais nem a posição do objeto.
   * Retorna true se o objeto foi localizado e atualizado.
   */
  public updateObjectState(id: string, statePatch: Readonly<Record<string, unknown>>): boolean {
    const object = this.objectsById.get(id);
    if (!object) {
      return false;
    }

    const previousState = object.state ?? {};
    const newState: Readonly<Record<string, unknown>> = {
      ...previousState,
      ...statePatch,
    };

    (object as { state: Readonly<Record<string, unknown>> }).state = newState;
    return true;
  }

  /**
   * Recupera o estado de um WorldObject pelo ID.
   */
  public getObjectState(id: string): Readonly<Record<string, unknown>> | undefined {
    return this.objectsById.get(id)?.state;
  }

  /**
   * Recupera um WorldObject pelo seu ID estável.
   */
  public getObjectById(id: string): WorldObject | null {
    return this.objectsById.get(id) ?? null;
  }

  /**
   * Verifica se um objeto com o ID fornecido existe.
   */
  public hasObject(id: string): boolean {
    return this.objectsById.has(id);
  }

  /**
   * Remove um WorldObject do armazenamento e de todos os índices espaciais.
   * Retorna true se o objeto existia e foi removido.
   */
  public removeObject(id: string): boolean {
    const object = this.objectsById.get(id);
    if (!object) {
      return false;
    }

    // Remover dos índices de chunk tocados
    const touchedChunks = this.getChunksTouchedByObject(object);
    for (const chunkCoord of touchedChunks) {
      const key = WorldObjectManager.getChunkKey(chunkCoord.chunkX, chunkCoord.chunkY);
      const set = this.chunkIndex.get(key);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          this.chunkIndex.delete(key);
        }
      }
    }

    this.objectsById.delete(id);
    return true;
  }

  /**
   * Retorna a quantidade total de WorldObjects armazenados.
   */
  public getObjectCount(): number {
    return this.objectsById.size;
  }

  /**
   * Retorna todos os objetos contidos ou que tocam a célula do chunk especificado.
   * Suporta coordenadas positivas e negativas.
   */
  public getObjectsInChunk(chunkX: number, chunkY: number): WorldObject[] {
    const key = WorldObjectManager.getChunkKey(chunkX, chunkY);
    const idSet = this.chunkIndex.get(key);
    if (!idSet || idSet.size === 0) {
      return [];
    }

    const result: WorldObject[] = [];
    for (const id of idSet) {
      const obj = this.objectsById.get(id);
      if (obj) {
        result.push(obj);
      }
    }
    return result;
  }

  /**
   * Retorna todos os objetos que intersectam uma área retangular no espaço do mundo.
   * Adequado para culling, consultas de visibilidade e futuras checagens de colisão.
   */
  public getObjectsInArea(
    minX: number,
    minY: number,
    width: number,
    height: number,
  ): WorldObject[] {
    const maxX = minX + width;
    const maxY = minY + height;

    const minChunk = WorldObjectManager.worldCoordToChunkCoord({ worldX: minX, worldY: minY });
    const maxChunk = WorldObjectManager.worldCoordToChunkCoord({ worldX: maxX, worldY: maxY });

    const visitedIds = new Set<string>();
    const result: WorldObject[] = [];

    for (let cy = minChunk.chunkY; cy <= maxChunk.chunkY; cy++) {
      for (let cx = minChunk.chunkX; cx <= maxChunk.chunkX; cx++) {
        const key = WorldObjectManager.getChunkKey(cx, cy);
        const idSet = this.chunkIndex.get(key);
        if (!idSet) continue;

        for (const id of idSet) {
          if (visitedIds.has(id)) continue;
          visitedIds.add(id);

          const obj = this.objectsById.get(id);
          if (!obj) continue;

          // Teste AABB preciso
          const objMaxX = obj.position.worldX + obj.width;
          const objMaxY = obj.position.worldY + obj.height;

          const intersects =
            obj.position.worldX < maxX &&
            objMaxX > minX &&
            obj.position.worldY < maxY &&
            objMaxY > minY;

          if (intersects) {
            result.push(obj);
          }
        }
      }
    }

    return result;
  }

  /**
   * Retorna todos os WorldObjects registrados.
   */
  public getAllObjects(): WorldObject[] {
    return Array.from(this.objectsById.values());
  }

  /**
   * Limpa todos os objetos armazenados.
   */
  public clear(): void {
    this.objectsById.clear();
    this.chunkIndex.clear();
  }

  /**
   * Calcula todas as células de chunk tocadas pela caixa delimitadora (AABB) do objeto.
   */
  private getChunksTouchedByObject(object: WorldObject): ChunkCoord[] {
    const minChunk = WorldObjectManager.worldCoordToChunkCoord(object.position);
    const maxCoord: WorldCoord = {
      worldX: object.position.worldX + Math.max(0, object.width - 0.001),
      worldY: object.position.worldY + Math.max(0, object.height - 0.001),
    };
    const maxChunk = WorldObjectManager.worldCoordToChunkCoord(maxCoord);

    const coords: ChunkCoord[] = [];
    for (let cy = minChunk.chunkY; cy <= maxChunk.chunkY; cy++) {
      for (let cx = minChunk.chunkX; cx <= maxChunk.chunkX; cx++) {
        coords.push({ chunkX: cx, chunkY: cy });
      }
    }
    return coords;
  }
}
