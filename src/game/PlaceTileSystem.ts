import { TILE_SIZE } from './constants.ts';
import { InputSource, TileCoord, WorldBounds } from './types.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { ModifyTileMutation } from './InteractionTypes.ts';
import { TileRegistry } from './TileRegistry.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import {
  PlaceableTileDefinition,
  PlaceTileFailureReason,
  PlaceTileResult,
} from './PlaceableTileDefinition.ts';
import { PlaceableTileRegistry } from './PlaceableTileRegistry.ts';

/**
 * Sistema genérico, declarativo e determinístico responsável pela colocação de blocos/tiles no mundo.
 *
 * Princípios arquiteturais:
 * 1. Zero hardcode de itens ou blocos ("wood", "wooden_floor", "grass"): o comportamento é 100% derivado dos dados.
 * 2. Cadeia de mutação estrita: PlaceTileSystem -> WorldMutation -> WorldMutationHandler -> TileModificationRegistry -> World.
 * 3. Totalmente desacoplado de Canvas, Renderer ou sprites. A validação é estritamente espacial, lógica e física.
 * 4. Valida alcance físico, integridade de coordenadas, regras do bloco, colisão física com o jogador e inventário.
 * 5. Consome item exclusivamente se a colocação for autorizada e bem-sucedida.
 * 6. Suporta coordenadas infinitas, negativas e transições entre chunks sem materialização indevida.
 */
export class PlaceTileSystem {
  public defaultPlacementRange: number;

  /** Último resultado de colocação processado */
  private lastResult: PlaceTileResult | null = null;

  /** Ouvinte desacoplado opcional para eventos de colocação de bloco */
  public onPlaceTile?: (result: PlaceTileResult) => void;

  constructor(defaultPlacementRange: number = 64) {
    this.defaultPlacementRange = defaultPlacementRange;
  }

  /**
   * Retorna o último resultado de colocação processado.
   */
  public getLastResult(): PlaceTileResult | null {
    return this.lastResult;
  }

