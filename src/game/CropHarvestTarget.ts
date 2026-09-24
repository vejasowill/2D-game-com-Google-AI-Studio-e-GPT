import { TILE_SIZE } from './constants.ts';
import {
  InteractionContext,
  InteractionDefinition,
  InteractionResult,
  InteractiveWorldObject,
} from './InteractionTypes.ts';
import { WorldCoord } from './types.ts';
import type { HarvestSystem } from './HarvestSystem.ts';

/**
 * Alvo interativo que representa uma cultura agrícola madura pronta para colheita.
 *
 * Princípios arquiteturais:
 * 1. Implementa o contrato InteractiveWorldObject sem transformar a planta em WorldObject fixo no WorldObjectManager;
 * 2. É uma representação interativa efêmera e pontual baseada na célula do terreno (tile);
 * 3. Delega a validação e execução atômica exclusivamente ao HarvestSystem;
 * 4. Permite ao InteractionSystem avaliar prioridade, limites físicos (AABB) e direção frontal de forma uniforme.
 */
export class CropHarvestTarget implements InteractiveWorldObject {
  public readonly id: string;
  public readonly type: string = 'crop';
  public readonly position: WorldCoord;
  public readonly width: number = TILE_SIZE;
  public readonly height: number = TILE_SIZE;
  public readonly state: Readonly<Record<string, unknown>>;
  public readonly tileX: number;
  public readonly tileY: number;
  public readonly harvestSystem: HarvestSystem;

  public readonly interaction: InteractionDefinition = {
    id: 'harvest',
    label: 'Colher',
    range: 48,
    priority: 6, // Prioridade equilibrada: acima de inspeções comuns, respeitando prioridades de drops
  };

  constructor(tileX: number, tileY: number, harvestSystem: HarvestSystem) {
    this.tileX = Math.floor(tileX);
    this.tileY = Math.floor(tileY);
    this.harvestSystem = harvestSystem;
    this.id = `crop_${this.tileX}_${this.tileY}`;
    this.position = {
      worldX: this.tileX * TILE_SIZE,
      worldY: this.tileY * TILE_SIZE,
    };
    this.state = Object.freeze({
      tileX: this.tileX,
      tileY: this.tileY,
    });
  }

  /**
   * Avalia deterministicamente se o cultivo pode ser colhido no momento pelo Player.
   */
  public canInteract(context: InteractionContext): boolean {
    const evaluation = this.harvestSystem.canHarvest(
      context.player,
      context.world,
      { tileX: this.tileX, tileY: this.tileY },
      { maxRange: this.interaction.range, checkDirection: true },
    );
    return evaluation.canHarvest;
  }

  /**
   * Executa a colheita atômica do cultivo e converte o resultado em InteractionResult.
   */
  public interact(context: InteractionContext): InteractionResult {
    const result = this.harvestSystem.executeHarvest(
      context.player,
      context.world,
      { tileX: this.tileX, tileY: this.tileY },
      { maxRange: this.interaction.range, checkDirection: true },
    );

    return {
      success: result.success,
      interactionId: this.interaction.id,
      actionLabel: this.interaction.label,
      message: result.message,
    };
  }
}
