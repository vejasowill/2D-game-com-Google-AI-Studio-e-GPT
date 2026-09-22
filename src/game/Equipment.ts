import { Hotbar } from './Hotbar.ts';
import { Inventory } from './Inventory.ts';
import { ItemDefinition } from './ItemDefinition.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { ItemStack } from './ItemStack.ts';

/**
 * Representação explícita e imutável do item atualmente equipado pelo Player.
 * Derivado dinamicamente do slot selecionado no Inventory.
 */
export interface EquippedItem {
  readonly slotIndex: number;
  readonly itemId: string;
  readonly quantity: number;
  readonly definition: ItemDefinition | null;
}

/**
 * Sistema e estado de Equipamento do Player.
 *
 * Princípios arquiteturais:
 * 1. O Inventory continua sendo a única fonte de verdade.
 * 2. O item equipado é derivado dinamicamente: selectedSlot -> inventory slot -> equipped item.
 * 3. Nunca armazena ou duplica instâncias de ItemStack para evitar dessincronização.
 * 4. Zero alocações no loop contínuo (steady state): reutiliza cache imutável enquanto o slot e a identidade do stack não mudarem.
 * 5. Totalmente desacoplado de World, WorldObjectManager, Colisão, Câmera e Chunks.
 *    (O item equipado na mão NÃO é um WorldObject).
 *
 * PREPARAÇÃO ARQUITETURAL PARA ANIMAÇÕES E ARTE DEFINITIVA:
 * O estado de equipamento é estritamente desacoplado do estado de animação corporal.
 * Futuramente, subsistemas de animação e renderização poderão consultar `getEquippedItem()`
 * para compor estados híbridos:
 * - IDLE + item
 * - WALK + item
 * - IDLE + ferramenta
 * - WALK + ferramenta
 * - USE_ITEM / USE_TOOL / ATTACK
 */
export class Equipment {
  private cachedEquippedItem: EquippedItem | null = null;
  private lastSlotIndex: number = -1;
  private lastStack: ItemStack | null = null;

  constructor(
    private readonly inventory: Inventory,
    private readonly hotbar: Hotbar,
  ) {}

  /**
   * Retorna o índice do slot da Hotbar atualmente selecionado.
   */
  public getSelectedSlotIndex(): number {
    return this.hotbar.getSelectedSlotIndex();
  }

  /**
   * Retorna a referência direta ao ItemStack contido no slot ativo do Inventory.
   * Retorna null se o slot estiver vazio.
   * Não duplica objetos nem realiza novas alocações de memória.
   */
  public getEquippedStack(): ItemStack | null {
    const slotIndex = this.hotbar.getSelectedSlotIndex();
    return this.inventory.getSlot(slotIndex);
  }

  /**
   * Retorna uma visão descritiva do item equipado, ou null se o slot estiver vazio.
   * Otimizado contra alocações repetidas: reutiliza a instância congelada caso nem o slot nem o stack tenham mudado.
   */
  public getEquippedItem(): EquippedItem | null {
    const slotIndex = this.hotbar.getSelectedSlotIndex();
    const stack = this.inventory.getSlot(slotIndex);

    if (stack === null) {
      this.cachedEquippedItem = null;
      this.lastSlotIndex = slotIndex;
      this.lastStack = null;
      return null;
    }

    // Se o slot e a instância imutável do stack permanecerem os mesmos, reutiliza o objeto cacheado
    if (
      this.cachedEquippedItem !== null &&
      this.lastSlotIndex === slotIndex &&
      this.lastStack === stack
    ) {
      return this.cachedEquippedItem;
    }

    this.lastSlotIndex = slotIndex;
    this.lastStack = stack;
    this.cachedEquippedItem = Object.freeze({
      slotIndex,
      itemId: stack.itemId,
      quantity: stack.quantity,
      definition: ItemRegistry.get(stack.itemId) ?? null,
    });

    return this.cachedEquippedItem;
  }

  /**
   * Verifica se há algum item atualmente equipado.
   */
  public hasEquippedItem(): boolean {
    return this.getEquippedStack() !== null;
  }
}
