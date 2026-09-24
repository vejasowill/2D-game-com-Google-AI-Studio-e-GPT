import { TILE_SIZE } from './constants.ts';
import { CropRegistry } from './CropRegistry.ts';
import { SoilRegistry } from './SoilState.ts';
import { ToolDefinition } from './ToolDefinition.ts';
import {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolTarget,
  ToolTargetType,
} from './ToolTarget.ts';
import { TileType, WorldBounds, WorldCoord } from './types.ts';

/**
 * Adaptador desacoplado que representa uma célula de terreno (Tile) como alvo de ferramenta (ToolTarget).
 *
 * Princípios arquiteturais:
 * 1. NÃO transforma Tile em WorldObject;
 * 2. Implementa a interface universal ToolTarget para permitir que qualquer ferramenta genérica
 *    opere sobre o terreno sem branches hardcoded no ItemUseSystem;
 * 3. Delega regras de transição de solo ao SoilRegistry;
 * 4. Produz mutações declarativas (WorldMutation) do tipo 'modify_tile' para aplicação atômica;
 * 5. Totalmente agnóstico ao Renderer, sprites e Canvas.
 */
export class TileToolTarget implements ToolTarget {
  public readonly targetType: ToolTargetType = 'tile';
  public readonly targetId: string;
  public readonly targetPosition: WorldCoord;
  public readonly tileX: number;
  public readonly tileY: number;

  constructor(tileX: number, tileY: number) {
    this.tileX = Math.floor(tileX);
    this.tileY = Math.floor(tileY);
    this.targetId = `tile:${this.tileX}:${this.tileY}`;
    this.targetPosition = {
      worldX: this.tileX * TILE_SIZE + TILE_SIZE / 2,
      worldY: this.tileY * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /**
   * Retorna os limites AABB físicos exatos da célula do terreno.
   * Totalmente independente do tamanho de qualquer sprite visual.
   */
  public getTargetBounds(): WorldBounds {
    const minX = this.tileX * TILE_SIZE;
    const minY = this.tileY * TILE_SIZE;
    const maxX = minX + TILE_SIZE;
    const maxY = minY + TILE_SIZE;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: TILE_SIZE,
      height: TILE_SIZE,
    };
  }

  /**
   * Avalia deterministicamente se este tile pode receber a ação da ferramenta especificada.
   */
  public canReceiveToolAction(tool: ToolDefinition, context: ToolExecutionContext): boolean {
    const world = context.world;
    if (!world.isValidTileCoord(this.tileX, this.tileY)) {
      return false;
    }

    const currentTile = world.getEffectiveTile(this.tileX, this.tileY);
    if (!currentTile) {
      return false;
    }

    // 1. Ação declarativa de plantio em solo preparado
    if (tool.action === 'plant') {
      if (currentTile.type !== TileType.TILLED_SOIL) {
        return false;
      }
      if (world.getCropSystem().hasCrop(this.tileX, this.tileY)) {
        return false;
      }
      const cropDef = CropRegistry.getBySeedItemId(context.equippedItem.itemId);
      return cropDef !== undefined;
    }

    // 2. Rejeição de solo já preparado ou com cultivo para ação de arar/cultivar
    if (tool.action === 'till') {
      if (currentTile.type === TileType.TILLED_SOIL) {
        return false;
      }
      if (world.getCropSystem().hasCrop(this.tileX, this.tileY)) {
        return false;
      }
    }

    // Consulta transições declarativas no SoilRegistry
    return SoilRegistry.canTransition(currentTile.type, tool.action);
  }

  /**
   * Executa a ação da ferramenta no terreno, retornando mutações atômicas para aplicação pelo WorldMutationHandler.
   */
  public receiveToolAction(tool: ToolDefinition, context: ToolExecutionContext): ToolExecutionResult {
    const world = context.world;
    if (!world.isValidTileCoord(this.tileX, this.tileY)) {
      return {
        success: false,
        action: tool.action,
        code: 'invalid_coordinates',
        message: 'Coordenadas de terreno inválidas.',
      };
    }

    const currentTile = world.getEffectiveTile(this.tileX, this.tileY);
    if (!currentTile) {
      return {
        success: false,
        action: tool.action,
        code: 'invalid_tile',
        message: 'Célula de terreno não encontrada.',
      };
    }

    // Execução da ação 'plant'
    if (tool.action === 'plant') {
      if (currentTile.type !== TileType.TILLED_SOIL) {
        return {
          success: false,
          action: tool.action,
          code: 'not_tilled_soil',
          message: 'As sementes só podem ser plantadas em solo preparado (tilled soil).',
        };
      }

      if (world.getCropSystem().hasCrop(this.tileX, this.tileY)) {
        return {
          success: false,
          action: tool.action,
          code: 'already_has_crop',
          message: 'Este terreno já possui um cultivo plantado.',
        };
      }

      const cropDef = CropRegistry.getBySeedItemId(context.equippedItem.itemId);
      if (!cropDef) {
        return {
          success: false,
          action: tool.action,
          code: 'not_a_seed',
          message: 'O item equipado não é uma semente válida.',
        };
      }

      return {
        success: true,
        action: tool.action,
        code: 'crop_planted',
        message: `Cultura "${cropDef.name}" plantada com sucesso!`,
        target: this,
        mutations: [
          {
            type: 'plant_crop',
            tileX: this.tileX,
            tileY: this.tileY,
            cropId: cropDef.id,
            plantedAt: world.getTime(),
          },
        ],
        cooldownApplied: tool.cooldown,
        actionDurationApplied: tool.actionDuration,
      };
    }

    if (currentTile.type === TileType.TILLED_SOIL && tool.action === 'till') {
      return {
        success: false,
        action: tool.action,
        code: 'already_tilled',
        message: 'Este solo já está preparado para cultivo.',
      };
    }

    const transition = SoilRegistry.getTransition(currentTile.type, tool.action);
    if (!transition) {
      return {
        success: false,
        action: tool.action,
        code: 'incompatible_tile',
        message: 'Este tipo de terreno não pode ser preparado.',
      };
    }

    return {
      success: true,
      action: tool.action,
      code: 'soil_tilled',
      message: 'Solo preparado para cultivo com sucesso!',
      target: this,
      mutations: [
        {
          type: 'modify_tile',
          tileX: this.tileX,
          tileY: this.tileY,
          newTileType: transition.resultingTileType,
          previousTileType: currentTile.type,
        },
      ],
      cooldownApplied: tool.cooldown,
      actionDurationApplied: tool.actionDuration,
    };
  }
}
