import { DEFAULT_MAX_STACK_SIZE } from './ItemDefinition.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import {
  ItemStack,
  addToStack,
  canMergeStacks,
  createItemStack,
  isValidItemStack,
  removeFromStack,
  splitStack,
} from './ItemStack.ts';

export const DEFAULT_INVENTORY_SLOT_COUNT = 20;

/**
 * Sistema genérico de inventário desacoplado de World, Renderer e Input.
 *
 * Princípios arquiteturais:
 * 1. Opera exclusivamente através de instâncias e funções puras de ItemStack.
 * 2. Slots vazios são representados estritamente por null (nunca cria ItemStacks inválidos ou vazios).
 * 3. Totalmente agnóstico a regras específicas de gameplay (não contém 'if (itemId === "wood")').
 * 4. Preserva integralmente todas as invariantes matemáticas de ItemStack.
 * 5. Não depende de Canvas, DOM ou World.
 */
export class Inventory {
  private readonly slots: (ItemStack | null)[];
  private readonly slotCount: number;

  constructor(slotCount: number = DEFAULT_INVENTORY_SLOT_COUNT) {
    if (!Number.isInteger(slotCount) || slotCount <= 0) {
      throw new Error(`[Inventory] Quantidade de slots inválida: ${slotCount}. Deve ser um inteiro > 0.`);
    }

    this.slotCount = slotCount;
    this.slots = new Array<ItemStack | null>(slotCount).fill(null);
  }

  /**
   * Retorna o número total de slots configurados no inventário.
   */
  public getSlotCount(): number {
    return this.slotCount;
  }

  /**
   * Valida se o índice de slot está dentro do intervalo permitido [0, slotCount - 1].
   */
  public isValidSlotIndex(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.slotCount;
  }

  /**
   * Consulta o conteúdo de determinado slot.
   * Retorna ItemStack ou null caso esteja vazio.
   */
  public getSlot(index: number): ItemStack | null {
    if (!this.isValidSlotIndex(index)) {
      return null;
    }
    return this.slots[index];
  }

  /**
   * Retorna todos os slots como array imutável de leitura.
   */
  public getAllSlots(): readonly (ItemStack | null)[] {
    return Object.freeze([...this.slots]);
  }

  /**
   * Verifica se todos os slots do inventário estão ocupados.
   */
  public isFull(): boolean {
    return this.slots.every((slot) => slot !== null);
  }

  /**
   * Verifica se todos os slots do inventário estão vazios.
   */
  public isEmpty(): boolean {
    return this.slots.every((slot) => slot === null);
  }

