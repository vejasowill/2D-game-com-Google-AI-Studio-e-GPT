import { Biome } from './Biome.ts';
import { ItemDropObject } from './ItemDropObject.ts';
import {
  InteractionContext,
  InteractionDefinition,
  InteractionResult,
  InteractiveWorldObject,
} from './InteractionTypes.ts';
import {
  ItemActionTarget,
  ItemUseContext,
  ItemUseResult,
} from './ItemUseTypes.ts';
import { NaturalObject, NaturalObjectType } from './NaturalObjectDefinition.ts';
import { WorldCoord } from './types.ts';

/**
 * Objeto natural de árvore interativa que implementa suporte tanto à interação
 * básica ("Sacudir Árvore") quanto ao sistema genérico de ações de ferramentas ("chop").
 *
 * Princípios arquiteturais:
 * 1. Implementa NaturalObject, InteractiveWorldObject e ItemActionTarget;
 * 2. Quando o jogador usa uma ferramenta de corte ("chop"), gera deterministicamente um drop de madeira (ItemDropObject);
 * 3. Utiliza o sistema de mutação existente (WorldMutation: create_object e update_state);
 * 4. 100% determinístico: ID do drop derivado de (sourceTileX, sourceTileY) e quantidade estável (sem Math.random());
 * 5. Rejeita ações incompatíveis e impede duplicação caso já esteja cortada;
 * 6. Totalmente desacoplado de IDs concretos de ferramentas (comunica-se apenas pela ação abstrata 'chop').
 */
export class NaturalTreeObject
  implements NaturalObject, InteractiveWorldObject, ItemActionTarget
{
  public readonly id: string;
  public readonly type: string = 'tree';
  public position: WorldCoord;
  public readonly width: number;
  public readonly height: number;
  public readonly naturalType: NaturalObjectType = NaturalObjectType.TREE;
  public readonly biome: Biome;
  public readonly sourceTileX: number;
  public readonly sourceTileY: number;
  public readonly variant: number;
  public state: Readonly<Record<string, unknown>>;

  public readonly interaction: InteractionDefinition = {
    id: 'shake_tree',
    label: 'Sacudir Árvore',
    range: 48,
    priority: 1,
  };

  constructor(
    id: string,
    position: WorldCoord,
    width: number,
    height: number,
    biome: Biome,
    sourceTileX: number,
    sourceTileY: number,
    variant: number,
    state?: Readonly<Record<string, unknown>>,
  ) {
    this.id = id;
    this.position = { ...position };
    this.width = width;
    this.height = height;
    this.biome = biome;
    this.sourceTileX = sourceTileX;
    this.sourceTileY = sourceTileY;
    this.variant = variant;
    this.state = state ?? Object.freeze({ harvested: false, chopped: false });
  }

  public get isChopped(): boolean {
    return (this.state as { chopped?: boolean } | undefined)?.chopped === true;
  }

  public get isHarvested(): boolean {
    return (this.state as { harvested?: boolean } | undefined)?.harvested === true;
  }

  public canInteract(): boolean {
    // Se a árvore já foi cortada (toco remanescente), não exibe prompt de sacudir
    return !this.isChopped;
  }

  public interact(context: InteractionContext): InteractionResult {
    if (this.isChopped) {
      return {
        success: false,
        interactionId: this.interaction.id,
        actionLabel: this.interaction.label,
        message: 'Esta árvore já foi cortada.',
      };
    }

    if (this.isHarvested) {
      return {
        success: true,
        interactionId: this.interaction.id,
        actionLabel: this.interaction.label,
        message: 'Nenhum galho solto nesta árvore.',
      };
    }

    // Posição contínua e determinística para o drop próximo à base da árvore
    const dropX = this.position.worldX + Math.floor(this.width / 2) - 8;
    const dropY = this.position.worldY + this.height + 4;

    const dropId = `drop:wood:${this.sourceTileX}:${this.sourceTileY}`;
    const woodDrop = new ItemDropObject(
      dropId,
      { worldX: dropX, worldY: dropY },
      'wood',
      3, // Quantidade de madeira gerada deterministicamente
      16,
      16,
      context.world.getTime(),
    );

    return {
      success: true,
      interactionId: this.interaction.id,
      actionLabel: this.interaction.label,
      message: 'Galhos de madeira caíram no chão!',
      statePatch: { harvested: true },
      mutations: [
        {
          type: 'create_object',
          object: woodDrop,
        },
      ],
    };
  }

  /**
   * Contrato ItemActionTarget:
   * Valida se a árvore aceita a ação solicitada.
   * Aceita exclusivamente a ação 'chop' se a árvore ainda não tiver sido cortada.
   */
  public canReceiveAction(action: string, _context?: ItemUseContext): boolean {
    if (action !== 'chop') {
      return false;
    }
    return !this.isChopped;
  }

  /**
   * Contrato ItemActionTarget:
   * Executa o corte da árvore pelo machado/ferramenta:
   * 1. Valida se a ação é compatível ('chop');
   * 2. Impede produção duplicada se já estiver cortada;
   * 3. Produz um ItemDropObject de madeira de maneira 100% determinística;
   * 4. Retorna mutação create_object e patch de estado { chopped: true }.
   */
  public receiveAction(action: string, context: ItemUseContext): ItemUseResult {
    if (action !== 'chop') {
      return {
        success: false,
        action,
        code: 'incompatible_action',
        message: 'Esta ferramenta não afeta esta árvore.',
      };
    }

    if (this.isChopped) {
      return {
        success: false,
        action,
        code: 'already_chopped',
        message: 'Esta árvore já foi cortada.',
      };
    }

    // Posição física contínua e determinística para o drop próximo à base da árvore
    const dropX = this.position.worldX + Math.floor(this.width / 2) - 8;
    const dropY = this.position.worldY + this.height + 4;

    // ID determinístico baseado nas coordenadas de origem do tile
    const dropId = `drop:wood:chop:${this.sourceTileX}:${this.sourceTileY}`;
    const woodDrop = new ItemDropObject(
      dropId,
      { worldX: dropX, worldY: dropY },
      'wood',
      3, // Quantidade de madeira fixa e determinística
      16,
      16,
      context.world.getTime(),
    );

    return {
      success: true,
      action: 'chop',
      code: 'tree_chopped',
      message: 'Árvore cortada!',
      statePatch: { chopped: true },
      mutations: [
        {
          type: 'create_object',
          object: woodDrop,
        },
      ],
    };
  }
}
