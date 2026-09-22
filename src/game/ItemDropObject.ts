import { DEFAULT_MAX_STACK_SIZE } from './ItemDefinition.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import {
  InteractionContext,
  InteractionDefinition,
  InteractionResult,
  InteractiveWorldObject,
  WorldMutation,
} from './InteractionTypes.ts';
import { WorldCoord } from './types.ts';
import { WorldObject } from './WorldObject.ts';

export interface ItemDropState {
  readonly itemId: string;
  readonly quantity: number;
}

/**
 * Entidade concreta que representa um item drop no mundo físico.
 *
 * Princípios arquiteturais:
 * 1. Implementa o contrato WorldObject e InteractiveWorldObject;
 * 2. Possui posição contínua, dimensões e integração total ao WorldObjectManager;
 * 3. Seu estado armazena puramente { itemId, quantity };
 * 4. Ao interagir com o Player, transfere a quantidade para o Inventory do Player de forma controlada;
 * 5. Remove-se ou atualiza seu estado por meio de WorldMutations;
 * 6. Desacoplado de spritesheets reais (fornece spriteAssetId referencial e aceita fallback).
 */
export class ItemDropObject implements InteractiveWorldObject {
  public readonly id: string;
  public readonly type: string = 'item_drop';
  public position: WorldCoord;
  public readonly width: number;
  public readonly height: number;
  public state: Readonly<Record<string, unknown>>;

  public readonly interaction: InteractionDefinition = {
    id: 'collect',
    label: 'Coletar',
    range: 48,
    priority: 10, // Prioridade alta de coleta sobre outros objetos
  };

  constructor(
    id: string,
    position: WorldCoord,
    itemId: string,
    quantity: number,
    width: number = 16,
    height: number = 16,
  ) {
    if (!itemId || typeof itemId !== 'string' || itemId.trim().length === 0) {
      throw new Error(`[ItemDropObject] itemId inválido: ${itemId}`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`[ItemDropObject] Quantidade inválida: ${quantity}. Deve ser um inteiro > 0.`);
    }

    this.id = id;
    this.position = { ...position };
    this.width = width;
    this.height = height;
    this.state = Object.freeze({
      itemId: itemId.trim(),
      quantity,
    });
  }

  public get itemId(): string {
    return (this.state as unknown as ItemDropState).itemId;
  }

  public get quantity(): number {
    return (this.state as unknown as ItemDropState).quantity;
  }

  /**
   * Obtém o identificador do sprite configurado para este item no ItemRegistry.
   */
  public get spriteAssetId(): string | undefined {
    return ItemRegistry.get(this.itemId)?.spriteAssetId;
  }

  /**
   * Valida se a coleta é permitida.
   */
  public canInteract(context: InteractionContext): boolean {
    return context.player !== undefined && context.player.inventory !== undefined;
  }

  /**
   * Executa a coleta do drop através do inventário do jogador:
   * 1. Descobre itemId e quantity atuais;
   * 2. Tenta adicionar ao Player.inventory;
   * 3. Se coletar tudo, emite mutação 'remove_object';
   * 4. Se coletar parcialmente, emite mutação 'update_state';
   * 5. Retorna feedback contextual (ex: "Madeira +3").
   */
  public interact(context: InteractionContext): InteractionResult {
    const currentItemId = this.itemId;
    const currentQuantity = this.quantity;

    if (!currentItemId || currentQuantity <= 0) {
      return {
        success: false,
        interactionId: this.interaction.id,
        message: 'Drop vazio ou inválido.',
      };
    }

    const itemDef = ItemRegistry.get(currentItemId);
    const maxStack = itemDef?.maxStackSize ?? DEFAULT_MAX_STACK_SIZE;
    const itemDisplayName = itemDef?.name ?? currentItemId;

    // Tentar adicionar ao inventário do Player
    const stackToAdd = createItemStack(currentItemId, currentQuantity, maxStack);
    const addResult = context.player.inventory.addItemStack(stackToAdd);

    if (addResult.added === 0) {
      return {
        success: false,
        interactionId: this.interaction.id,
        actionLabel: this.interaction.label,
        message: 'Inventário cheio!',
      };
    }

    const collectedAmount = addResult.added;
    const remainingInDrop = currentQuantity - collectedAmount;

    if (remainingInDrop <= 0) {
      // Coleta total: remove o WorldObject do mundo
      const removeMutation: WorldMutation = {
        type: 'remove_object',
        objectId: this.id,
      };

      return {
        success: true,
        interactionId: this.interaction.id,
        actionLabel: this.interaction.label,
        message: `${itemDisplayName} +${collectedAmount}`,
        mutations: [removeMutation],
      };
    } else {
      // Coleta parcial: atualiza a quantidade restante no mundo
      const newPatch = { quantity: remainingInDrop };
      this.state = Object.freeze({
        ...this.state,
        ...newPatch,
      });

      const updateMutation: WorldMutation = {
        type: 'update_state',
        objectId: this.id,
        statePatch: newPatch,
      };

      return {
        success: true,
        interactionId: this.interaction.id,
        actionLabel: this.interaction.label,
        message: `${itemDisplayName} +${collectedAmount}`,
        mutations: [updateMutation],
      };
    }
  }
}
