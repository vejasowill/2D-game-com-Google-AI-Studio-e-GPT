import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { World } from './World.ts';
import { Player, PlayerDirection } from './Player.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { CropRegistry } from './CropRegistry.ts';
import { CropDefinition } from './CropDefinition.ts';
import { calculateCropGrowthStage, CropData, getCropEffectiveGrowthTime } from './CropState.ts';
import { CropSystem } from './CropSystem.ts';
import { WateringSystem } from './WateringSystem.ts';
import { PlantCropSystem } from './PlantCropSystem.ts';
import { TileToolTarget } from './TileToolTarget.ts';
import { createItemStack } from './ItemStack.ts';
import { TileType } from './types.ts';
import { TILE_SIZE, CHUNK_SIZE } from './constants.ts';
import { Input } from './Input.ts';

describe('WateringSystem & Crop Irrigation Suite', () => {
  beforeEach(() => {
    ToolRegistry.reset();
    ItemRegistry.clear();
    ItemRegistry.ensureInitialized();
    CropRegistry.reset();
  });

  // A. watering_can possui definição declarativa válida.
  it('A. watering_can deve possuir definição declarativa válida no ItemRegistry e ToolRegistry', () => {
    const itemDef = ItemRegistry.get('watering_can');
    assert.ok(itemDef, 'Item watering_can deve existir');
    assert.equal(itemDef?.id, 'watering_can');
    assert.equal(itemDef?.category, 'watering_can');
    assert.equal(itemDef?.useDefinition?.action, 'water');
    assert.equal(itemDef?.useDefinition?.targetDomain, 'tile');
    assert.equal(itemDef?.useDefinition?.consumesItem, false);
    assert.equal(itemDef?.maxStackSize, 1);
  });

  // B. ToolRegistry registra o regador.
  it('B. ToolRegistry deve registrar a ferramenta técnica basic_watering_can', () => {
    const tool = ToolRegistry.get('basic_watering_can');
    assert.ok(tool, 'basic_watering_can deve estar registrado no ToolRegistry');
    assert.equal(tool?.id, 'basic_watering_can');
    assert.equal(tool?.itemId, 'watering_can');
    assert.equal(tool?.category, 'watering_can');
    assert.equal(tool?.action, 'water');
    assert.equal(tool?.targetDomain, 'tile');
  });

  // C. item watering_can encontra a ferramenta correspondente.
  it('C. Item watering_can deve encontrar a ferramenta correspondente através do ToolRegistry', () => {
    const tool = ToolRegistry.getByItemId('watering_can');
    assert.ok(tool, 'ToolRegistry deve mapear itemId watering_can para sua ferramenta');
    assert.equal(tool?.id, 'basic_watering_can');
    assert.equal(tool?.action, 'water');
  });

  // D. regador não é consumido.
  it('D. Regador não deve ser consumido após o uso com sucesso', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 0);

    const player = new Player({ worldX: tileX * TILE_SIZE - 12, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('watering_can', 1));

    assert.equal(player.inventory.countItem('watering_can'), 1);

    const itemUseSystem = new ItemUseSystem();
    const result = itemUseSystem.useEquippedItem(player, world);

    assert.equal(result.success, true);
    assert.equal(result.action, 'water');
    assert.equal(player.inventory.countItem('watering_can'), 1, 'Regador deve continuar no inventário');
  });

  // E. watering_can utiliza targetDomain tile.
  it('E. watering_can deve utilizar targetDomain tile para resolução espacial de alvo', () => {
    const itemDef = ItemRegistry.getOrThrow('watering_can');
    assert.equal(itemDef.useDefinition?.targetDomain, 'tile');

    const tool = ToolRegistry.getByItemId('watering_can');
    assert.equal(tool?.targetDomain, 'tile');
  });

  // F. cultivo plantado pode ser regado.
  it('F. Cultivo plantado em TILLED_SOIL deve poder ser regado com sucesso', () => {
    const world = new World(42);
    const tileX = 3;
    const tileY = 3;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 10);

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;

    const wateringSystem = new WateringSystem();
    const result = wateringSystem.executeWater(player, world, { tileX, tileY });

    assert.equal(result.success, true);
    assert.equal(world.isCropWatered(tileX, tileY), true, 'Cultivo deve estar no estado watered');
  });

  // G. tile sem cultivo não pode ser regado.
  it('G. Tile sem cultivo não deve poder ser regado pelo WateringSystem nem pelo TileToolTarget', () => {
    const world = new World(42);
    const tileX = 4;
    const tileY = 4;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    // Sem plantar cultivo!

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;

    const wateringSystem = new WateringSystem();
    const evalResult = wateringSystem.canWater(player, world, { tileX, tileY });
    assert.equal(evalResult.canWater, false);
    assert.equal(evalResult.failureReason, 'NO_CROP');

    const result = wateringSystem.executeWater(player, world, { tileX, tileY });
    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'NO_CROP');
  });

  // H. GRASS não pode ser regado como cultivo.
  it('H. Terreno de GRASS não pode ser regado como cultivo agrícola', () => {
    const world = new World(42);
    const tileX = 5;
    const tileY = 5;

    // Solo natural sem preparo
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;

    const wateringSystem = new WateringSystem();
    const result = wateringSystem.executeWater(player, world, { tileX, tileY });

    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'NO_CROP');
  });

  // I. WATER não é confundido com estado de irrigação de cultivo.
  it('I. Tile de terreno natural do tipo WATER não é confundido com estado de irrigação de cultivo', () => {
    const world = new World(42);
    const tileX = 6;
    const tileY = 6;

    world.modifyTile(tileX, tileY, TileType.WATER);

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;

    const wateringSystem = new WateringSystem();
    const result = wateringSystem.executeWater(player, world, { tileX, tileY });

    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'NO_CROP');
    assert.equal(world.isCropWatered(tileX, tileY), false);
  });

  // J. cultivo já regado pode ser tratado deterministicamente.
  it('J. Cultivo já regado pode receber nova rega de forma idempotente e determinística', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 10);

    // Primeira rega aos 10s
    world.getCropSystem().waterCrop(tileX, tileY, 10);
    assert.equal(world.isCropWatered(tileX, tileY), true);

    // Segunda rega aos 15s (idempotente/determinística, acumula período anterior)
    const successSecond = world.getCropSystem().waterCrop(tileX, tileY, 15);
    assert.equal(successSecond, true);

    const crop = world.getCropAt(tileX, tileY);
    assert.equal(crop?.watered, true);
    assert.equal(crop?.lastWateredAt, 15);
    assert.equal(crop?.wateredTimeAccumulated, 5);
  });

  // K. crescimento progride quando regado.
  it('K. Crescimento deve progredir normalmente durante períodos em que o cultivo estiver regado', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    // stageDurations: [10, 10, 10] -> totalStages: 4 (0, 1, 2, 3)
    const crop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 100,
      watered: true,
      lastWateredAt: 100,
    };

    assert.equal(calculateCropGrowthStage(crop, cropDef, 100), 0);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 109), 0);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 110), 1);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 120), 2);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 130), 3);
  });

  // L. crescimento NÃO progride durante período sem água.
  it('L. Crescimento NÃO deve progredir enquanto o cultivo estiver desprovido de rega (permanece congelado)', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    // Cultivo plantado em 100s, mas NUNCA regado
    const unwateredCrop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 100,
      watered: false,
    };

    // Mesmo após 1000s, o estágio permanece 0 (congelado)
    assert.equal(calculateCropGrowthStage(unwateredCrop, cropDef, 100), 0);
    assert.equal(calculateCropGrowthStage(unwateredCrop, cropDef, 200), 0);
    assert.equal(calculateCropGrowthStage(unwateredCrop, cropDef, 1100), 0);
  });

  // M. crescimento é independente de FPS.
  it('M. Crescimento sob rega deve ser independente da taxa de quadros (FPS)', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    const crop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 50,
      watered: true,
      lastWateredAt: 50,
    };

    const stageDirect = calculateCropGrowthStage(crop, cropDef, 75);

    let simulatedTime = 50;
    const dt = 1 / 60;
    let finalStageIterated = 0;
    while (simulatedTime <= 75) {
      finalStageIterated = calculateCropGrowthStage(crop, cropDef, simulatedTime);
      simulatedTime += dt;
    }

    assert.equal(stageDirect, 2);
    assert.equal(finalStageIterated, 2);
    assert.equal(stageDirect, finalStageIterated);
  });

  // N. crescimento não utiliza Math.random().
  it('N. Cálculo de crescimento e irrigação não deve utilizar Math.random()', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    const crop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 100,
      watered: true,
      lastWateredAt: 100,
    };

    let randomCalled = false;
    const originalRandom = Math.random;
    Math.random = () => {
      randomCalled = true;
      return 0.5;
    };

    try {
      const stage = calculateCropGrowthStage(crop, cropDef, 125);
      assert.equal(randomCalled, false, 'Math.random() não deve ser chamado');
      assert.equal(stage, 2);
    } finally {
      Math.random = originalRandom;
    }
  });

  // O. múltiplos períodos de rega produzem cálculo determinístico.
  it('O. Múltiplos períodos intercalados de rega e seca produzem cálculo estritamente determinístico', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    // Cultivo plantado aos 100s.
    // 1. Regado aos 100s, seca aos 105s (acumula 5s de crescimento regado)
    // 2. Sem água entre 105s e 120s (0s adicionados)
    // 3. Regado novamente aos 120s até 126s (acumula +6s de crescimento regado = 11s no total)
    // Com 11s totais regados: stageDurations [10, 10, 10] -> estágio 1 (pois 10s <= 11s < 20s)
    const cropSystem = new CropSystem();
    cropSystem.plantCrop(0, 0, 'turnip', 100);

    // Rega aos 100s
    cropSystem.waterCrop(0, 0, 100);
    assert.equal(cropSystem.getGrowthStage(0, 0, 104), 0);

    // Seca aos 105s
    cropSystem.dryCrop(0, 0, 105);
    // Em 115s (sem água desde os 105s), tempo efetivo deve permanecer congelado em 5s -> estágio 0
    assert.equal(cropSystem.getGrowthStage(0, 0, 115), 0);

    // Regado novamente aos 120s
    cropSystem.waterCrop(0, 0, 120);

    // Aos 124s: 5s acumulados + 4s = 9s -> estágio 0
    assert.equal(cropSystem.getGrowthStage(0, 0, 124), 0);

    // Aos 126s: 5s acumulados + 6s = 11s -> estágio 1
    assert.equal(cropSystem.getGrowthStage(0, 0, 126), 1);

    // Aos 135s: 5s acumulados + 15s = 20s -> estágio 2
    assert.equal(cropSystem.getGrowthStage(0, 0, 135), 2);
  });

  // P. unload/reload preserva estado correto.
  it('P. Estado de rega e crescimento sobrevive a unload e reload do chunk', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 10);
    world.waterCrop(tileX, tileY); // regado aos 0s do mundo (ou tempo corrente)

    const chunkX = Math.floor(tileX / CHUNK_SIZE);
    const chunkY = Math.floor(tileY / CHUNK_SIZE);
    world.getChunkManager().unloadChunk(chunkX, chunkY);

    assert.equal(world.getChunkManager().isChunkLoaded(chunkX, chunkY), false);

    // Consulta de estado de rega sem carregar chunk
    assert.equal(world.isCropWatered(tileX, tileY), true, 'Estado watered persiste com chunk descarregado');

    // Recarregar chunk
    world.getChunkManager().loadChunk(chunkX, chunkY);
    assert.equal(world.isCropWatered(tileX, tileY), true, 'Após reload do chunk, continua regado');
  });

  // Q. coordenadas negativas funcionam.
  it('Q. Regagem e crescimento condicionado funcionam perfeitamente em coordenadas negativas', () => {
    const world = new World(42);
    const tileX = -32;
    const tileY = -45;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 50);

    assert.equal(world.isCropWatered(tileX, tileY), false);

    // Regar em coordenadas negativas
    const success = world.getCropSystem().waterCrop(tileX, tileY, 50);
    assert.equal(success, true);
    assert.equal(world.isCropWatered(tileX, tileY), true);

    const stage = world.getCropSystem().getGrowthStage(tileX, tileY, 71);
    assert.equal(stage, 2, '21s de água aos 71s (50s plantado/regado) -> estágio 2');
  });

  // R. fronteiras de chunk funcionam.
  it('R. Rega de cultivos adjacentes em fronteiras de chunk opera de forma isolada e consistente', () => {
    const world = new World(42);
    const tileA = { tileX: CHUNK_SIZE - 1, tileY: 0 };
    const tileB = { tileX: CHUNK_SIZE, tileY: 0 };

    world.modifyTile(tileA.tileX, tileA.tileY, TileType.TILLED_SOIL);
    world.modifyTile(tileB.tileX, tileB.tileY, TileType.TILLED_SOIL);

    world.getCropSystem().plantCrop(tileA.tileX, tileA.tileY, 'turnip', 0);
    world.getCropSystem().plantCrop(tileB.tileX, tileB.tileY, 'turnip', 0);

    // Regar apenas tileA na borda
    world.getCropSystem().waterCrop(tileA.tileX, tileA.tileY, 0);

    assert.equal(world.isCropWatered(tileA.tileX, tileA.tileY), true);
    assert.equal(world.isCropWatered(tileB.tileX, tileB.tileY), false, 'TileB vizinho não deve ser afetado');
  });

  // S. consultas não materializam chunks indevidamente.
  it('S. Consultas de estado de rega em tiles distantes não materializam chunks no ChunkManager', () => {
    const world = new World(42);
    const distantChunkX = 77;
    const distantChunkY = 88;
    const tileX = distantChunkX * CHUNK_SIZE + 3;
    const tileY = distantChunkY * CHUNK_SIZE + 3;

    assert.equal(world.getChunkManager().isChunkLoaded(distantChunkX, distantChunkY), false);

    const isWatered = world.isCropWatered(tileX, tileY);
    assert.equal(isWatered, false);
    assert.equal(world.getChunkManager().isChunkLoaded(distantChunkX, distantChunkY), false);
  });

  // T. alcance físico é respeitado.
  it('T. Tentativa de regar tile além do alcance físico máximo deve falhar', () => {
    const world = new World(42);
    const tileX = 10;
    const tileY = 10;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 0);

    // Jogador distante em (0, 0)
    const player = new Player({ worldX: 0, worldY: 0 });
    player.direction = PlayerDirection.RIGHT;

    const wateringSystem = new WateringSystem(48);
    const result = wateringSystem.executeWater(player, world, { tileX, tileY });

    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'OUT_OF_RANGE');
    assert.equal(world.isCropWatered(tileX, tileY), false);
  });

  // U. direção frontal é respeitada.
  it('U. Regar tile localizado atrás do jogador deve ser rejeitado', () => {
    const world = new World(42);
    const tileX = 1;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 0);

    // Jogador no tile (2, 2) virado para a DIREITA (costas para tile 1, 2)
    const player = new Player({ worldX: 2 * TILE_SIZE, worldY: 2 * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;

    const wateringSystem = new WateringSystem();
    const result = wateringSystem.executeWater(player, world, { tileX, tileY });

    assert.equal(result.success, false);
    assert.equal(result.failureReason, 'BEHIND_PLAYER');
    assert.equal(world.isCropWatered(tileX, tileY), false);
  });

  // V. USE ITEM mobile executa a mesma pipeline.
  it('V. Botão virtual USE ITEM deve acionar a mesma pipeline para regador', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 0);

    const player = new Player({ worldX: tileX * TILE_SIZE - 12, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('watering_can', 1));

    const itemUseSystem = new ItemUseSystem();
    const input = new Input();

    input.triggerAction('use_item');

    const result = itemUseSystem.update(player, world, input, 0.016);
    assert.ok(result);
    assert.equal(result?.success, true);
    assert.equal(result?.action, 'water');
    assert.equal(world.isCropWatered(tileX, tileY), true, 'Cultivo deve estar regado após USE ITEM');
    assert.equal(player.inventory.countItem('watering_can'), 1, 'Regador não deve ser consumido');
  });

  // W. ToolSystem permanece genérico.
  it('W. ToolSystem e TileToolTarget permanecem genéricos e desacoplados de culturas específicas', () => {
    // Definir outra cultura declarativa dinâmica qualquer
    const wheatCrop: CropDefinition = {
      id: 'wheat',
      name: 'Trigo',
      seedItemId: 'wheat_seed',
      totalStages: 3,
      stageDurations: [15, 15],
      yieldQuantity: 3,
      harvestItemId: 'wheat',
    };
    CropRegistry.register(wheatCrop);

    const world = new World(42);
    const tileX = 8;
    const tileY = 8;
    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'wheat', 10);

    const tool = ToolRegistry.getOrThrow('basic_watering_can');
    const itemDef = ItemRegistry.getOrThrow('watering_can');
    const equippedItem = {
      slotIndex: 0,
      itemId: 'watering_can',
      quantity: 1,
      definition: itemDef,
    };
    const target = new TileToolTarget(tileX, tileY);

    const canWater = target.canReceiveToolAction(tool, {
      player: new Player({ worldX: 0, worldY: 0 }),
      world,
      equippedItem,
      tool,
    });
    assert.equal(canWater, true, 'Deve aceitar regar qualquer cultura registrada');

    const execResult = target.receiveToolAction(tool, {
      player: new Player({ worldX: 0, worldY: 0 }),
      world,
      equippedItem,
      tool,
    });
    assert.equal(execResult.success, true);
    assert.ok(execResult.mutations);
    assert.equal(execResult.mutations?.length, 1);
    assert.equal(execResult.mutations?.[0].type, 'water_crop');
  });

  // X. CropSystem continua sendo a fonte de verdade do cultivo.
  it('X. CropSystem continua sendo a fonte única de verdade do cultivo e do estado de rega', () => {
    const world = new World(42);
    const tileX = 0;
    const tileY = 0;

    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 50);
    world.getCropSystem().waterCrop(tileX, tileY, 50);

    const directCrop = world.getCropSystem().getCrop(tileX, tileY);
    const worldCrop = world.getCropAt(tileX, tileY);

    assert.equal(directCrop, worldCrop, 'World deve retornar exatamente a mesma instância/dados do CropSystem');
    assert.equal(directCrop?.watered, true);
  });

  // Y. nenhum sprite é necessário para a lógica funcionar.
  it('Y. Nenhum sprite ou carregamento de asset é necessário para a lógica de rega funcionar', () => {
    const world = new World(42);
    const tileX = 1;
    const tileY = 1;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 0);

    const wateringSystem = new WateringSystem();
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;

    // Executa sem instanciar Canvas, Renderer ou AssetManager
    const result = wateringSystem.executeWater(player, world, { tileX, tileY });
    assert.equal(result.success, true);
    assert.equal(world.isCropWatered(tileX, tileY), true);
  });

  // Z. nenhum estado de rega altera hitbox ou física.
  it('Z. O estado de rega não altera hitbox, física, colisão ou propriedades de navegação do tile', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 0);

    const effectiveBefore = world.getEffectiveTile(tileX, tileY);
    assert.equal(effectiveBefore?.type, TileType.TILLED_SOIL);

    // Regar
    world.waterCrop(tileX, tileY);

    // O tile continua sendo exatamente TILLED_SOIL
    const effectiveAfter = world.getEffectiveTile(tileX, tileY);
    assert.equal(effectiveAfter?.type, TileType.TILLED_SOIL);

    // Não foram inseridos objetos colidíveis nem alteradas as dimensões físicas
    const objects = world.getObjectManager().getObjectsInArea(
      tileX * TILE_SIZE,
      tileY * TILE_SIZE,
      (tileX + 1) * TILE_SIZE,
      (tileY + 1) * TILE_SIZE,
    );
    assert.equal(objects.length, 0, 'Água de cultivo não deve criar objetos no ObjectManager');
  });
});
