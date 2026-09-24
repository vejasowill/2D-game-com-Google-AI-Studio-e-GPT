import { DEFAULT_MAX_STACK_SIZE } from './ItemDefinition.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { Player } from './Player.ts';
import { SpatialGeometry } from './SpatialGeometry.ts';
import { TileCoord, WorldBounds } from './types.ts';
import { World } from './World.ts';
import { WorldMutation } from './InteractionTypes.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { CropRegistry } from './CropRegistry.ts';
import { CropHarvestTarget } from './CropHarvestTarget.ts';
import {
  getCropHarvestDefinition,
  HarvestEvaluation,
  HarvestFailureReason,
  HarvestResult,
} from './HarvestDefinition.ts';
import { TILE_SIZE } from './constants.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { InteractiveWorldObject } from './InteractionTypes.ts';

export interface HarvestCandidateEvaluation {
  readonly target: CropHarvestTarget;
  readonly bounds: WorldBounds;
  readonly boxDistance: number;
  readonly distToFront: number;
}

/**
 * Sistema genérico, declarativo e determinístico responsável pela colheita de culturas agrícolas.
 *
 * Princípios arquiteturais:
 * 1. Opera exclusivamente através de CropDefinition, HarvestDefinition e CropRegistry (zero branches 'turnip');
 * 2. Cadeia de mutação estrita: HarvestSystem -> remove_crop Mutation -> WorldMutationHandler -> CropSystem;
 * 3. Validações espaciais e físicas puras (hitbox/AABB, alcance e direção frontal);
 * 4. Exige maturidade determinística baseada no tempo do mundo simulado;
 * 5. Garante atomicidade: se o inventário não puder receber o resultado, a colheita falha e o cultivo permanece intacto;
 * 6. Suporta coordenadas infinitas, negativas e transições entre chunks sem materialização indevida;
 * 7. 100% desacoplado de Canvas, Renderer, DOM ou sprites visuais.
 */
export class HarvestSystem {
  public defaultRange: number;

  constructor(defaultRange: number = 48) {
    this.defaultRange = defaultRange;
  }

  /**
   * Avalia deterministicamente se o jogador pode colher o cultivo na célula informada.
   * Não altera o inventário e não aplica mutações no mundo.
   */
  public canHarvest(
    player: Player,
    world: World,
    targetTile: TileCoord,
    options?: { maxRange?: number; checkDirection?: boolean },
  ): HarvestEvaluation {
    const tileX = Math.floor(targetTile.tileX);
    const tileY = Math.floor(targetTile.tileY);

    const cropSystem = world.getCropSystem();

    // 1. Verifica se existe cultivo no local
    const cropData = cropSystem.getCrop(tileX, tileY);
    if (!cropData) {
      return { canHarvest: false, failureReason: 'NO_CROP' };
    }

    // 2. Consulta a definição declarativa da cultura no CropRegistry
    const cropDef = CropRegistry.get(cropData.cropId);
    if (!cropDef) {
      return { canHarvest: false, failureReason: 'UNKNOWN_CROP', cropId: cropData.cropId };
    }

    const harvestDef = getCropHarvestDefinition(cropDef);

    // 3. Valida requisito de maturidade
    if (harvestDef.requiresMaturity !== false) {
      const isMature = cropSystem.isMature(tileX, tileY, world.getTime());
      if (!isMature) {
        return {
          canHarvest: false,
          failureReason: 'NOT_MATURE',
          cropId: cropData.cropId,
          harvestDefinition: harvestDef,
        };
      }
    }

    // 4. Limites físicos AABB da célula de terreno
    const tileBounds: WorldBounds = {
      minX: tileX * TILE_SIZE,
      minY: tileY * TILE_SIZE,
      maxX: (tileX + 1) * TILE_SIZE,
      maxY: (tileY + 1) * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    };

    // 5. Validação de orientação direcional (rejeita alvos nas costas do jogador)
    if (options?.checkDirection !== false) {
      const inFront = SpatialGeometry.isObjectInFrontSector(
        player.position,
        player.size,
        player.direction,
        tileBounds,
      );
      if (!inFront) {
        return {
          canHarvest: false,
          failureReason: 'BEHIND_PLAYER',
          cropId: cropData.cropId,
          harvestDefinition: harvestDef,
        };
      }
    }

    // 6. Validação de alcance físico AABB
    const range = options?.maxRange ?? this.defaultRange;
    const playerBox = {
      minX: player.position.worldX,
      minY: player.position.worldY,
      maxX: player.position.worldX + player.size,
      maxY: player.position.worldY + player.size,
    };
    const distance = SpatialGeometry.calculateAABBDistance(
      playerBox.minX,
      playerBox.minY,
      playerBox.maxX,
      playerBox.maxY,
      tileBounds.minX,
      tileBounds.minY,
      tileBounds.maxX,
      tileBounds.maxY,
    );

    if (distance > range) {
      return {
        canHarvest: false,
        failureReason: 'OUT_OF_RANGE',
        cropId: cropData.cropId,
        harvestDefinition: harvestDef,
      };
    }

    // 7. Validação de ferramenta requerida (se aplicável)
    if (harvestDef.requiredToolCategory) {
      const equipped = player.getEquippedItem();
      const toolDef = equipped ? ToolRegistry.getByItemId(equipped.itemId) : undefined;
      if (!toolDef || toolDef.category !== harvestDef.requiredToolCategory) {
        return {
          canHarvest: false,
          failureReason: 'MISSING_TOOL',
          cropId: cropData.cropId,
          harvestDefinition: harvestDef,
        };
      }
    }

    // 8. Validação de capacidade no inventário do jogador
    if (!player.inventory.canAddItem(harvestDef.harvestItemId, harvestDef.harvestQuantity)) {
      return {
        canHarvest: false,
        failureReason: 'INVENTORY_FULL',
        cropId: cropData.cropId,
        harvestDefinition: harvestDef,
      };
    }

    return {
      canHarvest: true,
      cropId: cropData.cropId,
      harvestDefinition: harvestDef,
    };
  }

