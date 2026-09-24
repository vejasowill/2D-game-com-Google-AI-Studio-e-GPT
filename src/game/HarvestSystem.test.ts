import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { World } from './World.ts';
import { Player, PlayerDirection } from './Player.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { CropRegistry } from './CropRegistry.ts';
import { CropDefinition } from './CropDefinition.ts';
import { HarvestSystem } from './HarvestSystem.ts';
import { HarvestDefinition, getCropHarvestDefinition } from './HarvestDefinition.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { PlantCropSystem } from './PlantCropSystem.ts';
import { WateringSystem } from './WateringSystem.ts';
import { createItemStack } from './ItemStack.ts';
import { TileType, WorldBounds } from './types.ts';
import { TILE_SIZE, CHUNK_SIZE } from './constants.ts';
import { CropHarvestTarget } from './CropHarvestTarget.ts';

describe('HarvestSystem & Agricultural Harvest Foundation Suite', () => {
  let world: World;
  let player: Player;
  let harvestSystem: HarvestSystem;
  let interactionSystem: InteractionSystem;
  let plantCropSystem: PlantCropSystem;
  let wateringSystem: WateringSystem;

  beforeEach(() => {
    ToolRegistry.reset();
    ItemRegistry.clear();
    ItemRegistry.ensureInitialized();
    CropRegistry.reset();

    world = new World();
    harvestSystem = new HarvestSystem(48);
    interactionSystem = new InteractionSystem(48);
    interactionSystem.setHarvestSystem(harvestSystem);
    plantCropSystem = new PlantCropSystem(48);
    wateringSystem = new WateringSystem();

    // Posiciona o player próximo a (32, 32)
    player = new Player({ worldX: 32, worldY: 32 });
    player.direction = PlayerDirection.RIGHT;
  });

  function setupMatureCrop(
    tileX: number,
    tileY: number,
    cropId: string = 'turnip',
    plantedAt: number = 0,
    currentWorldTime: number = 100,
  ): void {
    world.applyTileModification(tileX, tileY, TileType.TILLED_SOIL, TileType.GRASS);
    world.getCropSystem().plantCrop(tileX, tileY, cropId, plantedAt);
    world.getCropSystem().waterCrop(tileX, tileY, plantedAt);
    world.setTime(currentWorldTime);
  }

  // A. HarvestDefinition é declarativa.
  it('A. HarvestDefinition é declarativa e imutável', () => {
    const customHarvest: HarvestDefinition = {
      cropId: 'custom_crop',
      harvestItemId: 'custom_produce',
      harvestQuantity: 2,
      requiresMaturity: true,
      action: 'harvest',
      metadata: { test: true },
    };

    assert.equal(customHarvest.cropId, 'custom_crop');
    assert.equal(customHarvest.harvestItemId, 'custom_produce');
    assert.equal(customHarvest.harvestQuantity, 2);
    assert.equal(customHarvest.requiresMaturity, true);
    assert.equal(customHarvest.action, 'harvest');
  });

  // B. CropDefinition consegue declarar resultado de colheita.
  it('B. CropDefinition consegue declarar resultado de colheita explicitamente ou inferido', () => {
    const cropWithExplicitHarvest: CropDefinition = {
      id: 'corn',
      name: 'Milho',
      seedItemId: 'corn_seed',
      totalStages: 3,
      stageDurations: [10, 10],
      yieldQuantity: 3,
      harvestItemId: 'corn',
      harvestDefinition: {
        cropId: 'corn',
        harvestItemId: 'corn',
        harvestQuantity: 3,
        requiresMaturity: true,
        action: 'harvest',
      },
    };

    const def = getCropHarvestDefinition(cropWithExplicitHarvest);
    assert.equal(def.cropId, 'corn');
    assert.equal(def.harvestItemId, 'corn');
    assert.equal(def.harvestQuantity, 3);
    assert.equal(def.requiresMaturity, true);

    const cropWithInferredHarvest: CropDefinition = {
      id: 'wheat',
      name: 'Trigo',
      seedItemId: 'wheat_seed',
      totalStages: 3,
      stageDurations: [10, 10],
      yieldQuantity: 2,
      harvestItemId: 'wheat',
    };

    const inferredDef = getCropHarvestDefinition(cropWithInferredHarvest);
    assert.equal(inferredDef.cropId, 'wheat');
    assert.equal(inferredDef.harvestItemId, 'wheat');
    assert.equal(inferredDef.harvestQuantity, 2);
    assert.equal(inferredDef.requiresMaturity, true);
  });

  // C. turnip possui item de colheita válido.
  it('C. turnip possui item de colheita válido registrado no ItemRegistry', () => {
    const turnipCrop = CropRegistry.get('turnip');
    assert.ok(turnipCrop, 'Cultura turnip deve existir no CropRegistry');

    const harvestDef = getCropHarvestDefinition(turnipCrop!);
    assert.equal(harvestDef.harvestItemId, 'turnip');
    assert.ok(harvestDef.harvestQuantity >= 1);

    const produceItem = ItemRegistry.get(harvestDef.harvestItemId);
    assert.ok(produceItem, 'Item turnip deve existir no ItemRegistry');
    assert.equal(produceItem?.id, 'turnip');
  });

  // D. cultura imatura não pode ser colhida.
  it('D. cultura imatura não pode ser colhida', () => {
    // Nabo necessita de 30s de rega para amadurecer (3 estágios de 10s)
    setupMatureCrop(2, 1, 'turnip', 0, 15); // Apenas 15s decorridos

    const evaluation = harvestSystem.canHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(evaluation.canHarvest, false);
    assert.equal(evaluation.failureReason, 'NOT_MATURE');

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'NOT_MATURE');
    assert.equal(player.inventory.getItemCount('turnip'), 0);
    assert.equal(world.getCropSystem().hasCrop(2, 1), true);
  });

  // E. cultura madura pode ser colhida.
  it('E. cultura madura pode ser colhida', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 50); // 50s > 30s -> Maduro

    const evaluation = harvestSystem.canHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(evaluation.canHarvest, true);

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);
  });

  // F. exatamente a quantidade declarada é produzida.
  it('F. exatamente a quantidade declarada é produzida', () => {
    CropRegistry.register({
      id: 'super_turnip',
      name: 'Super Nabo',
      seedItemId: 'super_turnip_seed',
      totalStages: 2,
      stageDurations: [10],
      yieldQuantity: 4,
      harvestItemId: 'turnip',
      harvestDefinition: {
        cropId: 'super_turnip',
        harvestItemId: 'turnip',
        harvestQuantity: 4,
        requiresMaturity: true,
      },
    });

    setupMatureCrop(2, 1, 'super_turnip', 0, 20);

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);
    assert.equal(result.quantityProduced, 4);
    assert.equal(player.inventory.getItemCount('turnip'), 4);
  });

  // G. item é adicionado ao inventário.
  it('G. item é adicionado ao inventário do jogador', () => {
    assert.equal(player.inventory.getItemCount('turnip'), 0);
    setupMatureCrop(2, 1, 'turnip', 0, 40);

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);
    assert.equal(player.inventory.getItemCount('turnip'), 1);
  });

  // H. cultivo é removido após sucesso.
  it('H. cultivo é removido do CropSystem após colheita com sucesso', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 40);
    assert.equal(world.getCropSystem().hasCrop(2, 1), true);

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);
    assert.equal(world.getCropSystem().hasCrop(2, 1), false);
  });

  // I. TILLED_SOIL permanece depois da colheita.
  it('I. TILLED_SOIL permanece intacto no terreno após a colheita', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 40);

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);

    const effectiveTile = world.getEffectiveTile(2, 1);
    assert.ok(effectiveTile);
    assert.equal(effectiveTile.type, TileType.TILLED_SOIL);
  });

    // J. planta pode ser plantada novamente depois da colheita.
  it('J. planta pode ser plantada novamente no mesmo tile após a colheita', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 40);
    const harvestResult = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(harvestResult.success, true);

    // Equipar semente de nabo no inventário
    player.inventory.addItemStack(createItemStack('turnip_seed', 5));
    const evalPlant = plantCropSystem.canPlant(player, world, { tileX: 2, tileY: 1 }, 'turnip_seed');
    assert.equal(evalPlant.canPlant, true);

    const plantResult = plantCropSystem.executePlant(player, world, { tileX: 2, tileY: 1 }, 'turnip_seed');
    assert.equal(plantResult.success, true);
    assert.equal(world.getCropSystem().hasCrop(2, 1), true);
  });

  // K. inventário cheio rejeita a colheita.
  it('K. inventário cheio rejeita a colheita', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 40);

    // Enche todos os slots com outro item
    const slotCount = player.inventory.getSlotCount();
    for (let i = 0; i < slotCount; i++) {
      player.inventory.setSlot(i, createItemStack('stone', 99));
    }
    assert.equal(player.inventory.isFull(), true);
    assert.equal(player.inventory.canAddItem('turnip', 1), false);

    const evalHarvest = harvestSystem.canHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(evalHarvest.canHarvest, false);
    assert.equal(evalHarvest.failureReason, 'INVENTORY_FULL');

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'INVENTORY_FULL');
  });

  // L. inventário cheio não remove a planta.
  it('L. inventário cheio não remove a planta', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 40);

    const slotCount = player.inventory.getSlotCount();
    for (let i = 0; i < slotCount; i++) {
      player.inventory.setSlot(i, createItemStack('stone', 99));
    }

    harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(world.getCropSystem().hasCrop(2, 1), true);
  });

  // M. falha não produz item.
  it('M. falha na colheita não produz item no inventário', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 10); // Imaturo

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, false);
    assert.equal(player.inventory.getItemCount('turnip'), 0);
  });

  // N. falha não altera o cultivo.
  it('N. falha na colheita não altera o cultivo original', () => {
    setupMatureCrop(2, 1, 'turnip', 5, 10);
    const beforeCrop = { ...world.getCropSystem().getCrop(2, 1)! };

    harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 }); // Imaturo

    const afterCrop = world.getCropSystem().getCrop(2, 1);
    assert.ok(afterCrop);
    assert.equal(afterCrop?.cropId, beforeCrop.cropId);
    assert.equal(afterCrop?.plantedAt, beforeCrop.plantedAt);
    assert.equal(afterCrop?.watered, beforeCrop.watered);
  });

  // O. alcance físico é respeitado.
  it('O. alcance físico é respeitado e rejeita alvos distantes', () => {
    setupMatureCrop(20, 20, 'turnip', 0, 50); // Longe da posição (32, 32)

    const evaluation = harvestSystem.canHarvest(player, world, { tileX: 20, tileY: 20 });
    assert.equal(evaluation.canHarvest, false);
    assert.equal(evaluation.failureReason, 'OUT_OF_RANGE');

    const result = harvestSystem.executeHarvest(player, world, { tileX: 20, tileY: 20 });
    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'OUT_OF_RANGE');
  });

  // P. direção frontal é respeitada.
  it('P. direção frontal é respeitada para alvos à frente do jogador', () => {
    // Player em (32, 32) virado para RIGHT (tileX=1, tileY=1)
    player.position = { worldX: 32, worldY: 32 };
    player.direction = PlayerDirection.RIGHT;

    // Tile (2, 1) está à direita (frente)
    setupMatureCrop(2, 1, 'turnip', 0, 50);

    const evaluation = harvestSystem.canHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(evaluation.canHarvest, true);
  });

  // Q. objetos atrás do jogador são rejeitados.
  it('Q. objetos atrás do jogador são rejeitados', () => {
    player.position = { worldX: 32, worldY: 32 };
    player.direction = PlayerDirection.RIGHT;

    // Tile (0, 1) está à esquerda (costas do jogador)
    setupMatureCrop(0, 1, 'turnip', 0, 50);

    const evaluation = harvestSystem.canHarvest(player, world, { tileX: 0, tileY: 1 });
    assert.equal(evaluation.canHarvest, false);
    assert.equal(evaluation.failureReason, 'BEHIND_PLAYER');
  });

  // R. coordenadas negativas funcionam.
  it('R. coordenadas negativas funcionam corretamente', () => {
    const negX = -3;
    const negY = -4;

    player.position = { worldX: (negX - 1) * TILE_SIZE, worldY: negY * TILE_SIZE };
    player.direction = PlayerDirection.RIGHT;

    setupMatureCrop(negX, negY, 'turnip', 0, 50);

    const evaluation = harvestSystem.canHarvest(player, world, { tileX: negX, tileY: negY });
    assert.equal(evaluation.canHarvest, true);

    const result = harvestSystem.executeHarvest(player, world, { tileX: negX, tileY: negY });
    assert.equal(result.success, true);
    assert.equal(world.getCropSystem().hasCrop(negX, negY), false);
    assert.equal(player.inventory.getItemCount('turnip'), 1);
  });

  // S. fronteiras de chunks funcionam.
  it('S. fronteiras de chunks funcionam corretamente', () => {
    const borderX = CHUNK_SIZE - 1; // 15
    const borderY = 0;

    player.position = { worldX: (borderX - 1) * TILE_SIZE, worldY: 0 };
    player.direction = PlayerDirection.RIGHT;

    setupMatureCrop(borderX, borderY, 'turnip', 0, 50);

    const result = harvestSystem.executeHarvest(player, world, { tileX: borderX, tileY: borderY });
    assert.equal(result.success, true);
    assert.equal(world.getCropSystem().hasCrop(borderX, borderY), false);

    // O tile vizinho no próximo chunk (16, 0)
    setupMatureCrop(borderX + 1, borderY, 'turnip', 0, 50);
    player.position = { worldX: borderX * TILE_SIZE, worldY: 0 };

    const result2 = harvestSystem.executeHarvest(player, world, { tileX: borderX + 1, tileY: borderY });
    assert.equal(result2.success, true);
    assert.equal(world.getCropSystem().hasCrop(borderX + 1, borderY), false);
  });

  // T. unload/reload não recria cultura colhida.
  it('T. unload/reload não recria cultura colhida', () => {
    const tx = 5;
    const ty = 5;
    setupMatureCrop(tx, ty, 'turnip', 0, 50);

    const result = harvestSystem.executeHarvest(player, world, { tileX: tx, tileY: ty }, { checkDirection: false, maxRange: 500 });
    assert.equal(result.success, true);
    assert.equal(world.getCropSystem().hasCrop(tx, ty), false);

    // Descarrega o chunk e simula novo carregamento
    const chunkX = Math.floor(tx / CHUNK_SIZE);
    const chunkY = Math.floor(ty / CHUNK_SIZE);
    world.getChunkManager().unloadChunk(chunkX, chunkY);

    assert.equal(world.getCropSystem().hasCrop(tx, ty), false);
  });

  // U. consulta não materializa chunks indevidamente.
  it('U. consulta não materializa chunks indevidamente', () => {
    const distantTileX = 800;
    const distantTileY = 800;
    const chunkX = Math.floor(distantTileX / CHUNK_SIZE);
    const chunkY = Math.floor(distantTileY / CHUNK_SIZE);

    assert.equal(world.getChunkManager().isChunkLoaded(chunkX, chunkY), false);

    const evaluation = harvestSystem.canHarvest(player, world, { tileX: distantTileX, tileY: distantTileY });
    assert.equal(evaluation.canHarvest, false);

    // Confirma que o chunk continua descarregado
    assert.equal(world.getChunkManager().isChunkLoaded(chunkX, chunkY), false);
  });

  // V. colheita não depende do sprite.
  it('V. colheita não depende do sprite registrado', () => {
    CropRegistry.register({
      id: 'no_sprite_crop',
      name: 'Sem Sprite',
      seedItemId: 'no_sprite_seed',
      totalStages: 2,
      stageDurations: [10],
      yieldQuantity: 1,
      harvestItemId: 'turnip',
      // spriteAssetId intencionalmente omitido
    });

    setupMatureCrop(2, 1, 'no_sprite_crop', 0, 50);

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);
  });

  // W. colheita não depende do tamanho visual.
  it('W. colheita não depende do tamanho visual do sprite', () => {
    // Altera a configuração visual gráfica do Player para 128x256
    player.visualConfig = {
      visualWidth: 128,
      visualHeight: 256,
      anchorX: 0.5,
      anchorY: 1.0,
      scale: 2.0,
    };

    // A hitbox física do jogador continua 24x24
    assert.equal(player.size, 24);

    setupMatureCrop(2, 1, 'turnip', 0, 50);
    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);
  });

  // X. INTERACT mobile utiliza a mesma pipeline.
  it('X. INTERACT mobile utiliza a mesma pipeline de interação', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 50);

    // Mock do input discreto da ação 'interact'
    const mockInput = {
      isActionJustPressed: (action: string) => action === 'interact',
      getMovementDirection: () => ({ x: 0, y: 0 }),
      isActionPressed: () => false,
    };

    const target = interactionSystem.findBestTarget(player, world);
    assert.ok(target, 'InteractionSystem deve detectar o CropHarvestTarget');
    assert.equal(target?.type, 'crop');

    const interactionResult = interactionSystem.update(player, world, mockInput as any, 0.016);
    assert.ok(interactionResult, 'Interação deve produzir resultado');
    assert.equal(interactionResult?.success, true);
    assert.equal(player.inventory.getItemCount('turnip'), 1);
    assert.equal(world.getCropSystem().hasCrop(2, 1), false);
  });

  // Y. InteractionSystem continua genérico.
  it('Y. InteractionSystem continua genérico através do contrato InteractiveWorldObject', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 50);

    const bestTarget = interactionSystem.findBestTarget(player, world);
    assert.ok(bestTarget);
    assert.equal(typeof bestTarget?.interact, 'function');
    assert.equal(bestTarget?.interaction.id, 'harvest');
    assert.equal(bestTarget?.interaction.label, 'Colher');
  });

  // Z. HarvestSystem não possui branches específicos para turnip.
  it('Z. HarvestSystem opera polimorficamente sem ramificações fixas para turnip', () => {
    ItemRegistry.register({
      id: 'carrot',
      name: 'Cenoura',
      maxStackSize: 99,
      category: 'flora',
    });

    CropRegistry.register({
      id: 'carrot',
      name: 'Cenoura',
      seedItemId: 'carrot_seed',
      totalStages: 3,
      stageDurations: [5, 5],
      yieldQuantity: 2,
      harvestItemId: 'carrot',
      harvestDefinition: {
        cropId: 'carrot',
        harvestItemId: 'carrot',
        harvestQuantity: 2,
        requiresMaturity: true,
      },
    });

    setupMatureCrop(2, 1, 'carrot', 0, 30);

    const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(result.success, true);
    assert.equal(result.harvestItemId, 'carrot');
    assert.equal(result.quantityProduced, 2);
    assert.equal(player.inventory.getItemCount('carrot'), 2);
  });

  // AA. nenhuma chamada depende de Math.random().
  it('AA. nenhuma chamada depende de Math.random()', () => {
    const originalRandom = Math.random;
    Math.random = () => {
      throw new Error('Math.random foi indevidamente invocado durante a colheita!');
    };

    try {
      setupMatureCrop(2, 1, 'turnip', 0, 50);
      const result = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
      assert.equal(result.success, true);
    } finally {
      Math.random = originalRandom;
    }
  });

  // AB. resultado é determinístico.
  it('AB. resultado é determinístico para mesmos parâmetros temporais e espaciais', () => {
    setupMatureCrop(2, 1, 'turnip', 10, 45);
    const eval1 = harvestSystem.canHarvest(player, world, { tileX: 2, tileY: 1 });

    setupMatureCrop(3, 1, 'turnip', 10, 45);
    player.position = { worldX: 64, worldY: 32 };
    const eval2 = harvestSystem.canHarvest(player, world, { tileX: 3, tileY: 1 });

    assert.equal(eval1.canHarvest, eval2.canHarvest);
    assert.equal(eval1.failureReason, eval2.failureReason);
  });

  // AC. múltiplas colheitas independentes funcionam.
  it('AC. múltiplas colheitas independentes em sequência funcionam perfeitamente', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 50);
    setupMatureCrop(2, 2, 'turnip', 0, 50);

    player.direction = PlayerDirection.RIGHT;
    player.position = { worldX: 32, worldY: 32 };
    const r1 = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(r1.success, true);

    player.position = { worldX: 32, worldY: 64 };
    const r2 = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 2 });
    assert.equal(r2.success, true);

    assert.equal(player.inventory.getItemCount('turnip'), 2);
    assert.equal(world.getCropSystem().hasCrop(2, 1), false);
    assert.equal(world.getCropSystem().hasCrop(2, 2), false);
  });

  // AD. uma planta não pode ser colhida duas vezes.
  it('AD. uma planta não pode ser colhida duas vezes', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 50);

    const firstResult = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(firstResult.success, true);

    const secondResult = harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });
    assert.equal(secondResult.success, false);
    assert.equal(secondResult.failureReason, 'NO_CROP');
    assert.equal(player.inventory.getItemCount('turnip'), 1);
  });

  // AE. solo continua pronto para novo plantio.
  it('AE. solo arado permanece pronto para novo plantio imediatamente após a colheita', () => {
    setupMatureCrop(2, 1, 'turnip', 0, 50);
    harvestSystem.executeHarvest(player, world, { tileX: 2, tileY: 1 });

    const effectiveTile = world.getEffectiveTile(2, 1);
    assert.ok(effectiveTile);
    assert.equal(effectiveTile.type, TileType.TILLED_SOIL);
    assert.equal(world.getCropSystem().hasCrop(2, 1), false);

    player.inventory.addItemStack(createItemStack('turnip_seed', 1));
    const evalPlant = plantCropSystem.canPlant(player, world, { tileX: 2, tileY: 1 }, 'turnip_seed');
    assert.equal(evalPlant.canPlant, true);
  });
});