  /**
   * Avalia deterministicamente se o jogador pode colocar um bloco na coordenada indicada.
   * Não altera o inventário e não aplica mutações no mundo.
   */
  public canPlace(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
  ): {
    readonly canPlace: boolean;
    readonly failureReason?: PlaceTileFailureReason;
    readonly definition?: PlaceableTileDefinition;
  } {
    // 1. Validar se há seleção de tile ativa
    if (!targetTile) {
      return { canPlace: false, failureReason: 'NO_SELECTION' };
    }

    const { tileX, tileY } = targetTile;

    // 2. Validar integridade das coordenadas
    if (!world.isValidTileCoord(tileX, tileY)) {
      return { canPlace: false, failureReason: 'INVALID_COORDINATES' };
    }

    // 3. Verificar o item ativo/equipado na Hotbar do jogador
    const equippedStack = player.getEquippedStack();
    if (!equippedStack || equippedStack.quantity <= 0) {
      return { canPlace: false, failureReason: 'NO_ITEM_EQUIPPED' };
    }

    // 4. Consultar o registro declarativo de blocos colocáveis
    const placeableDef = PlaceableTileRegistry.getByItemId(equippedStack.itemId);
    if (!placeableDef) {
      return { canPlace: false, failureReason: 'NOT_PLACEABLE' };
    }

    // 5. Verificar quantidade necessária
    const requiredQty = placeableDef.requiredQuantity ?? 1;
    if (equippedStack.quantity < requiredQty) {
      return { canPlace: false, failureReason: 'INSUFFICIENT_QUANTITY', definition: placeableDef };
    }

    // 6. Validar alcance físico entre jogador e o centro do tile alvo
    const tileCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = tileY * TILE_SIZE + TILE_SIZE / 2;
    const playerCenter = player.getCenter();
    const distance = Math.hypot(tileCenterX - playerCenter.worldX, tileCenterY - playerCenter.worldY);
    const maxRange = placeableDef.maxPlacementRange ?? this.defaultPlacementRange;

    if (distance > maxRange) {
      return { canPlace: false, failureReason: 'OUT_OF_RANGE', definition: placeableDef };
    }

    // 7. Obter o estado efetivo do terreno na coordenada
    const effectiveTile = world.getEffectiveTile(tileX, tileY);
    if (!effectiveTile) {
      return { canPlace: false, failureReason: 'INVALID_COORDINATES', definition: placeableDef };
    }

    // Impedir colocação redundante se o tile já for do mesmo tipo resultante
    if (effectiveTile.type === placeableDef.resultingTileType) {
      return { canPlace: false, failureReason: 'ALREADY_TARGET_TYPE', definition: placeableDef };
    }

    // Impedir substituição arbitrária de tiles já modificados se a regra do bloco proibir
    const isAlreadyModified = world.getTileModificationRegistry().hasModification(tileX, tileY);
    if (isAlreadyModified && !placeableDef.canReplaceModified) {
      return { canPlace: false, failureReason: 'TILE_ALREADY_MODIFIED', definition: placeableDef };
    }

    // Validar lista branca de tipos de terreno de origem permitidos
    if (
      placeableDef.allowedSourceTileTypes &&
      placeableDef.allowedSourceTileTypes.length > 0 &&
      !placeableDef.allowedSourceTileTypes.includes(effectiveTile.type)
    ) {
      return { canPlace: false, failureReason: 'INVALID_SOURCE_TILE', definition: placeableDef };
    }

    // Validar lista negra de tipos de terreno de origem proibidos
    if (
      placeableDef.disallowedSourceTileTypes &&
      placeableDef.disallowedSourceTileTypes.includes(effectiveTile.type)
    ) {
      return { canPlace: false, failureReason: 'DISALLOWED_SOURCE_TILE', definition: placeableDef };
    }

    // 8. Impedir colocação que resulte em colisão inválida com o próprio jogador (Requisitos D e J)
    // Se o bloco colocado não for caminhável, ele não pode interceptar a hitbox do jogador
    let isBlockWalkable = placeableDef.walkable;
    if (TileRegistry.has(placeableDef.resultingTileType)) {
      const resultingTileDef = TileRegistry.get(placeableDef.resultingTileType);
      if (!resultingTileDef.walkable) {
        isBlockWalkable = false;
      }
    }

    if (!isBlockWalkable) {
      const tileBounds: WorldBounds = {
        minX: tileX * TILE_SIZE,
        minY: tileY * TILE_SIZE,
        maxX: (tileX + 1) * TILE_SIZE,
        maxY: (tileY + 1) * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
      };

      const playerBounds: WorldBounds = {
        minX: player.position.worldX,
        minY: player.position.worldY,
        maxX: player.position.worldX + player.size,
        maxY: player.position.worldY + player.size,
        width: player.size,
        height: player.size,
      };

      const intersects = !(
        tileBounds.maxX <= playerBounds.minX ||
        tileBounds.minX >= playerBounds.maxX ||
        tileBounds.maxY <= playerBounds.minY ||
        tileBounds.minY >= playerBounds.maxY
      );

      if (intersects) {
        return { canPlace: false, failureReason: 'WOULD_COLLIDE_WITH_PLAYER', definition: placeableDef };
      }
    }

    // 9. Validar predicado customizado opcional
    if (placeableDef.customValidator) {
      const footPos = player.getFootPosition();
      const valid = placeableDef.customValidator({
        tileX,
        tileY,
        currentTileType: effectiveTile.type,
        definition: placeableDef,
        playerFootX: footPos.worldX,
        playerFootY: footPos.worldY,
      });
      if (!valid) {
        return { canPlace: false, failureReason: 'CUSTOM_VALIDATION_FAILED', definition: placeableDef };
      }
    }

    return { canPlace: true, definition: placeableDef };
  }

