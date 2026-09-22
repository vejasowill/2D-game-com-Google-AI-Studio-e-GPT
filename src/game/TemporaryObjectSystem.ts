import { World } from './World.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { isTemporaryWorldObject, TemporaryWorldObject } from './TemporaryWorldObject.ts';
import { WorldObject } from './WorldObject.ts';

interface LifecycleHeapEntry {
  readonly id: string;
  readonly expiresAt: number;
}

/**
 * Sistema dedicado ao gerenciamento do ciclo de vida e expiração de WorldObjects temporários.
 *
 * Princípios arquiteturais:
 * 1. Baseado puramente em contratos e metadados de ciclo de vida (isTemporaryWorldObject),
 *    sem checagens acopladas a tipos específicos (zero `if (type === 'item_drop')`).
 * 2. Utiliza Min-Heap (Priority Queue por expiresAt) + Map indexador:
 *    - Custo por frame quando nenhum objeto expira: O(1) (inspeciona apenas a raiz do heap).
 *    - NUNCA realiza varreduras completas sobre todos os WorldObjects do mundo a cada frame.
 * 3. Utiliza relógio de simulação monotônico e determinístico (currentTime incrementado por deltaTime).
 * 4. Delega a remoção de objetos estritamente através do WorldMutationHandler ('remove_object').
 * 5. Totalmente desacoplado de física, colisão, renderização e inventário.
 * 6. Suporta coordenadas negativas e integridade sob streaming de chunks.
 */
export class TemporaryObjectSystem {
  /** Timestamp atual da simulação do mundo em segundos */
  private currentTime: number;

  /** Min-heap contendo as entradas ordenadas por expiresAt crescente */
  private readonly minHeap: LifecycleHeapEntry[] = [];

  /** Tabela de dispersão para busca e validação O(1) por ID estável */
  private readonly entriesById: Map<string, LifecycleHeapEntry> = new Map();

  /** Métrica de instrumentação: quantidade de nós do heap inspecionados no último update */
  private lastInspectedCount: number = 0;

  constructor(initialTime: number = 0) {
    this.currentTime = initialTime >= 0 ? initialTime : 0;
  }

  /**
   * Retorna o tempo de simulação atual do sistema (em segundos).
   */
  public getTime(): number {
    return this.currentTime;
  }

  /**
   * Ajusta o tempo de simulação diretamente (útil para testes determinísticos sem esperas reais).
   */
  public setTime(time: number): void {
    if (time >= 0) {
      this.currentTime = time;
    }
  }

  /**
   * Registra um WorldObject no sistema de ciclo de vida caso ele seja temporário.
   * Retorna true se registrado com sucesso, ou false caso seja permanente ou já esteja registrado.
   */
  public register(
    object: WorldObject,
    createdAtOverride?: number,
    ttlOverride?: number,
  ): boolean {
    if (!object || !object.id) {
      return false;
    }

    // Se já estiver registrado, não duplica
    if (this.entriesById.has(object.id)) {
      return false;
    }

    let expiresAt: number;

    if (isTemporaryWorldObject(object)) {
      const createdAt = createdAtOverride ?? object.lifecycle.createdAt;
      const ttl = ttlOverride ?? object.lifecycle.ttl;
      expiresAt = Number.isFinite(ttl) && ttl > 0 ? createdAt + ttl : Infinity;
    } else if (ttlOverride !== undefined && Number.isFinite(ttlOverride) && ttlOverride > 0) {
      const createdAt = createdAtOverride ?? this.currentTime;
      expiresAt = createdAt + ttlOverride;
    } else {
      // Objeto permanente: não participa do sistema de expiração
      return false;
    }

    if (!Number.isFinite(expiresAt)) {
      return false;
    }

    const entry: LifecycleHeapEntry = {
      id: object.id,
      expiresAt,
    };

    this.entriesById.set(object.id, entry);
    this.heapPush(entry);
    return true;
  }

