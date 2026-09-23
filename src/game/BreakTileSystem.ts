import { TILE_SIZE } from './constants.ts';
import { InputSource, TileCoord, TileType } from './types.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { PlaceableTileDefinition } from './PlaceableTileDefinition.ts';
import { PlaceableTileRegistry } from './PlaceableTileRegistry.ts';
import { RestoreTileMutation, ModifyTileMutation } from './InteractionTypes.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { createItemStack } from './ItemStack.ts';

/**
 * Razões tipadas para falha controlada de quebra/remoção de bloco.
 */
export type BreakTileFailureReason =
  | 'NO_TILE_SELECTED'
  | 'INVALID_COORDINATES'
  | 'OUT_OF_RANGE'
  | 'TILE_NOT_MODIFIED'
  | 'NOT_BREAKABLE'
  | 'INVENTORY_FULL'
  | 'MUTATION_FAILED'
  | 'RESTORE_FAILED';

/**
 * Avaliação pura e determinística de pré-condições para quebra de bloco.
 */
export interface BreakTileEvaluation {
  readonly canBreak: boolean;
  readonly failureReason?: BreakTileFailureReason;
  readonly definition?: PlaceableTileDefinition;
  readonly currentTileType?: TileType;
  readonly restoredTileType?: TileType;
  readonly dropItemId?: string;
  readonly dropQuantity?: number;
}

/**
 * Resultado completo da execução da quebra de bloco.
 */
export interface BreakTileResult {
  readonly success: boolean;
  readonly tileX: number;
  readonly tileY: number;
  readonly definition?: PlaceableTileDefinition;
  readonly previousTileType?: TileType;
  readonly restoredTileType?: TileType;
  readonly droppedItemId?: string;
  readonly droppedQuantity?: number;
  readonly failureReason?: BreakTileFailureReason;
}

/**
 * Sistema genérico para quebra e remoção de blocos/tiles colocados pelo jogador.
 *
 * Responsabilidades arquiteturais:
 * 1. Opera exclusivamente através de contratos declarativos (PlaceableTileDefinition, TileCoord, WorldMutation);
 * 2. REGRA FUNDAMENTAL: Só quebra blocos que possuam modificação registrada pelo sistema de construção
 *    (nunca destrói arbitrariamente o terreno procedural original);
 * 3. Restauração fiel do terreno anterior real registrado (não presume WOOD_FLOOR => GRASS);
 * 4. Política de inventário estrita: se o inventário estiver cheio para o drop, a quebra é rejeitada
 *    e o bloco permanece intacto (zero perda de recursos ou destruição sem drop);
 * 5. Totalmente agnóstico ao Renderer, sprites e Canvas (opera puramente com lógica e dados);
 * 6. Integrado à infraestrutura universal de mutações (BreakTileSystem -> WorldMutation -> WorldMutationHandler -> TileModificationRegistry -> World);
 * 7. Suporte a coordenadas positivas, negativas, fronteiras de chunks e persistência em ciclos de streaming.
 */
export class BreakTileSystem {
  private readonly defaultBreakRange: number;
  private lastResult: BreakTileResult | null = null;
  public onBreakTile?: (result: BreakTileResult) => void;

  constructor(defaultBreakRange: number = 64) {
    this.defaultBreakRange = defaultBreakRange;
  }

  /**
   * Avalia deterministicamente se o bloco no tile selecionado pode ser quebrado.
   * Não causa efeitos colaterais nem mutações no mundo ou no inventário.
   */
  public canBreak(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
  ): BreakTileEvaluation {
    if (!targetTile) {
      return { canBreak: false, failureReason: 'NO_TILE_SELECTED' };
    }

    const { tileX, tileY } = targetTile;

    // 1. Validação matemática de integridade das coordenadas
    if (!world.isValidTileCoord(tileX, tileY)) {
      return { canBreak: false, failureReason: 'INVALID_COORDINATES' };
    }

    // 2. REGRA FUNDAMENTAL: Só quebrar tiles que possuam uma modificação registrada pelo jogador
    if (!world.getTileModificationRegistry().hasModification(tileX, tileY)) {
      return { canBreak: false, failureReason: 'TILE_NOT_MODIFIED' };
    }

    // 3. Obter o estado efetivo atual do terreno
    const currentTile = world.getEffectiveTile(tileX, tileY);
    if (!currentTile) {
      return { canBreak: false, failureReason: 'INVALID_COORDINATES' };
    }

    // 4. Obter a modificação registrada para determinar o tile anterior real a ser restaurado
    const modification = world.getTileModificationRegistry().getModification(tileX, tileY);
    if (!modification) {
      return { canBreak: false, failureReason: 'TILE_NOT_MODIFIED' };
    }
    const restoredTileType =
      modification.previousType ?? world.getWorldGenerator().getTileTypeAt(tileX, tileY);

    // 5. Descobrir a definição declarativa do bloco através do registro central
    const definition = PlaceableTileRegistry.getByResultingTileType(currentTile.type);
    if (!definition) {
      return { canBreak: false, failureReason: 'NOT_BREAKABLE' };
    }

    // 6. Validação de alcance físico euclidiano a partir do centro do jogador
    const maxRange = definition.maxPlacementRange ?? this.defaultBreakRange;
    const playerCenter = player.getCenter();
    const tileCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = tileY * TILE_SIZE + TILE_SIZE / 2;
    const dx = tileCenterX - playerCenter.worldX;
    const dy = tileCenterY - playerCenter.worldY;
    const distance = Math.hypot(dx, dy);

    if (distance > maxRange) {
      return {
        canBreak: false,
        failureReason: 'OUT_OF_RANGE',
        definition,
        currentTileType: currentTile.type,
        restoredTileType,
      };
    }

    // 7. Determinar item e quantidade a devolver ao inventário
    const dropItemId = definition.dropItemIdOnBreak ?? definition.requiredItemId;
    const dropQuantity = definition.dropQuantityOnBreak ?? 1;

    // 8. POLÍTICA DE INVENTÁRIO CHEIO:
    // Se o inventário não puder acomodar o drop, a quebra é rejeitada e o bloco permanece intacto
    if (!player.getInventory().canAddItem(dropItemId, dropQuantity)) {
      return {
        canBreak: false,
        failureReason: 'INVENTORY_FULL',
        definition,
        currentTileType: currentTile.type,
        restoredTileType,
        dropItemId,
        dropQuantity,
      };
    }

    return {
      canBreak: true,
      definition,
      currentTileType: currentTile.type,
      restoredTileType,
      dropItemId,
      dropQuantity,
    };
  }

