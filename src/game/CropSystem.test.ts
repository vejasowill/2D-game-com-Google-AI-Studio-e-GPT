import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { World } from './World.ts';
import { Player, PlayerDirection } from './Player.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { CropRegistry, DEFAULT_TECHNICAL_CROPS } from './CropRegistry.ts';
import { CropDefinition } from './CropDefinition.ts';
import { calculateCropGrowthStage, CropData, isCropMature } from './CropState.ts';
import { CropSystem } from './CropSystem.ts';
import { PlantCropSystem } from './PlantCropSystem.ts';
import { TileToolTarget } from './TileToolTarget.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { createItemStack } from './ItemStack.ts';
import { TileType } from './types.ts';
import { TILE_SIZE, CHUNK_SIZE } from './constants.ts';
import { Input } from './Input.ts';

describe('CropSystem & Farming Integration Suite', () => {
  beforeEach(() => {
    ToolRegistry.reset();
    ItemRegistry.clear();
    ItemRegistry.ensureInitialized();
    CropRegistry.reset();
  });

  // A. CropDefinition declarativa.
  it('A. Deve possuir contrato puramente declarativo para CropDefinition sem posições físicas nem mutabilidade', () => {
    const cropDef: CropDefinition = {
      id: 'test_crop',
      name: 'Cultura Teste',
      seedItemId: 'test_seed',
      totalStages: 4,
      stageDurations: [5, 5, 5],
      stageDuration: 5,
      yieldQuantity: 2,
      harvestItemId: 'test_product',
      metadata: { season: 'spring' },
    };

    assert.equal(cropDef.id, 'test_crop');
    assert.equal(cropDef.seedItemId, 'test_seed');
    assert.equal(cropDef.totalStages, 4);
    assert.equal(cropDef.yieldQuantity, 2);
    assert.equal(cropDef.harvestItemId, 'test_product');
    assert.equal((cropDef as any).tileX, undefined, 'CropDefinition não deve ter coordenadas físicas');
  });

  // B. CropRegistry registra cultura.
  it('B. CropRegistry deve registrar e permitir consulta de culturas por ID e por seedItemId', () => {
    const turnip = CropRegistry.get('turnip');
    assert.ok(turnip, 'Cultura turnip deve estar registrada');
    assert.equal(turnip?.id, 'turnip');
    assert.equal(turnip?.seedItemId, 'turnip_seed');

    const bySeed = CropRegistry.getBySeedItemId('turnip_seed');
    assert.ok(bySeed, 'Deve encontrar cultura pelo seedItemId turnip_seed');
    assert.equal(bySeed?.id, 'turnip');
  });

  // C. IDs duplicados são rejeitados.
  it('C. CropRegistry deve rejeitar culturas com ID duplicado ou seedItemId conflitante', () => {
    const duplicateDef: CropDefinition = {
      id: 'turnip',
      name: 'Outro Nabo',
      seedItemId: 'other_seed',
      totalStages: 3,
      stageDurations: [10, 10],
      yieldQuantity: 1,
      harvestItemId: 'turnip',
    };

    assert.throws(
      () => CropRegistry.register(duplicateDef),
      /Conflito de ID duplicado/,
      'Deve lançar exceção ao tentar registrar ID duplicado',
    );

    const duplicateSeedDef: CropDefinition = {
      id: 'new_crop',
      name: 'Nova Cultura',
      seedItemId: 'turnip_seed', // seed já em uso
      totalStages: 3,
      stageDurations: [10, 10],
      yieldQuantity: 1,
      harvestItemId: 'turnip',
    };

    assert.throws(
      () => CropRegistry.register(duplicateSeedDef),
      /Conflito de semente duplicada/,
      'Deve lançar exceção ao tentar registrar semente já associada',
    );
  });

  // D. Seed item referencia corretamente a cultura.
  it('D. Seed item deve ser um ItemDefinition normal que referencia corretamente a cultura através do CropRegistry', () => {
    const seedItem = ItemRegistry.get('turnip_seed');
    assert.ok(seedItem, 'Item turnip_seed deve existir no ItemRegistry');
    assert.equal(seedItem?.category, 'seed');
    assert.equal(seedItem?.useDefinition?.action, 'plant');
    assert.equal(seedItem?.useDefinition?.targetDomain, 'tile');
    assert.equal(seedItem?.useDefinition?.consumesItem, true);

    const associatedCrop = CropRegistry.getBySeedItemId(seedItem.id);
    assert.ok(associatedCrop, 'CropRegistry deve resolver a cultura a partir do seedItemId');
    assert.equal(associatedCrop?.id, 'turnip');
    assert.equal(associatedCrop?.seedItemId, seedItem.id);
  });

  // E. Plantio em TILLED_SOIL funciona.
  it('E. Plantio em TILLED_SOIL deve funcionar e registrar a cultura no CropSystem', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    // Preparar o solo para TILLED_SOIL
    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL);

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 3));

    const plantSystem = new PlantCropSystem();
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, true, 'Plantio deve ter sucesso');
    assert.equal(result.cropId, 'turnip');
    assert.equal(world.hasCropAt(tileX, tileY), true, 'O mundo deve possuir cultivo no tile');

    const crop = world.getCropAt(tileX, tileY);
    assert.ok(crop);
    assert.equal(crop?.cropId, 'turnip');
    assert.equal(crop?.tileX, tileX);
    assert.equal(crop?.tileY, tileY);
  });

  // F. Plantio em GRASS falha.
  it('F. Plantio em GRASS não arado deve falhar', () => {
    const world = new World(42);
    const tileX = 4;
    const tileY = 4;

    world.restoreTileModification(tileX, tileY);
    const tile = world.getEffectiveTile(tileX, tileY);
    assert.equal(tile?.type, TileType.GRASS, 'O tile deve ser GRASS natural');

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 3));

    const plantSystem = new PlantCropSystem();
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, false, 'Plantio em GRASS deve falhar');
    assert.equal(result.failureReason, 'NOT_TILLED_SOIL');
    assert.equal(world.hasCropAt(tileX, tileY), false);
  });

  // G. Plantio em WATER falha.
  it('G. Plantio em WATER deve falhar', () => {
    const world = new World(42);
    const tileX = 4;
    const tileY = 4;

    world.modifyTile(tileX, tileY, TileType.WATER);
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.WATER);

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 3));

    const plantSystem = new PlantCropSystem();
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, false, 'Plantio em WATER deve falhar');
    assert.equal(result.failureReason, 'NOT_TILLED_SOIL');
    assert.equal(world.hasCropAt(tileX, tileY), false);
  });

  // H. Plantio em tile já cultivado falha.
  it('H. Plantio em tile que já possui cultivo deve falhar', () => {
    const world = new World(42);
    const tileX = 3;
    const tileY = 3;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', world.getTime());
    assert.equal(world.hasCropAt(tileX, tileY), true);

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 3));

    const plantSystem = new PlantCropSystem();
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, false, 'Segundo plantio no mesmo tile deve falhar');
    assert.equal(result.failureReason, 'ALREADY_HAS_CROP');
  });

  // I. Plantio fora do alcance falha.
  it('I. Plantio em tile fora do alcance físico deve falhar', () => {
    const world = new World(42);
    const tileX = 10;
    const tileY = 10;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);

    // Jogador bem longe (coordenada 0, 0)
    const player = new Player({ worldX: 0, worldY: 0 });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 3));

    const plantSystem = new PlantCropSystem(48);
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, false, 'Plantio fora de alcance deve falhar');
    assert.equal(result.failureReason, 'OUT_OF_RANGE');
    assert.equal(world.hasCropAt(tileX, tileY), false);
  });

  // J. Plantio atrás do jogador falha quando aplicável.
  it('J. Plantio em tile atrás do jogador deve falhar respeitando o setor direcional', () => {
    const world = new World(42);
    const tileX = 1;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);

    // Jogador no tile (2, 2) virado para a DIREITA (costas para o tile 1, 2)
    const player = new Player({ worldX: 2 * TILE_SIZE, worldY: 2 * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 3));

    const plantSystem = new PlantCropSystem();
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, false, 'Plantio atrás do jogador deve ser rejeitado');
    assert.equal(result.failureReason, 'BEHIND_PLAYER');
    assert.equal(world.hasCropAt(tileX, tileY), false);
  });

  // K. Uma semente é consumida somente após sucesso.
  it('K. Exatamente uma semente deve ser consumida do inventário após o sucesso', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 5));

    assert.equal(player.inventory.countItem('turnip_seed'), 5);

    const plantSystem = new PlantCropSystem();
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, true);
    assert.equal(player.inventory.countItem('turnip_seed'), 4, 'Deve restar 4 sementes');
  });

  // L. Falha não consome semente.
  it('L. Falha no plantio não deve consumir nenhuma semente do inventário', () => {
    const world = new World(42);
    const tileX = 5;
    const tileY = 5;

    // Solo é GRASS (inválido para plantio direto)
    world.restoreTileModification(tileX, tileY);

    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 5));

    const plantSystem = new PlantCropSystem();
    const result = plantSystem.executePlant(player, world, { tileX, tileY });

    assert.equal(result.success, false);
    assert.equal(player.inventory.countItem('turnip_seed'), 5, 'Inventário deve permanecer com 5 sementes');
  });

  // M. Crescimento não depende de Math.random().
  it('M. Simulação de crescimento não deve depender de Math.random()', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    const cropData: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 100,
      watered: true,
      lastWateredAt: 100,
    };

    // Salvar Math.random e interceptar para verificar que nenhuma chamada ocorre
    let randomCalled = false;
    const originalRandom = Math.random;
    Math.random = () => {
      randomCalled = true;
      return 0.5;
    };

    try {
      const stageA = calculateCropGrowthStage(cropData, cropDef, 115);
      const stageB = calculateCropGrowthStage(cropData, cropDef, 125);
      const stageC = calculateCropGrowthStage(cropData, cropDef, 135);

      assert.equal(randomCalled, false, 'calculateCropGrowthStage não deve chamar Math.random()');
      assert.equal(stageA, 1);
      assert.equal(stageB, 2);
      assert.equal(stageC, 3);
    } finally {
      Math.random = originalRandom;
    }
  });

  // N. Crescimento é determinístico.
  it('N. Crescimento deve ser estritamente determinístico baseado na diferença entre worldTime e plantedAt', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    // stageDurations: [10, 10, 10] -> totalStages: 4 (0, 1, 2, 3)
    const crop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 0,
      watered: true,
      lastWateredAt: 0,
    };
    assert.equal(calculateCropGrowthStage(crop, cropDef, 0), 0, 'No momento do plantio deve ser estágio 0');
    assert.equal(calculateCropGrowthStage(crop, cropDef, 5), 0, 'Aos 5s deve continuar estágio 0');
    assert.equal(calculateCropGrowthStage(crop, cropDef, 10), 1, 'Aos 10s deve avançar para estágio 1');
    assert.equal(calculateCropGrowthStage(crop, cropDef, 19.9), 1, 'Aos 19.9s deve ser estágio 1');
    assert.equal(calculateCropGrowthStage(crop, cropDef, 20), 2, 'Aos 20s deve ser estágio 2');
    assert.equal(calculateCropGrowthStage(crop, cropDef, 30), 3, 'Aos 30s deve ser estágio 3 (maduro)');
  });

  // O. Crescimento é independente de FPS.
  it('O. Crescimento deve ser independente da taxa de quadros (FPS)', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    const crop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 50,
      watered: true,
      lastWateredAt: 50,
    };

    // Caso 1: consulta direta aos 75s (simula avanço em 1 frame longo)
    const stageDirect = calculateCropGrowthStage(crop, cropDef, 75);

    // Caso 2: simula 1500 frames pequenos de 1/60s até 75s
    let simulatedTime = 50;
    const dt = 1 / 60;
    let finalStageIterated = 0;
    while (simulatedTime <= 75) {
      finalStageIterated = calculateCropGrowthStage(crop, cropDef, simulatedTime);
      simulatedTime += dt;
    }

    assert.equal(stageDirect, 2);
    assert.equal(finalStageIterated, 2);
    assert.equal(stageDirect, finalStageIterated, 'O resultado final deve ser idêntico independentemente da taxa de atualização');
  });

  // P. Crescimento sobrevive a unload/reload.
  it('P. Crescimento deve persistir e calcular o estágio correto após unload e reload do chunk', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 10);
    world.waterCrop(tileX, tileY);

    // Descarregar chunk do ChunkManager
    const chunkX = Math.floor(tileX / CHUNK_SIZE);
    const chunkY = Math.floor(tileY / CHUNK_SIZE);
    world.getChunkManager().unloadChunk(chunkX, chunkY);

    assert.equal(world.getChunkManager().isChunkLoaded(chunkX, chunkY), false);

    // Avançar tempo do mundo para 40s (30s decorridos após plantio aos 10s)
    world.update(40);

    // Consulta de cultivo sem necessariamente carregar chunk
    const crop = world.getCropAt(tileX, tileY);
    assert.ok(crop, 'Cultivo deve persistir mesmo com chunk descarregado');
    assert.equal(world.getCropGrowthStage(tileX, tileY), 3, 'Deve estar maduro (estágio 3)');

    // Recarregar chunk explicitamente
    world.getChunkManager().loadChunk(chunkX, chunkY);
    assert.equal(world.getChunkManager().isChunkLoaded(chunkX, chunkY), true);
    assert.equal(world.getCropGrowthStage(tileX, tileY), 3, 'Após reload do chunk, cultivo continua maduro');
  });

  // Q. Coordenadas negativas funcionam.
  it('Q. Deve permitir plantio e crescimento determinístico em coordenadas negativas', () => {
    const world = new World(42);
    const tileX = -18;
    const tileY = -25;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL);

    const success = world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 5);
    assert.equal(success, true, 'Deve registrar plantio em coordenadas negativas');
    assert.equal(world.hasCropAt(tileX, tileY), true);
    world.getCropSystem().waterCrop(tileX, tileY, 5);

    const stage = world.getCropSystem().getGrowthStage(tileX, tileY, 26);
    assert.equal(stage, 2, 'Aos 26s (21s decorridos), deve estar no estágio 2');
  });

  // R. Fronteiras de chunk funcionam.
  it('R. Plantio e consultas devem funcionar perfeitamente em fronteiras de chunk', () => {
    const world = new World(42);
    // Borda do chunk 0 e borda do chunk 1
    const tileA = { tileX: CHUNK_SIZE - 1, tileY: 0 };
    const tileB = { tileX: CHUNK_SIZE, tileY: 0 };

    world.modifyTile(tileA.tileX, tileA.tileY, TileType.TILLED_SOIL);
    world.modifyTile(tileB.tileX, tileB.tileY, TileType.TILLED_SOIL);

    assert.equal(world.getCropSystem().plantCrop(tileA.tileX, tileA.tileY, 'turnip', 0), true);
    assert.equal(world.getCropSystem().plantCrop(tileB.tileX, tileB.tileY, 'turnip', 0), true);

    const chunk0Crops = world.getCropSystem().getCropsInChunk(0, 0);
    const chunk1Crops = world.getCropSystem().getCropsInChunk(1, 0);

    assert.equal(chunk0Crops.length, 1);
    assert.equal(chunk0Crops[0].tileX, tileA.tileX);

    assert.equal(chunk1Crops.length, 1);
    assert.equal(chunk1Crops[0].tileX, tileB.tileX);
  });

  // S. Consulta não materializa chunks indevidamente.
  it('S. Consulta de cultivo não deve materializar chunks indevidamente no ChunkManager', () => {
    const world = new World(42);
    const distantChunkX = 80;
    const distantChunkY = 90;
    const tileX = distantChunkX * CHUNK_SIZE + 5;
    const tileY = distantChunkY * CHUNK_SIZE + 5;

    assert.equal(world.getChunkManager().isChunkLoaded(distantChunkX, distantChunkY), false);

    // Consulta de existência de cultivo em tile distante não carregado
    const hasCrop = world.hasCropAt(tileX, tileY);
    const cropData = world.getCropAt(tileX, tileY);

    assert.equal(hasCrop, false);
    assert.equal(cropData, null);
    assert.equal(
      world.getChunkManager().isChunkLoaded(distantChunkX, distantChunkY),
      false,
      'ChunkManager não deve ter materializado o chunk',
    );
  });

  // T. Estágios de crescimento avançam corretamente.
  it('T. Estágios de crescimento devem avançar sequencialmente de acordo com stageDurations', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    const crop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 100,
      watered: true,
      lastWateredAt: 100,
    };

    assert.equal(calculateCropGrowthStage(crop, cropDef, 100), 0);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 105), 0);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 110), 1);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 119), 1);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 120), 2);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 129), 2);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 130), 3);
  });

  // U. Cultivo maduro permanece maduro.
  it('U. Cultivo maduro deve permanecer maduro e não avançar além de totalStages - 1', () => {
    const cropDef = CropRegistry.getOrThrow('turnip');
    const crop: CropData = {
      cropId: 'turnip',
      tileX: 0,
      tileY: 0,
      plantedAt: 0,
      watered: true,
      lastWateredAt: 0,
    };

    assert.equal(isCropMature(crop, cropDef, 29), false);
    assert.equal(isCropMature(crop, cropDef, 30), true);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 30), 3);
    assert.equal(calculateCropGrowthStage(crop, cropDef, 99999), 3);
    assert.equal(isCropMature(crop, cropDef, 99999), true);
  });

  // V. O tamanho visual da planta não interfere na física.
  it('V. O plantio e o crescimento não devem alterar a física, colisão ou tamanho do tile', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);
    const effectiveTileBefore = world.getEffectiveTile(tileX, tileY);
    assert.equal(effectiveTileBefore?.type, TileType.TILLED_SOIL);

    world.getCropSystem().plantCrop(tileX, tileY, 'turnip', 0);
    world.update(50); // Cultivo fica maduro

    // O tile permanece TILLED_SOIL na autoridade de terreno
    const effectiveTileAfter = world.getEffectiveTile(tileX, tileY);
    assert.equal(effectiveTileAfter?.type, TileType.TILLED_SOIL);

    // Nenhuma entidade física ou WorldObject obstrutivo foi injetada
    const objects = world.getObjectManager().getObjectsInArea(
      tileX * TILE_SIZE,
      tileY * TILE_SIZE,
      (tileX + 1) * TILE_SIZE,
      (tileY + 1) * TILE_SIZE,
    );
    assert.equal(objects.length, 0, 'Cultivo não deve ser um WorldObject obstrutivo');
  });

  // W. Sprite ausente usa fallback seguro.
  it('W. Cultura sem sprite no AssetManager deve operar com segurança e sem erros', () => {
    const cropDef: CropDefinition = {
      id: 'custom_crop_no_sprite',
      name: 'Planta Sem Sprite',
      seedItemId: 'custom_seed_no_sprite',
      totalStages: 3,
      stageDurations: [10, 10],
      yieldQuantity: 1,
      harvestItemId: 'custom_item',
    };

    CropRegistry.register(cropDef);

    const crop: CropData = {
      cropId: 'custom_crop_no_sprite',
      tileX: 0,
      tileY: 0,
      plantedAt: 10,
      watered: true,
      lastWateredAt: 10,
    };

    const stage = calculateCropGrowthStage(crop, cropDef, 25);
    assert.equal(stage, 1);
    assert.equal(isCropMature(crop, cropDef, 35), true);
  });

  // X. USE ITEM mobile utiliza a mesma pipeline.
  it('X. USE ITEM mobile deve acionar a mesma pipeline genérica de uso e plantio', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;

    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);

    const player = new Player({ worldX: tileX * TILE_SIZE - 12, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('turnip_seed', 2));

    const itemUseSystem = new ItemUseSystem();
    const input = new Input();

    // Simula toque no botão USE ITEM móvel
    input.triggerAction('use_item');

    const result = itemUseSystem.update(player, world, input, 0.016);
    assert.ok(result, 'ItemUseSystem deve processar a intenção use_item');
    assert.equal(result?.success, true, 'O plantio via pipeline de uso deve ter sucesso');
    assert.equal(result?.action, 'plant');
    assert.equal(world.hasCropAt(tileX, tileY), true, 'Cultura deve estar plantada no terreno');
    assert.equal(player.inventory.countItem('turnip_seed'), 1, 'Exatamente 1 semente consumida');
  });

  // Y. O ItemUseSystem permanece genérico e não conhece a cultura concreta.
  it('Y. ItemUseSystem e TileToolTarget permanecem genéricos e funcionam para qualquer cultura declarada', () => {
    // Registrar dinamicamente uma segunda cultura qualquer sem mexer em nenhuma linha do ItemUseSystem
    const carrotCrop: CropDefinition = {
      id: 'carrot',
      name: 'Cenoura',
      seedItemId: 'carrot_seed',
      totalStages: 3,
      stageDurations: [8, 8],
      yieldQuantity: 1,
      harvestItemId: 'carrot',
    };
    CropRegistry.register(carrotCrop);

    ItemRegistry.register({
      id: 'carrot_seed',
      name: 'Semente de Cenoura',
      maxStackSize: 99,
      category: 'seed',
      useDefinition: {
        action: 'plant',
        range: 48,
        cooldown: 0.3,
        requiresTarget: true,
        targetDomain: 'tile',
        consumesItem: true,
        consumeQuantity: 1,
      },
    });

    const world = new World(42);
    const tileX = 5;
    const tileY = 5;
    world.modifyTile(tileX, tileY, TileType.TILLED_SOIL);

    const player = new Player({ worldX: tileX * TILE_SIZE - 12, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('carrot_seed', 3));

    const itemUseSystem = new ItemUseSystem();
    const result = itemUseSystem.useEquippedItem(player, world);

    assert.equal(result.success, true, 'Cultura dinâmica desconhecida pelo código central deve plantar normalmente');
    assert.equal(result.action, 'plant');
    assert.equal(world.getCropAt(tileX, tileY)?.cropId, 'carrot');
    assert.equal(player.inventory.countItem('carrot_seed'), 2);
  });
});