  /**
   * Remove o rastreamento de um objeto do lifecycle (ex: quando coletado ou removido pelo jogo).
   * Operação O(1) via mapa; a entrada obsoleta no heap é limpa de forma preguiçosa (lazy deletion).
   */
  public unregister(objectId: string): boolean {
    const existed = this.entriesById.delete(objectId);
    if (this.entriesById.size === 0) {
      this.minHeap.length = 0;
    }
    return existed;
  }

  /**
   * Verifica se o objeto está sendo ativamente rastreado pelo sistema.
   */
  public isTracking(objectId: string): boolean {
    return this.entriesById.has(objectId);
  }

  /**
   * Retorna o tempo restante de vida útil do objeto em segundos, ou null se não for rastreado.
   */
  public getRemainingTtl(objectId: string): number | null {
    const entry = this.entriesById.get(objectId);
    if (!entry) {
      return null;
    }
    return Math.max(0, entry.expiresAt - this.currentTime);
  }

  /**
   * Retorna a quantidade de objetos temporários ativamente rastreados.
   */
  public getTrackedCount(): number {
    return this.entriesById.size;
  }

  /**
   * Retorna a métrica da última checagem: quantidade de elementos inspecionados no frame anterior.
   * Prova quantitativa de ausência de varredura global O(N).
   */
  public getLastInspectedCount(): number {
    return this.lastInspectedCount;
  }

  /**
   * Atualiza o sistema com o deltaTime decorrido, avança o relógio e remove objetos expirados.
   * Retorna a quantidade de objetos que expiraram e foram removidos nesta atualização.
   */
  public update(world: World, deltaTime: number): number {
    if (deltaTime > 0) {
      this.currentTime += deltaTime;
    }

    let expiredCount = 0;
    this.lastInspectedCount = 0;

    while (this.minHeap.length > 0) {
      this.lastInspectedCount++;
      const top = this.minHeap[0];

      // Se a entrada foi removida previamente (coleta ou remoção externa), descartar do heap
      if (!this.entriesById.has(top.id)) {
        this.heapPop();
        continue;
      }

      // Se a raiz do min-heap ainda não expirou, nenhum outro elemento expirou (propriedade do heap)
      if (top.expiresAt > this.currentTime) {
        break;
      }

      // O objeto no topo do heap atingiu ou ultrapassou sua data de expiração
      this.heapPop();
      this.entriesById.delete(top.id);
      expiredCount++;

      // Solicitar remoção idempotente através do WorldMutationHandler
      WorldMutationHandler.applyMutation(world, {
        type: 'remove_object',
        objectId: top.id,
      });
    }

    return expiredCount;
  }

  /**
   * Limpa todos os dados internos do sistema de ciclo de vida.
   */
  public clear(): void {
    this.minHeap.length = 0;
    this.entriesById.clear();
    this.lastInspectedCount = 0;
  }

  // =========================================================================
  // Operações de Min-Heap
  // =========================================================================

  private heapPush(entry: LifecycleHeapEntry): void {
    this.minHeap.push(entry);
    this.siftUp(this.minHeap.length - 1);
  }

  private heapPop(): LifecycleHeapEntry | undefined {
    if (this.minHeap.length === 0) {
      return undefined;
    }
    const root = this.minHeap[0];
    const last = this.minHeap.pop()!;
    if (this.minHeap.length > 0) {
      this.minHeap[0] = last;
      this.siftDown(0);
    }
    return root;
  }

  private siftUp(startIndex: number): void {
    let index = startIndex;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.minHeap[index].expiresAt < this.minHeap[parentIndex].expiresAt) {
        const temp = this.minHeap[index];
        this.minHeap[index] = this.minHeap[parentIndex];
        this.minHeap[parentIndex] = temp;
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private siftDown(startIndex: number): void {
    let index = startIndex;
    const length = this.minHeap.length;

    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < length &&
        this.minHeap[leftChild].expiresAt < this.minHeap[smallest].expiresAt
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < length &&
        this.minHeap[rightChild].expiresAt < this.minHeap[smallest].expiresAt
      ) {
        smallest = rightChild;
      }

      if (smallest !== index) {
        const temp = this.minHeap[index];
        this.minHeap[index] = this.minHeap[smallest];
        this.minHeap[smallest] = temp;
        index = smallest;
      } else {
        break;
      }
    }
  }
}
