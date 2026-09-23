import { WorldObject } from './WorldObject.ts';
import { isNaturalObject } from './NaturalObjectDefinition.ts';

/**
 * Registro de persistência em memória para entidades e objetos naturais procedurais
 * que foram destruídos permanentemente pelo jogador durante a sessão atual do mundo.
 *
 * Princípios arquiteturais:
 * 1. Genérico e desacoplado: nunca verifica tipos concretos como 'tree', 'rock', etc.
 * 2. Puramente espacial e determinístico: opera a partir de IDs estáveis canônicos.
 * 3. Consultas O(1) de custo desprezível sem jamais materializar ou alocar chunks no ChunkManager.
 * 4. Sobrevive a múltiplos ciclos de streaming (descarregamento e recarregamento de chunks).
 * 5. Suporta coordenadas negativas, bordas de chunks e múltiplos objetos destruídos.
 */
export class DestroyedNaturalObjectRegistry {
  private readonly destroyedIds: Set<string> = new Set();

  /**
   * Constrói o identificador canônico estável para um objeto natural procedural
   * baseado em seu tipo natural e nas coordenadas globais de tile.
   * Formato estável: natural:<naturalType>:<tileX>:<tileY>
   */
  public static createCanonicalId(naturalType: string, tileX: number, tileY: number): string {
    return `natural:${naturalType}:${tileX}:${tileY}`;
  }

  /**
   * Registra a destruição permanente de um objeto pelo seu identificador único/estável.
   */
  public registerDestroyed(objectId: string): void {
    if (objectId && objectId.trim().length > 0) {
      this.destroyedIds.add(objectId);
    }
  }

  /**
   * Registra a destruição permanente baseada na localização espacial e tipo do objeto natural.
   */
  public registerDestroyedAt(naturalType: string, tileX: number, tileY: number): void {
    const canonicalId = DestroyedNaturalObjectRegistry.createCanonicalId(naturalType, tileX, tileY);
    this.destroyedIds.add(canonicalId);
  }

  /**
   * Registra um WorldObject como permanentemente destruído.
   * Se for um NaturalObject com metadados espaciais de origem, registra tanto o ID
   * concreto quanto o ID canônico para garantir correspondência bidirecional.
   */
  public registerDestroyedObject(object: WorldObject): void {
    if (!object || !object.id) return;

    this.registerDestroyed(object.id);

    if (isNaturalObject(object)) {
      this.registerDestroyedAt(object.naturalType, object.sourceTileX, object.sourceTileY);
    }
  }

  /**
   * Consulta se um objeto com o ID fornecido está marcado como destruído.
   * Operação O(1) puramente em memória: NUNCA materializa chunks.
   */
  public isDestroyed(objectId: string): boolean {
    return this.destroyedIds.has(objectId);
  }

  /**
   * Consulta se um objeto natural nas coordenadas globais de tile especificadas está destruído.
   * Operação O(1) puramente em memória: NUNCA materializa chunks.
   */
  public isDestroyedAt(naturalType: string, tileX: number, tileY: number): boolean {
    const canonicalId = DestroyedNaturalObjectRegistry.createCanonicalId(naturalType, tileX, tileY);
    return this.destroyedIds.has(canonicalId);
  }

  /**
   * Verifica se uma instância de WorldObject (ou NaturalObject procedural) está destruída.
   * Checa tanto o ID da instância quanto a coordenada canônica se for um NaturalObject.
   * Operação O(1) que nunca materializa chunks.
   */
  public isDestroyedObject(object: WorldObject): boolean {
    if (!object) return false;

    if (this.destroyedIds.has(object.id)) {
      return true;
    }

    if (isNaturalObject(object)) {
      const canonicalId = DestroyedNaturalObjectRegistry.createCanonicalId(
        object.naturalType,
        object.sourceTileX,
        object.sourceTileY,
      );
      return this.destroyedIds.has(canonicalId);
    }

    return false;
  }

  /**
   * Remove o registro de destruição de um objeto (útil para testes determinísticos ou mecânicas de regeneração).
   */
  public unregister(objectId: string): boolean {
    return this.destroyedIds.delete(objectId);
  }

  /**
   * Remove todos os registros de destruição.
   */
  public clear(): void {
    this.destroyedIds.clear();
  }

  /**
   * Retorna a quantidade total de objetos marcados como destruídos.
   */
  public getDestroyedCount(): number {
    return this.destroyedIds.size;
  }

  /**
   * Retorna uma visualização somente-leitura dos IDs destruídos.
   */
  public getAllDestroyedIds(): ReadonlySet<string> {
    return this.destroyedIds;
  }
}
