import { TILE_SIZE } from './constants.ts';
import { CropDefinition } from './CropDefinition.ts';
import { CropRegistry } from './CropRegistry.ts';
import { PlantCropMutation } from './InteractionTypes.ts';
import { Player } from './Player.ts';
import { SpatialGeometry } from './SpatialGeometry.ts';
import { TileCoord, TileType, WorldBounds } from './types.ts';
import { World } from './World.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';

/** Motivos padronizados de falha na avaliação de plantio */
export type PlantCropFailureReason =
  | 'NO_ITEM_EQUIPPED'
  | 'NOT_A_SEED'
  | 'NO_SELECTION'
  | 'INVALID_COORDINATES'
  | 'OUT_OF_RANGE'
  | 'BEHIND_PLAYER'
  | 'NOT_TILLED_SOIL'
  | 'ALREADY_HAS_CROP'
  | 'INSUFFICIENT_QUANTITY';

/** Resultado da avaliação prévia de viabilidade de plantio */
export interface PlantCropEvaluation {
  readonly canPlant: boolean;
  readonly failureReason?: PlantCropFailureReason;
  readonly cropDefinition?: CropDefinition;
  readonly seedItemId?: string;
}

/** Resultado estruturado após tentativa de execução de plantio */
export interface PlantCropResult {
  readonly success: boolean;
  readonly tileX: number;
  readonly tileY: number;
  readonly cropId?: string;
  readonly seedItemId?: string;
  readonly cropDefinition?: CropDefinition;
  readonly failureReason?: PlantCropFailureReason;
  readonly message?: string;
}

/**
 * Sistema genérico, declarativo e determinístico responsável pelo plantio de culturas agrícolas no terreno.
 *
 * Princípios arquiteturais:
 * 1. Opera exclusivamente através de CropDefinition e CropRegistry (zero branches `if (seed === 'turnip_seed')`);
 * 2. Cadeia de mutação estrita: PlantCropSystem -> WorldMutation -> WorldMutationHandler -> CropSystem;
 * 3. Validações espaciais e físicas baseadas em AABB, direção frontal e coordenadas do mundo;
 * 4. Exige solo preparado (TILLED_SOIL) e ausência de cultivo prévio;
 * 5. Consome exatamente 1 unidade da semente SOMENTE após a validação e execução atômica com sucesso;
 * 6. Suporta coordenadas infinitas, negativas e transições entre chunks sem materialização indevida.
 */
export class PlantCropSystem {
  public defaultPlantRange: number;

  constructor(defaultPlantRange: number = 48) {
    this.defaultPlantRange = defaultPlantRange;
  }