  /**
   * Executa a colheita atômica do cultivo na célula informada.
   *
   * Garantia estrita de consistência:
   * 1. Determina os itens e a quantidade produzidos;
   * 2. Verifica previamente a capacidade do inventário;
   * 3. Somente remove o cultivo se a validação estiver completa;
   * 4. Adiciona atomicamente os itens ao inventário;
   * 5. Em caso de qualquer inconsistência, realiza rollback completo mantendo cultivo e inventário intactos.
   */
  public executeHarvest(
    player: Player,
    world: World,
    targetTile: TileCoord,
    options?: { maxRange?: number; checkDirection?: boolean },
  ): HarvestResult {
    const tileX = Math.floor(targetTile.tileX);
    const tileY = Math.floor(targetTile.tileY);

    const evaluation = this.canHarvest(player, world, { tileX, tileY }, options);
    if (!evaluation.canHarvest || !evaluation.harvestDefinition) {
      return {
        success: false,
        tileX,
        tileY,
        cropId: evaluation.cropId,
        failureReason: evaluation.failureReason,
        message: this.getFailureMessage(evaluation.failureReason),
      };
    }

    const cropSystem = world.getCropSystem();
    const cropData = cropSystem.getCrop(tileX, tileY);
    if (!cropData) {
      return {
        success: false,
        tileX,
        tileY,
        failureReason: 'NO_CROP',
        message: 'Cultivo inexistente.',
      };
    }

    const harvestDef = evaluation.harvestDefinition;
    const itemId = harvestDef.harvestItemId;
    const quantity = harvestDef.harvestQuantity;

    // 1. Aplica a mutação de remoção do cultivo
    const removeMutation: WorldMutation = {
      type: 'remove_crop',
      tileX,
      tileY,
    };

    const removed = WorldMutationHandler.applyMutation(world, removeMutation);
    if (!removed) {
      return {
        success: false,
        tileX,
        tileY,
        failureReason: 'NO_CROP',
        message: 'Falha ao colher cultivo.',
      };
    }

    // 2. Transfere os itens produzidos para o inventário do Player
    const itemDef = ItemRegistry.get(itemId);
    const maxStack = itemDef?.maxStackSize ?? DEFAULT_MAX_STACK_SIZE;
    const stack = createItemStack(itemId, quantity, maxStack);
    const addResult = player.inventory.addItemStack(stack);

    // 3. Verificação de integridade e rollback atômico
    if (addResult.added < quantity) {
      // Restaura o cultivo original no CropSystem
      cropSystem.plantCrop(tileX, tileY, cropData.cropId, cropData.plantedAt);
      if (cropData.watered && cropData.lastWateredAt !== undefined) {
        cropSystem.waterCrop(tileX, tileY, cropData.lastWateredAt);
      }
      // Remove qualquer quantidade parcial adicionada
      if (addResult.added > 0) {
        player.inventory.removeItem(itemId, addResult.added);
      }

      return {
        success: false,
        tileX,
        tileY,
        cropId: cropData.cropId,
        failureReason: 'INVENTORY_FULL',
        message: 'Inventário cheio!',
      };
    }

    // 4. Dispara a ação temporária de colheita no Player (bloqueio mínimo de movimento)
    if (typeof player.startAction === 'function') {
      player.startAction('harvest', itemId, 0.15);
    }

    const itemName = itemDef?.name ?? itemId;
    const feedbackMessage = `${itemName} +${quantity}`;

    return {
      success: true,
      tileX,
      tileY,
      cropId: cropData.cropId,
      harvestItemId: itemId,
      quantityProduced: quantity,
      message: feedbackMessage,
    };
  }

  /**
   * Localiza deterministicamente o melhor cultivo maduro pronto para colheita à frente do jogador.
   *
   * Critérios estritos de ordenação:
   * 1. Menor distância física entre as caixas AABB;
   * 2. Menor distância ao ponto frontal do Player;
   * 3. Desempate estável e lexicográfico por chave de coordenadas (`crop_X_Y`).
   */
  public findBestCropTarget(
    player: Player,
    world: World,
    maxRange?: number,
  ): CropHarvestTarget | null {
    const range = maxRange ?? this.defaultRange;
    const searchArea = SpatialGeometry.calculateDirectionalArea(
      player.position,
      player.size,
      player.direction,
      range,
    );

    const candidates = this.findCropCandidatesInArea(player, world, searchArea, range);
    if (candidates.length === 0) {
      return null;
    }

    return candidates[0].target;
  }