  /**
   * Executa a quebra lógica atômica do bloco:
   * 1. Todas as validações prévias;
   * 2. Aplicação da mutação de restauração no mundo via WorldMutationHandler;
   * 3. Devolução do recurso no inventário;
   * 4. Se qualquer inconsistência inesperada ocorrer, reverte de forma atômica.
   */
  public executeBreak(
    player: Player,
    world: World,
    targetTile: TileCoord | null,
  ): BreakTileResult {
    const evaluation = this.canBreak(player, world, targetTile);
    if (!evaluation.canBreak || !evaluation.definition || !targetTile) {
      const failureResult: BreakTileResult = {
        success: false,
        tileX: targetTile ? targetTile.tileX : 0,
        tileY: targetTile ? targetTile.tileY : 0,
        definition: evaluation.definition,
        failureReason: evaluation.failureReason,
      };
      this.lastResult = failureResult;
      if (this.onBreakTile) {
        this.onBreakTile(failureResult);
      }
      return failureResult;
    }

    const { tileX, tileY } = targetTile;
    const definition = evaluation.definition;
    const currentTileType = evaluation.currentTileType!;
    const restoredTileType = evaluation.restoredTileType!;
    const dropItemId = evaluation.dropItemId!;
    const dropQuantity = evaluation.dropQuantity!;

    // 1. Mutação declarativa de restauração de tile no mundo
    const mutation: RestoreTileMutation = {
      type: 'restore_tile',
      tileX,
      tileY,
    };

    const applied = WorldMutationHandler.applyMutation(world, mutation);
    if (!applied) {
      const errorResult: BreakTileResult = {
        success: false,
        tileX,
        tileY,
        definition,
        previousTileType: currentTileType,
        restoredTileType,
        failureReason: 'MUTATION_FAILED',
      };
      this.lastResult = errorResult;
      if (this.onBreakTile) {
        this.onBreakTile(errorResult);
      }
      return errorResult;
    }

    // 2. Adicionar o drop ao inventário do jogador
    const addResult = player.getInventory().addItemStack(
      createItemStack(dropItemId, dropQuantity),
    );

    // Salvaguarda atômica contra inconsistência inesperada
    if (addResult.remainder !== null) {
      // Reverte a remoção do bloco no mundo
      const rollbackMutation: ModifyTileMutation = {
        type: 'modify_tile',
        tileX,
        tileY,
        newTileType: currentTileType,
        previousTileType: restoredTileType,
      };
      WorldMutationHandler.applyMutation(world, rollbackMutation);

      // Se algo foi adicionado parcialmente, remove para manter o inventário no estado original
      if (addResult.added > 0) {
        player.getInventory().removeItem(dropItemId, addResult.added);
      }

      const errorResult: BreakTileResult = {
        success: false,
        tileX,
        tileY,
        definition,
        previousTileType: currentTileType,
        restoredTileType,
        failureReason: 'INVENTORY_FULL',
      };
      this.lastResult = errorResult;
      if (this.onBreakTile) {
        this.onBreakTile(errorResult);
      }
      return errorResult;
    }

    const successResult: BreakTileResult = {
      success: true,
      tileX,
      tileY,
      definition,
      previousTileType: currentTileType,
      restoredTileType,
      droppedItemId: dropItemId,
      droppedQuantity: dropQuantity,
    };

    this.lastResult = successResult;
    if (this.onBreakTile) {
      this.onBreakTile(successResult);
    }
    return successResult;
  }

  /**
   * Atualização do loop do jogo para a ação 'break'.
   */
  public update(
    player: Player,
    world: World,
    input: InputSource,
    tileSelectionSystem: TileSelectionSystem,
    _deltaTime: number,
  ): BreakTileResult | null {
    if (!input.isActionJustPressed || !input.isActionJustPressed('break')) {
      return null;
    }

    const selectedTile = tileSelectionSystem.getSelectedTile();
    if (!selectedTile) {
      return null;
    }

    return this.executeBreak(player, world, selectedTile);
  }

  /**
   * Retorna o último resultado de quebra processado.
   */
  public getLastResult(): BreakTileResult | null {
    return this.lastResult;
  }

  /**
   * Retorna o alcance físico padrão de quebra configurado no sistema.
   */
  public getDefaultBreakRange(): number {
    return this.defaultBreakRange;
  }
}
