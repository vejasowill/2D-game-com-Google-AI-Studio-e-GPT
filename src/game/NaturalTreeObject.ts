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
  getObjectActionWorldBounds,
} from './ItemUseTypes.ts';
import { NaturalObject, NaturalObjectType } from './NaturalObjectDefinition.ts';
import { WorldBounds, WorldCoord } from './types.ts';
import { ToolDefinition } from './ToolDefinition.ts';
import {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolTarget,
  ToolTargetType,
} from './ToolTarget.ts';

/**
 * Estado estruturado da árvore no mundo de gameplay.
 * Desacoplado de cores, formatos vetoriais ou spritesheets.
 */
export interface NaturalTreeState {
  readonly harvested: boolean;
  readonly chopped: boolean;
  readonly destroyed?: boolean;
  readonly choppedAt?: number;
}

/**
 * Objeto natural de árvore interativa que implementa suporte tanto à interação
 * básica ("Sacudir Árvore") quanto ao sistema genérico de ações de ferramentas ("chop").
 *
 * Princípios arquiteturais:
 * 1. Implementa NaturalObject, InteractiveWorldObject, ItemActionTarget e ToolTarget;
 * 2. Quando o jogador usa uma ferramenta de corte ("chop"), a árvore é completamente destruída/removida do mundo;
 * 3. NÃO permanece toco/stump após o corte;
 * 4. Gera deterministicamente um drop de madeira (ItemDropObject);
 * 5. Utiliza o sistema de mutação existente (WorldMutation: create_object e remove_object com permanent: true);
 * 6. 100% determinístico: ID do drop derivado de (sourceTileX, sourceTileY) e quantidade estável (sem Math.random());
 * 7. Rejeita ações incompatíveis e impede duplicação caso já esteja cortada/destruída;
 * 8. Totalmente desacoplado de IDs concretos de ferramentas (comunica-se apenas pela ação abstrata 'chop').
 */
export class NaturalTreeObject
  implements NaturalObject, InteractiveWorldObject, ItemActionTarget, ToolTarget
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
  private destroyed: boolean = false;

  // Propriedades do contrato genérico ToolTarget
  public readonly targetType: ToolTargetType = 'world_object';

  public get targetId(): string {
    return this.id;
  }

  public get targetPosition(): WorldCoord {
    return this.position;
  }

  public get underlyingObject(): this {
    return this;
  }

  public getTargetBounds(): WorldBounds {
    return getObjectActionWorldBounds(this);
  }

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

    if (
      (this.state as { chopped?: boolean; destroyed?: boolean } | undefined)?.chopped === true ||
      (this.state as { chopped?: boolean; destroyed?: boolean } | undefined)?.destroyed === true
    ) {
      this.destroyed = true;
    }
  }

  public get isDestroyed(): boolean {
    return (
      this.destroyed ||
      (this.state as { destroyed?: boolean } | undefined)?.destroyed === true ||
      (this.state as { chopped?: boolean } | undefined)?.chopped === true
    );
  }

  public get isChopped(): boolean {
    return this.isDestroyed;
  }

  public get isHarvested(): boolean {
    return (this.state as { harvested?: boolean } | undefined)?.harvested === true;
  }

  /**
   * Retorna o estado tipado e semântico da árvore.
   */
  public getTreeState(): NaturalTreeState {
    const s = this.state as Partial<NaturalTreeState> | undefined;
    return {
      chopped: this.isDestroyed,
      destroyed: this.isDestroyed,
      harvested: s?.harvested === true,
      choppedAt: s?.choppedAt,
    };
  }

  /**
   * Retorna o estágio biológico/físico atual da árvore para apresentação:
   * 'destroyed' (cortada/removida), 'harvested' (sacudida/sem galhos) ou 'intact' (plena).
   */
  public getStage(): 'intact' | 'harvested' | 'destroyed' {
    if (this.isDestroyed) return 'destroyed';
    if (this.isHarvested) return 'harvested';
    return 'intact';
  }

  public canInteract(): boolean {
    // Se a árvore já foi cortada/destruída, não exibe prompt de interação
    return !this.isDestroyed;
  }

  public interact(context: InteractionContext): InteractionResult {
    if (this.isDestroyed) {
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
        message: 'Você já sacudiu esta árvore. Nenhum galho solto restou para cair.',
      };
    }

    // Posição contínua e determinística para o drop próximo à base da árvore
    const dropX = this.position.worldX + Math.floor(this.width / 2) - 8;
    const dropY = this.position.worldY + this.height + 4;

    // ID determinístico baseado nas coordenadas do tile de origem
    const dropId = `drop:wood:${this.sourceTileX}:${this.sourceTileY}`;
    const woodDrop = new ItemDropObject(
      dropId,
      { worldX: dropX, worldY: dropY },
      'wood',
      3,
      16,
      16,
      context.world.getTime(),
    );

    return {
      success: true,
      interactionId: this.interaction.id,
      actionLabel: this.interaction.label,
      message: 'Você sacudiu a árvore! Galhos de madeira caíram no chão.',
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
   * Aceita exclusivamente a ação 'chop' se a árvore ainda não tiver sido destruída.
   */
  public canReceiveAction(action: string, _context?: ItemUseContext): boolean {
    if (action !== 'chop') {
      return false;
    }
    return !this.isDestroyed;
  }

  /**
   * Contrato ItemActionTarget:
   * Executa o corte da árvore pelo machado/ferramenta:
   * 1. Valida se a ação é compatível ('chop');
   * 2. Impede produção duplicada se já estiver cortada/destruída;
   * 3. Produz um ItemDropObject de madeira de maneira 100% determinística;
   * 4. Retorna mutação create_object (madeira) e remove_object (remoção completa permanente da árvore).
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

    if (this.isDestroyed) {
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

    this.destroyed = true;

    return {
      success: true,
      action: 'chop',
      code: 'tree_chopped',
      message: 'Árvore cortada!',
      mutations: [
        {
          type: 'create_object',
          object: woodDrop,
        },
        {
          type: 'remove_object',
          objectId: this.id,
          permanent: true,
        },
      ],
    };
  }

  /**
   * Contrato ToolTarget:
   * Valida se a árvore aceita a ferramenta fornecida.
   * Aceita ferramentas cuja ação seja 'chop' e a árvore não esteja destruída.
   */
  public canReceiveToolAction(tool: ToolDefinition, _context: ToolExecutionContext): boolean {
    if (tool.action !== 'chop') {
      return false;
    }
    return !this.isDestroyed;
  }

  /**
   * Contrato ToolTarget:
   * Executa a ação da ferramenta sobre a árvore retornando ToolExecutionResult estruturado.
   */
  public receiveToolAction(tool: ToolDefinition, context: ToolExecutionContext): ToolExecutionResult {
    const itemUseResult = this.receiveAction(tool.action, {
      player: context.player,
      world: context.world,
      equippedItem: context.equippedItem,
      target: this,
      action: tool.action,
      customArgs: tool.customParams,
    });

    return {
      success: itemUseResult.success,
      action: itemUseResult.action,
      code: itemUseResult.code,
      message: itemUseResult.message,
      target: this,
      mutations: itemUseResult.mutations,
      statePatch: itemUseResult.statePatch,
      cooldownApplied: tool.cooldown,
      actionDurationApplied: tool.actionDuration,
      producedItems: itemUseResult.success ? [{ itemId: 'wood', quantity: 3 }] : undefined,
    };
  }
}
