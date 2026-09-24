import { TILE_SIZE } from './constants.ts';
import { CropData } from './CropState.ts';
import { WaterCropMutation } from './InteractionTypes.ts';
import { Player } from './Player.ts';
import { SpatialGeometry } from './SpatialGeometry.ts';
import { TileCoord, WorldBounds } from './types.ts';
import { World } from './World.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';

/** Motivos padronizados de falha na avaliação de regagem */
export type WateringFailureReason =
  | 'NO_ITEM_EQUIPPED'
  | 'NOT_A_WATERING_CAN'
  | 'NO_SELECTION'
  | 'INVALID_COORDINATES'
  | 'OUT_OF_RANGE'
  | 'BEHIND_PLAYER'
  | 'NO_CROP'
  | 'NOT_TILLED_SOIL'
  | 'INCOMPATIBLE_TARGET';

/** Resultado da avaliação prévia de viabilidade de rega */
export interface WateringEvaluation {
  readonly canWater: boolean;
  readonly failureReason?: WateringFailureReason;
  readonly crop?: CropData;
  readonly tileX?: number;
  readonly tileY?: number;
}

/** Resultado estruturado após tentativa de execução de rega */
export interface WateringResult {
  readonly success: boolean;
  readonly tileX: number;
  readonly tileY: number;
  readonly failureReason?: WateringFailureReason;
  readonly message?: string;
  readonly crop?: CropData;
}

/**
 * Sistema genérico, declarativo e determinístico responsável pela regagem de culturas agrícolas (WateringSystem).
 *
 * Princípios arquiteturais:
 * 1. Opera estritamente sobre contratos genéricos: não possui referências a culturas concretas (turnip),
 *    sprites, Canvas, Renderer ou elementos de interface;
 * 2. Validações espaciais e físicas baseadas em AABB, direção frontal e coordenadas do mundo;
 * 3. O estado de rega é atribuído ao cultivo ativo na célula de terreno, sem criar entidades físicas ou WorldObjects separados;
 * 4. Não consome o regador ao usar;
 * 5. Determinístico: cálculo de tempo e mutações passam pelo WorldMutationHandler;
 * 6. Suporta coordenadas infinitas, negativas e fronteiras de chunk sem materialização indevida.
 */
export class WateringSystem {
  public defaultWaterRange: number;

  constructor(defaultWaterRange: number = 48) {
    this.defaultWaterRange = defaultWaterRange;
  }

  /**
   * Avalia deterministicamente se o jogador pode regar a célula de terreno informada.
   * Não aplica nenhuma mutação no mundo.
   */
  public canWater(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
    maxRange: number = this.defaultWaterRange,
  ): WateringEvaluation {
    if (!targetTile) {
      return { canWater: false, failureReason: 'NO_SELECTION' };
    }

    const { tileX, tileY } = targetTile;
    if (!world.isValidTileCoord(tileX, tileY)) {
      return { canWater: false, failureReason: 'INVALID_COORDINATES', tileX, tileY };
    }

    // 1. Limites físicos AABB da célula
    const tileBounds: WorldBounds = {
      minX: tileX * TILE_SIZE,
      minY: tileY * TILE_SIZE,
      maxX: (tileX + 1) * TILE_SIZE,
      maxY: (tileY + 1) * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    };

    // 2. Rejeita alvos no setor traseiro (atrás do jogador)
    if (!SpatialGeometry.isObjectInFrontSector(player.position, player.size, player.direction, tileBounds)) {
      return { canWater: false, failureReason: 'BEHIND_PLAYER', tileX, tileY };
    }

    // 3. Validação de alcance físico AABB
    const playerBox = {
      minX: player.position.worldX,
      minY: player.position.worldY,
      maxX: player.position.worldX + player.size,
      maxY: player.position.worldY + player.size,
    };

    const boxDistance = SpatialGeometry.calculateAABBDistance(
      playerBox.minX,
      playerBox.minY,
      playerBox.maxX,
      playerBox.maxY,
      tileBounds.minX,
      tileBounds.minY,
      tileBounds.maxX,
      tileBounds.maxY,
    );

    if (boxDistance > maxRange) {
      return { canWater: false, failureReason: 'OUT_OF_RANGE', tileX, tileY };
    }

    // 4. Validação de presença de cultivo na célula (células sem cultivo ou terrenos naturais não são regados)
    const crop = world.getCropSystem().getCrop(tileX, tileY);
    if (!crop) {
      return { canWater: false, failureReason: 'NO_CROP', tileX, tileY };
    }

    return {
      canWater: true,
      crop,
      tileX,
      tileY,
    };
  }

  /**
   * Executa determinística e atomicamente a ação de regar o cultivo.
   * Aplica a mutação através do WorldMutationHandler.
   */
  public executeWater(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
    maxRange: number = this.defaultWaterRange,
  ): WateringResult {
    const evaluation = this.canWater(player, world, targetTile, maxRange);

    if (!evaluation.canWater || !targetTile) {
      return {
        success: false,
        tileX: targetTile ? targetTile.tileX : 0,
        tileY: targetTile ? targetTile.tileY : 0,
        failureReason: evaluation.failureReason,
        message: `Rega rejeitada: ${evaluation.failureReason ?? 'condição inválida'}.`,
      };
    }

    const { tileX, tileY } = targetTile;

    const mutation: WaterCropMutation = {
      type: 'water_crop',
      tileX,
      tileY,
      wateredAt: world.getTime(),
    };

    const applied = WorldMutationHandler.applyMutation(world, mutation);
    if (!applied) {
      return {
        success: false,
        tileX,
        tileY,
        failureReason: 'INCOMPATIBLE_TARGET',
        message: 'Falha ao aplicar mutação de rega no mundo.',
      };
    }

    const updatedCrop = world.getCropSystem().getCrop(tileX, tileY);

    return {
      success: true,
      tileX,
      tileY,
      crop: updatedCrop ?? evaluation.crop,
      message: 'Cultivo regado com sucesso!',
    };
  }
}
