import { DEFAULT_HOTBAR_SLOT_COUNT } from './constants.ts';

/**
 * Camada de seleção rápida de slots (Hotbar).
 *
 * Princípios arquiteturais:
 * 1. O Inventário permanece a única fonte da verdade: a Hotbar gerencia estritamente o índice do slot ativo.
 * 2. Suporta seleção direta, navegação sequencial (próximo/anterior) com wrap-around cíclico.
 * 3. Quantidade de slots configurável por constante sem valores mágicos.
 * 4. Totalmente desacoplada de Renderer, Canvas, World e Chunks.
 * 5. Determinística e livre de efeitos colaterais.
 */
export class Hotbar {
  private selectedSlotIndex: number = 0;
  private readonly slotCount: number;

  constructor(slotCount: number = DEFAULT_HOTBAR_SLOT_COUNT) {
    if (!Number.isInteger(slotCount) || slotCount <= 0) {
      throw new Error(`[Hotbar] Quantidade de slots inválida: ${slotCount}. Deve ser um inteiro > 0.`);
    }
    this.slotCount = slotCount;
  }

  /**
   * Retorna o índice do slot atualmente selecionado na Hotbar (base 0).
   */
  public getSelectedSlotIndex(): number {
    return this.selectedSlotIndex;
  }

  /**
   * Define o slot selecionado diretamente por índice.
   * Retorna true se o índice for válido e a seleção for aplicada; false se for inválido.
   */
  public setSelectedSlot(index: number): boolean {
    if (!this.isValidSlotIndex(index)) {
      return false;
    }
    this.selectedSlotIndex = index;
    return true;
  }

  /**
   * Avança para o próximo slot da hotbar com wrap-around cíclico (após o último, volta para o 0).
   */
  public nextSlot(): number {
    this.selectedSlotIndex = (this.selectedSlotIndex + 1) % this.slotCount;
    return this.selectedSlotIndex;
  }

  /**
   * Retorna para o slot anterior da hotbar com wrap-around cíclico (antes do 0, vai para o último).
   */
  public previousSlot(): number {
    this.selectedSlotIndex = (this.selectedSlotIndex - 1 + this.slotCount) % this.slotCount;
    return this.selectedSlotIndex;
  }

  /**
   * Valida se um índice de slot pertence ao intervalo válido [0, slotCount - 1].
   */
  public isValidSlotIndex(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.slotCount;
  }

  /**
   * Retorna a quantidade total de slots configurados nesta Hotbar.
   */
  public getSlotCount(): number {
    return this.slotCount;
  }
}