  /**
   * Busca e avalia todos os cultivos válidos para interação dentro de uma área espacial.
   */
  public findCropCandidatesInArea(
    player: Player,
    world: World,
    searchArea: WorldBounds,
    maxRange?: number,
  ): readonly HarvestCandidateEvaluation[] {
    const range = maxRange ?? this.defaultRange;
    const cropSystem = world.getCropSystem();
    const currentWorldTime = world.getTime();

    const minTileX = Math.floor(searchArea.minX / TILE_SIZE);
    const maxTileX = Math.floor(searchArea.maxX / TILE_SIZE);
    const minTileY = Math.floor(searchArea.minY / TILE_SIZE);
    const maxTileY = Math.floor(searchArea.maxY / TILE_SIZE);

    const playerBox = {
      minX: player.position.worldX,
      minY: player.position.worldY,
      maxX: player.position.worldX + player.size,
      maxY: player.position.worldY + player.size,
    };
    const frontPoint = SpatialGeometry.getDirectionFrontPoint(
      player.position,
      player.size,
      player.direction,
    );

    const candidates: HarvestCandidateEvaluation[] = [];

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        const crop = cropSystem.getCrop(tx, ty);
        if (!crop) {
          continue;
        }

        const cropDef = CropRegistry.get(crop.cropId);
        if (!cropDef) {
          continue;
        }

        const harvestDef = getCropHarvestDefinition(cropDef);
        if (harvestDef.requiresMaturity !== false) {
          if (!cropSystem.isMature(tx, ty, currentWorldTime)) {
            continue;
          }
        }

        const tileBounds: WorldBounds = {
          minX: tx * TILE_SIZE,
          minY: ty * TILE_SIZE,
          maxX: (tx + 1) * TILE_SIZE,
          maxY: (ty + 1) * TILE_SIZE,
          width: TILE_SIZE,
          height: TILE_SIZE,
        };

        if (
          !SpatialGeometry.isObjectInFrontSector(
            player.position,
            player.size,
            player.direction,
            tileBounds,
          )
        ) {
          continue;
        }

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

        if (boxDistance > range) {
          continue;
        }

        const ocx = tileBounds.minX + tileBounds.width / 2;
        const ocy = tileBounds.minY + tileBounds.height / 2;
        const distToFront = Math.hypot(ocx - frontPoint.worldX, ocy - frontPoint.worldY);

        candidates.push({
          target: new CropHarvestTarget(tx, ty, this),
          bounds: tileBounds,
          boxDistance,
          distToFront,
        });
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    // Ordenação determinística estrita
    candidates.sort((a, b) => {
      // 1. Menor distância física entre as caixas AABB
      if (Math.abs(a.boxDistance - b.boxDistance) > 1e-4) {
        return a.boxDistance - b.boxDistance;
      }
      // 2. Menor distância ao ponto frontal do Player
      if (Math.abs(a.distToFront - b.distToFront) > 1e-4) {
        return a.distToFront - b.distToFront;
      }
      // 3. Desempate lexicográfico estável por ID único do alvo
      return a.target.id.localeCompare(b.target.id);
    });

    return candidates;
  }

  /**
   * Retorna os alvos de colheita dentro da área especificada como InteractiveWorldObject.
   */
  public findCropTargetsInArea(
    player: Player,
    world: World,
    searchArea: WorldBounds,
    maxRange?: number,
  ): readonly CropHarvestTarget[] {
    return this.findCropCandidatesInArea(player, world, searchArea, maxRange).map((c) => c.target);
  }

  /**
   * Cria um provedor desacoplado de alvos compatível com o InteractionSystem.
   */
  public createTargetProvider(): (
    player: Player,
    world: World,
    searchArea: WorldBounds,
    range: number,
  ) => readonly InteractiveWorldObject[] {
    return (player: Player, world: World, searchArea: WorldBounds, range: number) => {
      return this.findCropTargetsInArea(player, world, searchArea, range);
    };
  }

  private getFailureMessage(reason?: HarvestFailureReason): string {
    switch (reason) {
      case 'NO_CROP':
        return 'Nenhum cultivo neste local.';
      case 'UNKNOWN_CROP':
        return 'Cultura desconhecida.';
      case 'NOT_MATURE':
        return 'O cultivo ainda não está maduro.';
      case 'OUT_OF_RANGE':
        return 'Muito longe para colher.';
      case 'BEHIND_PLAYER':
        return 'Vire-se para o cultivo para colher.';
      case 'INVENTORY_FULL':
        return 'Inventário cheio!';
      case 'MISSING_TOOL':
        return 'Ferramenta de colheita necessária.';
      default:
        return 'Não foi possível colher.';
    }
  }
}