  /**
   * Consulta a quantidade total acumulada de determinado item em todos os slots.
   */
  public getItemCount(itemId: string): number {
    if (!itemId || typeof itemId !== 'string') {
      return 0;
    }
    const targetId = itemId.trim();
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.itemId === targetId) {
        total += slot.quantity;
      }
    }
    return total;
  }

  /**
   * Retorna o limite máximo de empilhamento para um item, consultando o ItemRegistry.
   */
  private getMaxStackSize(itemId: string): number {
    const def = ItemRegistry.get(itemId);
    return def?.maxStackSize ?? DEFAULT_MAX_STACK_SIZE;
  }

  /**
   * Adiciona um ItemStack ao inventário respeitando a estratégia de empilhamento:
   * 1. Preenche primeiro stacks já existentes do mesmo item;
   * 2. Em seguida, aloca em slots vazios;
   * 3. Retorna a quantidade total efetivamente adicionada e eventual sobra (remainder).
   *
   * @throws {Error} Se o stack fornecido violar as invariantes de ItemStack.
   */
  public addItemStack(stack: ItemStack): { readonly added: number; readonly remainder: ItemStack | null } {
    if (!isValidItemStack(stack)) {
      throw new Error(`[Inventory] Tentativa de adicionar ItemStack inválido: ${JSON.stringify(stack)}`);
    }

    const maxStack = this.getMaxStackSize(stack.itemId);
    let remainingAmount = stack.quantity;
    let totalAdded = 0;

    // Fase 1: Preencher stacks existentes do mesmo item
    for (let i = 0; i < this.slotCount; i++) {
      if (remainingAmount <= 0) break;

      const current = this.slots[i];
      if (current !== null && current.itemId === stack.itemId && canMergeStacks(current, stack, maxStack)) {
        const result = addToStack(current, remainingAmount, maxStack);
        const addedToSlot = result.updated.quantity - current.quantity;

        this.slots[i] = result.updated;
        totalAdded += addedToSlot;
        remainingAmount = result.remainder;
      }
    }

    // Fase 2: Preencher slots vazios se ainda sobrar quantidade
    for (let i = 0; i < this.slotCount; i++) {
      if (remainingAmount <= 0) break;

      if (this.slots[i] === null) {
        const amountForSlot = Math.min(remainingAmount, maxStack);
        this.slots[i] = createItemStack(stack.itemId, amountForSlot, maxStack);
        totalAdded += amountForSlot;
        remainingAmount -= amountForSlot;
      }
    }

    // Fase 3: Preparar o resultado com o remainder se não coube tudo
    const remainder = remainingAmount > 0 ? createItemStack(stack.itemId, remainingAmount, maxStack) : null;

    return {
      added: totalAdded,
      remainder,
    };
  }

  /**
   * Remove uma quantidade de determinado item através dos slots do inventário.
   *
   * @param itemId Identificador do item a ser removido.
   * @param amount Quantidade a ser removida (inteiro positivo).
   * @returns Quantidade efetivamente removida e quantidade restante que não pôde ser suprida.
   */
  public removeItem(
    itemId: string,
    amount: number,
  ): { readonly removed: number; readonly remainingNeeded: number } {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`[Inventory] Quantidade a remover inválida: ${amount}. Deve ser um inteiro > 0.`);
    }

    const targetId = itemId.trim();
    let needed = amount;
    let totalRemoved = 0;

    for (let i = 0; i < this.slotCount; i++) {
      if (needed <= 0) break;

      const slot = this.slots[i];
      if (slot && slot.itemId === targetId) {
        const removeResult = removeFromStack(slot, needed);
        this.slots[i] = removeResult.updated;
        totalRemoved += removeResult.removed;
        needed -= removeResult.removed;
      }
    }

    return {
      removed: totalRemoved,
      remainingNeeded: needed,
    };
  }

  /**
   * Remove uma quantidade ou o stack completo de um slot específico.
   */
  public removeSlotItem(
    slotIndex: number,
    amount?: number,
  ): { readonly removedStack: ItemStack | null; readonly remainingInSlot: ItemStack | null } {
    if (!this.isValidSlotIndex(slotIndex)) {
      return { removedStack: null, remainingInSlot: null };
    }

    const slot = this.slots[slotIndex];
    if (!slot) {
      return { removedStack: null, remainingInSlot: null };
    }

    if (amount === undefined || amount >= slot.quantity) {
      this.slots[slotIndex] = null;
      return { removedStack: slot, remainingInSlot: null };
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`[Inventory] Quantidade a remover do slot inválida: ${amount}`);
    }

    const result = removeFromStack(slot, amount);
    this.slots[slotIndex] = result.updated;

    return {
      removedStack: createItemStack(slot.itemId, result.removed),
      remainingInSlot: result.updated,
    };
  }

  /**
   * Define manualmente o conteúdo de um slot.
   */
  public setSlot(slotIndex: number, stack: ItemStack | null): void {
    if (!this.isValidSlotIndex(slotIndex)) {
      throw new Error(`[Inventory] Índice de slot fora do intervalo: ${slotIndex}`);
    }

    if (stack !== null) {
      const maxStack = this.getMaxStackSize(stack.itemId);
      if (!isValidItemStack(stack, maxStack)) {
        throw new Error(`[Inventory] ItemStack inválido para setSlot: ${JSON.stringify(stack)}`);
      }
    }

    this.slots[slotIndex] = stack;
  }

  /**
   * Esvazia um determinado slot e retorna o stack que estava presente nele.
   */
  public clearSlot(slotIndex: number): ItemStack | null {
    if (!this.isValidSlotIndex(slotIndex)) {
      return null;
    }
    const previous = this.slots[slotIndex];
    this.slots[slotIndex] = null;
    return previous;
  }

  /**
   * Troca ou funde o conteúdo entre dois slots.
   * Se ambos contiverem o mesmo item, tenta empilhar de fromIndex para toIndex até o limite.
   * Caso contrário, troca as posições diretamente.
   */
  public swapSlots(fromIndex: number, toIndex: number): boolean {
    if (!this.isValidSlotIndex(fromIndex) || !this.isValidSlotIndex(toIndex)) {
      return false;
    }

    if (fromIndex === toIndex) {
      return true;
    }

    const fromSlot = this.slots[fromIndex];
    const toSlot = this.slots[toIndex];

    // Se ambos possuem o mesmo item, realiza empilhamento
    if (fromSlot && toSlot && fromSlot.itemId === toSlot.itemId) {
      const maxStack = this.getMaxStackSize(toSlot.itemId);
      if (toSlot.quantity < maxStack) {
        const addResult = addToStack(toSlot, fromSlot.quantity, maxStack);
        this.slots[toIndex] = addResult.updated;

        if (addResult.remainder > 0) {
          this.slots[fromIndex] = createItemStack(fromSlot.itemId, addResult.remainder, maxStack);
        } else {
          this.slots[fromIndex] = null;
        }
        return true;
      }
    }

    // Troca direta
    this.slots[fromIndex] = toSlot;
    this.slots[toIndex] = fromSlot;
    return true;
  }

  /**
   * Divide uma quantidade do stack contido em fromIndex e transfere para toIndex.
   * Se toIndex estiver vazio, aloca o novo stack lá.
   * Se toIndex contiver o mesmo item, empilha até o limite disponível.
   */
  public splitSlot(fromIndex: number, amount: number, toIndex: number): boolean {
    if (!this.isValidSlotIndex(fromIndex) || !this.isValidSlotIndex(toIndex)) {
      return false;
    }

    if (fromIndex === toIndex) {
      return false;
    }

    const source = this.slots[fromIndex];
    if (!source || !Number.isInteger(amount) || amount <= 0 || amount >= source.quantity) {
      return false;
    }

    const target = this.slots[toIndex];
    const maxStack = this.getMaxStackSize(source.itemId);

    if (target === null) {
      const { primary, split } = splitStack(source, amount);
      this.slots[fromIndex] = primary;
      this.slots[toIndex] = split;
      return true;
    }

    if (target.itemId === source.itemId && target.quantity < maxStack) {
      const available = maxStack - target.quantity;
      const transferAmount = Math.min(amount, available);
      if (transferAmount <= 0) return false;

      const removeResult = removeFromStack(source, transferAmount);
      const addResult = addToStack(target, transferAmount, maxStack);

      this.slots[fromIndex] = removeResult.updated;
      this.slots[toIndex] = addResult.updated;
      return true;
    }

    return false;
  }

  /**
   * Limpa todos os slots do inventário.
   */
  public clear(): void {
    this.slots.fill(null);
  }
}
