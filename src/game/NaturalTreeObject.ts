import { Biome } from './Biome.ts';
import { ItemDropObject } from './ItemDropObject.ts';
import {
  InteractionContext,
  InteractionDefinition,
  InteractionResult,
  InteractiveWorldObject,
} from './InteractionTypes.ts';
import { NaturalObject, NaturalObjectType } from './NaturalObjectDefinition.ts';
import { WorldCoord } from './types.ts';

/**
 * Objeto natural de árvore interativa que implementa a geração determinística de drops.
 *
 * Princípios arquiteturais:
 * 1. Implementa NaturalObject e InteractiveWorldObject;
 * 2. Quando o jogador interage ("Sacudir Árvore"), gera deterministicamente um drop de madeira (ItemDropObject);
 * 3. Utiliza o sistema de mutação existente (WorldMutation: create_object e update_state);
 * 4. 100% determinístico: ID do drop derivado de (sourceTileX, sourceTileY) e quantidade fixa (sem Math.random());
 * 5. Não implementa ferramentas ou machados antecipadamente; serve como a primeira vertical slice.
 */
export class NaturalTreeObject implements NaturalObject, InteractiveWorldObject {
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
    this.state = state ?? Object.freeze({ harvested: false });
  }

  public canInteract(): boolean {
    return true;
  }

  public interact(_context: InteractionContext): InteractionResult {
    const isHarvested = (this.state as { harvested?: boolean } | undefined)?.harvested === true;

    if (isHarvested) {
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
}