  /**
   * Avalia deterministicamente se o jogador pode plantar no tile indicado.
   * Não altera o inventário e não aplica mutações no mundo.
   */
  public canPlant(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
    overrideSeedItemId?: string,
  ): PlantCropEvaluation {
    // 1. Identificar o item de semente selecionado
    let seedItemId: string | undefined = overrideSeedItemId;
    let availableQuantity = 0;

    if (!seedItemId) {
      const equippedStack = player.getEquippedStack();
      if (!equippedStack || equippedStack.quantity <= 0) {
        return { canPlant: false, failureReason: 'NO_ITEM_EQUIPPED' };
      }
      seedItemId = equippedStack.itemId;
      availableQuantity = equippedStack.quantity;
    } else {
      availableQuantity = player.getInventory().countItem(seedItemId);
    }

    // 2. Consultar se o item está associado a uma cultura declarada no CropRegistry
    const cropDef = CropRegistry.getBySeedItemId(seedItemId);
    if (!cropDef) {
      return { canPlant: false, failureReason: 'NOT_A_SEED', seedItemId };
    }

    if (availableQuantity < 1) {
      return { canPlant: false, failureReason: 'INSUFFICIENT_QUANTITY', cropDefinition: cropDef, seedItemId };
    }

    // 3. Validar se há coordenadas de seleção válidas
    if (!targetTile) {
      return { canPlant: false, failureReason: 'NO_SELECTION', cropDefinition: cropDef, seedItemId };
    }

    const { tileX, tileY } = targetTile;
    if (!world.isValidTileCoord(tileX, tileY)) {
      return { canPlant: false, failureReason: 'INVALID_COORDINATES', cropDefinition: cropDef, seedItemId };
    }

    // 4. Validar limites AABB físicos da célula
    const tileBounds: WorldBounds = {
      minX: tileX * TILE_SIZE,
      minY: tileY * TILE_SIZE,
      maxX: (tileX + 1) * TILE_SIZE,
      maxY: (tileY + 1) * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    };

    // 5. Validar se o tile está no setor frontal do jogador (rejeita costas)
    if (!SpatialGeometry.isObjectInFrontSector(player.position, player.size, player.direction, tileBounds)) {
      return { canPlant: false, failureReason: 'BEHIND_PLAYER', cropDefinition: cropDef, seedItemId };
    }

    // 6. Validar alcance físico
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

    if (boxDistance > this.defaultPlantRange) {
      return { canPlant: false, failureReason: 'OUT_OF_RANGE', cropDefinition: cropDef, seedItemId };
    }

    // 7. Validar se o tipo do solo é TILLED_SOIL
    const effectiveTile = world.getEffectiveTile(tileX, tileY);
    if (!effectiveTile || effectiveTile.type !== TileType.TILLED_SOIL) {
      return { canPlant: false, failureReason: 'NOT_TILLED_SOIL', cropDefinition: cropDef, seedItemId };
    }

    // 8. Validar se o tile já possui um cultivo ativo
    if (world.getCropSystem().hasCrop(tileX, tileY)) {
      return { canPlant: false, failureReason: 'ALREADY_HAS_CROP', cropDefinition: cropDef, seedItemId };
    }

    return {
      canPlant: true,
      cropDefinition: cropDef,
      seedItemId,
    };
  }

  /**
   * Executa determinística e atomicamente o plantio da semente.
   *
   * Consome 1 unidade de semente do inventário SOMENTE após a mutação ser aplicada com sucesso.
   */
  public executePlant(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
    overrideSeedItemId?: string,
  ): PlantCropResult {
    const evaluation = this.canPlant(player, world, targetTile, overrideSeedItemId);

    if (!evaluation.canPlant || !evaluation.cropDefinition || !targetTile) {
      return {
        success: false,
        tileX: targetTile ? targetTile.tileX : 0,
        tileY: targetTile ? targetTile.tileY : 0,
        cropId: evaluation.cropDefinition?.id,
        seedItemId: evaluation.seedItemId,
        cropDefinition: evaluation.cropDefinition,
        failureReason: evaluation.failureReason,
        message: `Plantio rejeitado: ${evaluation.failureReason ?? 'condição inválida'}.`,
      };
    }

    const { tileX, tileY } = targetTile;
    const cropDef = evaluation.cropDefinition;
    const seedItemId = evaluation.seedItemId!;

    // Construir e aplicar a mutação declarativa via WorldMutationHandler
    const mutation: PlantCropMutation = {
      type: 'plant_crop',
      tileX,
      tileY,
      cropId: cropDef.id,
      plantedAt: world.getTime(),
    };

    const applied = WorldMutationHandler.applyMutation(world, mutation);
    if (!applied) {
      return {
        success: false,
        tileX,
        tileY,
        cropId: cropDef.id,
        seedItemId,
        cropDefinition: cropDef,
        failureReason: 'ALREADY_HAS_CROP',
        message: 'Falha ao aplicar mutação de plantio no mundo.',
      };
    }

    // Consumir exatamente 1 unidade de semente do inventário do jogador
    const selectedSlotIndex = player.getHotbar().getSelectedSlotIndex();
    const currentSlot = player.getInventory().getSlot(selectedSlotIndex);

    if (currentSlot && currentSlot.itemId === seedItemId && currentSlot.quantity >= 1) {
      player.getInventory().removeQuantityFromSlot(selectedSlotIndex, 1);
    } else {
      player.getInventory().removeItem(seedItemId, 1);
    }

    return {
      success: true,
      tileX,
      tileY,
      cropId: cropDef.id,
      seedItemId,
      cropDefinition: cropDef,
      message: `Cultura "${cropDef.name}" plantada com sucesso!`,
    };
  }
}