  /**
   * Executa determinística e atomicamente a colocação de um bloco/tile.
   *
   * @param player Referência do jogador autor da ação
   * @param world Referência do mundo
   * @param targetTile Coordenadas do tile alvo
   * @returns PlaceTileResult detalhando sucesso ou falha controlada
   */
  public executePlace(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
  ): PlaceTileResult {
    // 1. Avaliar todas as condições prévias
    const evaluation = this.canPlace(player, world, targetTile);
    if (!evaluation.canPlace || !evaluation.definition || !targetTile) {
      const failureResult: PlaceTileResult = {
        success: false,
        tileX: targetTile ? targetTile.tileX : 0,
        tileY: targetTile ? targetTile.tileY : 0,
        definition: evaluation.definition,
        failureReason: evaluation.failureReason,
      };
      this.lastResult = failureResult;
      if (this.onPlaceTile) {
        this.onPlaceTile(failureResult);
      }
      return failureResult;
    }

    const { tileX, tileY } = targetTile;
    const definition = evaluation.definition;
    const currentEffectiveTile = world.getEffectiveTile(tileX, tileY);
    if (!currentEffectiveTile) {
      const errorResult: PlaceTileResult = {
        success: false,
        tileX,
        tileY,
        definition,
        failureReason: 'INVALID_COORDINATES',
      };
      this.lastResult = errorResult;
      if (this.onPlaceTile) {
        this.onPlaceTile(errorResult);
      }
      return errorResult;
    }
    const requiredQty = definition.requiredQuantity ?? 1;
    const selectedSlotIndex = player.getHotbar().getSelectedSlotIndex();

    // 2. Garantir deterministicamente que o item necessário está disponível no slot antes de qualquer mutação
    const currentSlot = player.getInventory().getSlot(selectedSlotIndex);
    if (!currentSlot || currentSlot.itemId !== definition.requiredItemId || currentSlot.quantity < requiredQty) {
      const errorResult: PlaceTileResult = {
        success: false,
        tileX,
        tileY,
        definition,
        previousTileType: currentEffectiveTile.type,
        failureReason: 'INSUFFICIENT_QUANTITY',
      };
      this.lastResult = errorResult;
      if (this.onPlaceTile) {
        this.onPlaceTile(errorResult);
      }
      return errorResult;
    }

    // 3. Construir mutação declarativa de mundo
    const mutation: ModifyTileMutation = {
      type: 'modify_tile',
      tileX,
      tileY,
      newTileType: definition.resultingTileType,
      previousTileType: currentEffectiveTile.type,
    };

    // 4. Aplicar mutação através do WorldMutationHandler (preserva a cadeia arquitetural única)
    const applied = WorldMutationHandler.applyMutation(world, mutation);
    if (!applied) {
      const errorResult: PlaceTileResult = {
        success: false,
        tileX,
        tileY,
        definition,
        previousTileType: currentEffectiveTile.type,
        failureReason: 'MUTATION_FAILED',
      };
      this.lastResult = errorResult;
      if (this.onPlaceTile) {
        this.onPlaceTile(errorResult);
      }
      return errorResult;
    }

    // 5. Consumir exatamente a quantidade necessária do slot equipado no inventário
    // Se a quantidade restante for zero, o inventário limpa o slot para null automaticamente
    const removeResult = player.getInventory().removeSlotItem(selectedSlotIndex, requiredQty);
    if (!removeResult.removedStack || removeResult.removedStack.quantity !== requiredQty) {
      // Mecanismo seguro de consistência: se o consumo falhar, restaura o mundo para evitar estado parcial
      WorldMutationHandler.applyMutation(world, {
        type: 'restore_tile',
        tileX,
        tileY,
      });

      const errorResult: PlaceTileResult = {
        success: false,
        tileX,
        tileY,
        definition,
        previousTileType: currentEffectiveTile.type,
        failureReason: 'INSUFFICIENT_QUANTITY',
      };
      this.lastResult = errorResult;
      if (this.onPlaceTile) {
        this.onPlaceTile(errorResult);
      }
      return errorResult;
    }

    const successResult: PlaceTileResult = {
      success: true,
      tileX,
      tileY,
      definition,
      previousTileType: currentEffectiveTile.type,
      resultingTileType: definition.resultingTileType,
      consumedItemId: definition.requiredItemId,
      consumedAmount: requiredQty,
    };

    this.lastResult = successResult;
    if (this.onPlaceTile) {
      this.onPlaceTile(successResult);
    }
    return successResult;
  }

  /**
   * Ciclo de atualização de frame do sistema de colocação.
   * Dispara exclusivamente quando a ação abstrata 'place' for acionada (just pressed).
   */
  public update(
    player: Player,
    world: World,
    input: InputSource,
    tileSelectionSystem: TileSelectionSystem,
    _deltaTime: number,
  ): void {
    if (!input.isActionJustPressed) {
      return;
    }

    if (input.isActionJustPressed('place')) {
      const selectedTile = tileSelectionSystem.getSelectedTile();
      this.executePlace(player, world, selectedTile);
    }
  }
}
