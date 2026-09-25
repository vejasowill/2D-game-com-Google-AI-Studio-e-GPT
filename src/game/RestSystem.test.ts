import assert from 'node:assert';
import {
  DEFAULT_AXE_ENERGY_COST,
  DEFAULT_HOE_ENERGY_COST,
  DEFAULT_WATERING_CAN_ENERGY_COST,
  PLAYER_SIZE,
} from './constants.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { createItemStack } from './ItemStack.ts';
import { Input } from './Input.ts';
import { Biome } from './Biome.ts';
import { TileType } from './types.ts';
import { CropRegistry } from './CropRegistry.ts';
import { RestSystem } from './RestSystem.ts';
import { isRestTarget, RestContext, RestDefinition, RestResult, RestTarget } from './RestTarget.ts';
import { createObjectLifecycle, TemporaryWorldObject } from './TemporaryWorldObject.ts';

console.log('--- Iniciando Suíte Completa de Testes de Integração de Energia e Descanso (RestSystem) ---');

// Inicialização dos registros
ItemRegistry.ensureInitialized();
ToolRegistry.reset();
ToolRegistry.ensureInitialized();
CropRegistry.ensureInitialized();

// =========================================================================
// 1. Custos declarativos de energia nas ferramentas canônicas
// =========================================================================
{
  const axeTool = ToolRegistry.getByItemId('axe');
  assert(axeTool !== undefined, '1.1: Machado deve estar registrado no ToolRegistry');
  assert.strictEqual(axeTool?.energyCost, DEFAULT_AXE_ENERGY_COST, '1.2: Machado deve ter custo de 10 energia');
  assert.strictEqual(axeTool?.energyCost, 10, '1.3: Custo técnico de 10 energia para machado');

  const hoeTool = ToolRegistry.getByItemId('hoe');
  assert(hoeTool !== undefined, '1.4: Enxada deve estar registrada no ToolRegistry');
  assert.strictEqual(hoeTool?.energyCost, DEFAULT_HOE_ENERGY_COST, '1.5: Enxada deve ter custo de 2 energia');
  assert.strictEqual(hoeTool?.energyCost, 2, '1.6: Custo técnico de 2 energia para enxada');

  const wateringCanTool = ToolRegistry.getByItemId('watering_can');
  assert(wateringCanTool !== undefined, '1.7: Regador deve estar registrado no ToolRegistry');
  assert.strictEqual(wateringCanTool?.energyCost, DEFAULT_WATERING_CAN_ENERGY_COST, '1.8: Regador deve ter custo de 2 energia');
  assert.strictEqual(wateringCanTool?.energyCost, 2, '1.9: Custo técnico de 2 energia para regador');

  // Definições no ItemRegistry
  const axeItem = ItemRegistry.get('axe');
  assert.strictEqual(axeItem?.useDefinition?.energyCost, 10, '1.10: ItemRegistry.axe possui custo 10 declarativo');

  const hoeItem = ItemRegistry.get('hoe');
  assert.strictEqual(hoeItem?.useDefinition?.energyCost, 2, '1.11: ItemRegistry.hoe possui custo 2 declarativo');

  const wateringCanItem = ItemRegistry.get('watering_can');
  assert.strictEqual(wateringCanItem?.useDefinition?.energyCost, 2, '1.12: ItemRegistry.watering_can possui custo 2 declarativo');

  console.log('✓ 1. Custos declarativos de energia nas ferramentas canônicas validados');
}

// =========================================================================
// 2. Atomicidade e feedback do Machado (Axe)
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem();

  // Adicionar árvore à frente do jogador (virado para DOWN, worldY maior)
  const tree = new NaturalTreeObject('test_tree_1', { worldX: 100, worldY: 124 }, 24, 24, Biome.FOREST, 0, 0, 0);
  world.getObjectManager().addObject(tree);

  // Equipar machado
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  // Cenário 2A: Energia suficiente (100) -> sucesso -> consome exatamente 10 energia
  const initialEnergy = player.getEnergy().getCurrent();
  assert.strictEqual(initialEnergy, 100, '2A.1: Jogador inicia com 100 de energia');

  const resultSuccess = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultSuccess.success, true, '2A.2: Golpe de machado executado com sucesso');
  assert.strictEqual(player.getEnergy().getCurrent(), 90, '2A.3: Exatamente 10 de energia consumidos');
  assert.strictEqual(resultSuccess.energyConsumed, 10, '2A.4: Resultado indica 10 consumidos');

  // Cenário 2B: Energia insuficiente (definir para 8, machado requer 10)
  itemUseSystem.resetCooldown();
  player.getEnergy().setCurrent(8);
  const resultBlocked = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultBlocked.success, false, '2B.1: Ação bloqueada por energia insuficiente');
  assert.strictEqual(resultBlocked.code, 'insufficient_energy', '2B.2: Código é insufficient_energy');
  assert.strictEqual(resultBlocked.message, 'Sem energia', '2B.3: Mensagem é "Sem energia"');
  assert.strictEqual(itemUseSystem.getActiveFeedbackMessage(), 'Sem energia', '2B.4: Feedback textual exibe "Sem energia"');
  assert.strictEqual(player.getEnergy().getCurrent(), 8, '2B.5: Energia permanece inalterada em 8 (zero consumo)');
  assert.strictEqual(itemUseSystem.getRemainingCooldown(), 0, '2B.6: Nenhum cooldown aplicado por falha de energia');

  // Cenário 2C: Machado sem alvo (árvore removida) -> falha por no_target -> zero energia consumida
  itemUseSystem.resetCooldown();
  player.getEnergy().setCurrent(100);
  world.getObjectManager().removeObject('test_tree_1');
  const resultNoTarget = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultNoTarget.success, false, '2C.1: Falha por no_target');
  assert.strictEqual(resultNoTarget.code, 'no_target', '2C.2: Código é no_target');
  assert.strictEqual(player.getEnergy().getCurrent(), 100, '2C.3: Nenhuma energia consumida em falha sem alvo');
  assert.strictEqual(itemUseSystem.getRemainingCooldown(), 0, '2C.4: Nenhum cooldown aplicado');

  console.log('✓ 2. Atomicidade e feedback do Machado (Axe) validados');
}

// =========================================================================
// 3. Atomicidade e feedback da Enxada (Hoe)
// =========================================================================
{
  const world = new World();
  const tileX = 2;
  const tileY = 2;
  const player = new Player({ worldX: tileX * 32 - 10, worldY: tileY * 32 });
  player.direction = PlayerDirection.RIGHT;
  const itemUseSystem = new ItemUseSystem();

  player.inventory.addItemStack(createItemStack('hoe', 1));
  player.hotbar.setSelectedSlot(0);

  // Cenário 3A: Solo com grama -> arar -> gasta exatamente 2 de energia -> vira TILLED_SOIL
  assert.strictEqual(player.getEnergy().getCurrent(), 100, '3A.1: Energia inicial 100');
  const resultHoe = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultHoe.success, true, '3A.2: Arar solo com sucesso');
  assert.strictEqual(player.getEnergy().getCurrent(), 98, '3A.3: Exatamente 2 de energia consumidos');
  assert.strictEqual(resultHoe.energyConsumed, 2, '3A.4: Resultado indica 2 consumidos');
  assert.strictEqual(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL, '3A.5: Solo virou TILLED_SOIL');

  // Cenário 3B: Tentar arar novamente o mesmo solo já arado -> ação rejeitada -> zero energia consumida
  itemUseSystem.resetCooldown();
  const prevEnergy = player.getEnergy().getCurrent();
  const resultAlreadyTilled = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultAlreadyTilled.success, false, '3B.1: Falha ao tentar arar solo já preparado');
  assert.strictEqual(player.getEnergy().getCurrent(), prevEnergy, '3B.2: Energia permanece inalterada');

  // Cenário 3C: Com energia insuficiente (1 de energia para ação de custo 2)
  itemUseSystem.resetCooldown();
  player.getEnergy().setCurrent(1);
  const targetTile2X = 4;
  const targetTile2Y = 2;
  player.position = { worldX: targetTile2X * 32 - 10, worldY: targetTile2Y * 32 };
  const resultNoEnergy = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultNoEnergy.success, false, '3C.1: Bloqueado por falta de energia');
  assert.strictEqual(resultNoEnergy.code, 'insufficient_energy', '3C.2: Código insufficient_energy');
  assert.strictEqual(resultNoEnergy.message, 'Sem energia', '3C.3: Mensagem "Sem energia"');
  assert.strictEqual(itemUseSystem.getActiveFeedbackMessage(), 'Sem energia', '3C.4: Feedback textual exibe "Sem energia"');
  assert.strictEqual(player.getEnergy().getCurrent(), 1, '3C.5: Energia permanece exatamente 1');
  assert.notStrictEqual(world.getEffectiveTile(targetTile2X, targetTile2Y)?.type, TileType.TILLED_SOIL, '3C.6: Terreno não sofreu mutação');

  console.log('✓ 3. Atomicidade e feedback da Enxada (Hoe) validados');
}

// =========================================================================
// 4. Atomicidade e feedback do Regador (Watering Can)
// =========================================================================
{
  const world = new World();
  const cropTileX = 3;
  const cropTileY = 3;
  const player = new Player({ worldX: cropTileX * 32 - 10, worldY: cropTileY * 32 });
  player.direction = PlayerDirection.RIGHT;
  const itemUseSystem = new ItemUseSystem();

  // Preparar solo e plantar um nabo em cropTileX, cropTileY
  world.getTileModificationRegistry().registerModification({
    tileX: cropTileX,
    tileY: cropTileY,
    type: TileType.TILLED_SOIL,
  });
  world.getCropSystem().plantCrop(cropTileX, cropTileY, 'turnip', world.getTime());

  player.inventory.addItemStack(createItemStack('watering_can', 1));
  player.hotbar.setSelectedSlot(0);

  // Cenário 4A: Regar cultura com energia suficiente -> sucesso -> consome 2 de energia
  assert.strictEqual(world.isCropWatered(cropTileX, cropTileY), false, '4A.1: Cultura não regada inicialmente');
  const resultWater = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultWater.success, true, '4A.2: Rega executada com sucesso');
  assert.strictEqual(resultWater.energyConsumed, 2, '4A.3: Custo de 2 energia informado');
  assert.strictEqual(player.getEnergy().getCurrent(), 98, '4A.4: Saldo de energia é 98');
  assert.strictEqual(world.isCropWatered(cropTileX, cropTileY), true, '4A.5: Cultura agora está regada');

  // Cenário 4B: Energia insuficiente (0 de energia)
  itemUseSystem.resetCooldown();
  player.getEnergy().setCurrent(0);
  const crop2TileX = 5;
  const crop2TileY = 3;
  world.getTileModificationRegistry().registerModification({
    tileX: crop2TileX,
    tileY: crop2TileY,
    type: TileType.TILLED_SOIL,
  });
  world.getCropSystem().plantCrop(crop2TileX, crop2TileY, 'turnip', world.getTime());
  player.position = { worldX: crop2TileX * 32 - 10, worldY: crop2TileY * 32 };

  const resultWaterNoEnergy = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultWaterNoEnergy.success, false, '4B.1: Falha por falta de energia');
  assert.strictEqual(resultWaterNoEnergy.code, 'insufficient_energy', '4B.2: Código insufficient_energy');
  assert.strictEqual(resultWaterNoEnergy.message, 'Sem energia', '4B.3: Mensagem "Sem energia"');
  assert.strictEqual(itemUseSystem.getActiveFeedbackMessage(), 'Sem energia', '4B.4: Feedback textual exibe "Sem energia"');
  assert.strictEqual(player.getEnergy().getCurrent(), 0, '4B.5: Energia permanece 0');
  assert.strictEqual(world.isCropWatered(crop2TileX, crop2TileY), false, '4B.6: Cultura permanece seca');

  // Cenário 4C: Regador em tile vazio sem cultura -> falha por no_crop -> zero energia consumida
  itemUseSystem.resetCooldown();
  player.getEnergy().setCurrent(100);
  player.position = { worldX: 15 * 32 - 10, worldY: 15 * 32 }; // Célula vazia sem cultura
  const resultNoCrop = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(resultNoCrop.success, false, '4C.1: Falha ao regar sem cultura');
  assert.strictEqual(player.getEnergy().getCurrent(), 100, '4C.2: Nenhuma energia consumida');

  console.log('✓ 4. Atomicidade e feedback do Regador (Watering Can) validados');
}

// =========================================================================
// 5. Paridade entre Teclado e MobileControls (mesmo pipeline 'use_item')
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 20 * 32, worldY: 20 * 32 });
  const itemUseSystem = new ItemUseSystem();
  const input = new Input();

  // Adicionar árvore para testar machado via input discreto
  const tree = new NaturalTreeObject('tree_mobile_test', { worldX: 20 * 32, worldY: 20 * 32 + 24 }, 24, 24, Biome.FOREST, 0, 0, 0);
  world.getObjectManager().addObject(tree);

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  // Simular toque no botão touch mobile: triggerActionDown('use_item')
  input.triggerActionDown('use_item');
  assert.strictEqual(input.isActionJustPressed('use_item'), true, '5.1: MobileControls dispara ação use_item');

  const updateResult = itemUseSystem.update(player, world, input, 0.016);
  assert(updateResult !== null, '5.2: ItemUseSystem processou a ação disparada pelo mobile');
  assert.strictEqual(updateResult.success, true, '5.3: Ação executada com sucesso via mobile');
  assert.strictEqual(player.getEnergy().getCurrent(), 90, '5.4: 10 de energia consumidos via mobile');

  // Próximo frame: isActionJustPressed é falso, não consome energia repetidamente
  input.clearFrameState();
  const secondUpdate = itemUseSystem.update(player, world, input, 0.016);
  assert.strictEqual(secondUpdate, null, '5.5: Não repete execução sem novo toque/pressão');
  assert.strictEqual(player.getEnergy().getCurrent(), 90, '5.6: Saldo de energia estável');

  input.destroy();
  console.log('✓ 5. Paridade entre Teclado e MobileControls validada');
}

// =========================================================================
// 6. Contrato genérico de descanso (RestTarget) e RestSystem
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const restSystem = new RestSystem();

  // Reduzir energia do jogador para 25
  player.getEnergy().setCurrent(25);
  assert.strictEqual(player.getEnergy().getCurrent(), 25, '6.1: Energia reduzida para 25');

  // Criar um RestTarget genérico (sem acoplamento a Bed)
  let onRestCompleteCalled = false;
  const genericRestTarget: RestTarget = {
    canRest(_ctx: RestContext): boolean {
      return true;
    },
    getRestDefinition(_ctx?: RestContext): RestDefinition {
      return {
        label: 'Descanso no Acampamento',
        advanceToNextDay: true,
        energyRestoreMode: 'full',
      };
    },
    onRestComplete(result: RestResult, _ctx: RestContext): void {
      onRestCompleteCalled = true;
      assert.strictEqual(result.success, true, '6.2: RestResult indica sucesso no callback');
    },
  };

  assert.strictEqual(isRestTarget(genericRestTarget), true, '6.3: isRestTarget identifica contrato');

  const initialDay = world.getTimeSystem().getDay();
  assert.strictEqual(initialDay, 1, '6.4: Dia inicial é 1');

  // Executar descanso
  const restResult = restSystem.rest({
    player,
    world,
    target: genericRestTarget,
  });

  assert.strictEqual(restResult.success, true, '6.5: Descanso executado com sucesso');
  assert.strictEqual(restResult.code, 'REST_SUCCESS', '6.6: Código REST_SUCCESS');
  assert.strictEqual(restResult.previousEnergy, 25, '6.7: Energia anterior registrada como 25');
  assert.strictEqual(restResult.restoredEnergy, 75, '6.8: Exatamente 75 restaurados até o máximo');
  assert.strictEqual(restResult.currentEnergy, 100, '6.9: Saldo de energia é 100');
  assert.strictEqual(player.getEnergy().getCurrent(), 100, '6.10: Player possui 100 de energia');
  assert.strictEqual(restResult.previousDay, 1, '6.11: Dia anterior era 1');
  assert.strictEqual(restResult.currentDay, 2, '6.12: Dia atual é 2');
  assert.strictEqual(world.getTimeSystem().getDay(), 2, '6.13: TimeSystem avançou para o dia 2');
  assert.strictEqual(world.getTimeSystem().getTimeOfDaySeconds(), 0, '6.14: Início exato do dia (0 segundos decorridos no dia)');
  assert.strictEqual(onRestCompleteCalled, true, '6.15: Callback onRestComplete do alvo foi invocado');

  console.log('✓ 6. Contrato genérico de descanso (RestTarget) e RestSystem validados');
}

// =========================================================================
// 7. Disparo correto de eventos de transição de dia (DayTransitionListener)
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const restSystem = new RestSystem();

  let listenerFiredCount = 0;
  let eventPreviousDay = 0;
  let eventCurrentDay = 0;

  world.getTimeSystem().addDayTransitionListener((event) => {
    listenerFiredCount++;
    eventPreviousDay = event.previousDay;
    eventCurrentDay = event.currentDay;
  });

  // Avançar um pouco o dia atual (ex: 300 segundos decorridos)
  world.advanceTime(300);
  assert.strictEqual(listenerFiredCount, 0, '7.1: Nenhum evento disparado durante o mesmo dia');

  // Descansar para passar para o próximo dia
  player.getEnergy().setCurrent(10);
  const result = restSystem.rest({ player, world });

  assert.strictEqual(result.success, true, '7.2: Descanso executado');
  assert.strictEqual(listenerFiredCount, 1, '7.3: Evento de transição de dia disparado exatamente 1 vez');
  assert.strictEqual(eventPreviousDay, 1, '7.4: Evento reporta dia anterior 1');
  assert.strictEqual(eventCurrentDay, 2, '7.5: Evento reporta dia atual 2');
  assert.strictEqual(player.getEnergy().getCurrent(), 100, '7.6: Energia restaurada completamente');

  console.log('✓ 7. Disparo correto de eventos de transição de dia validado');
}

// =========================================================================
// 8. Integridade agrícola e determinismo das culturas durante descanso
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const restSystem = new RestSystem();

  // Nabo: leva 4 dias completos (4 * 1200 = 4800s) para maturar quando regado
  world.getTileModificationRegistry().registerModification({
    tileX: 10,
    tileY: 10,
    type: TileType.TILLED_SOIL,
  });
  world.getCropSystem().plantCrop(10, 10, 'turnip', world.getTime());
  world.getCropSystem().waterCrop(10, 10, world.getTime());

  const initialStage = world.getCropGrowthStage(10, 10);
  assert.strictEqual(initialStage, 0, '8.1: Nabo recém-plantado no estágio 0');

  // 1º descanso -> dia 2
  player.getEnergy().setCurrent(10);
  restSystem.rest({ player, world });
  const stageDay2 = world.getCropGrowthStage(10, 10);
  assert(stageDay2 >= 1, '8.2: Cultura cresceu deterministicamente para estágio 1');
  assert.strictEqual(player.getEnergy().getCurrent(), 100, '8.3: Energia restaurada');

  // 2º descanso -> dia 3
  player.getEnergy().setCurrent(20);
  restSystem.rest({ player, world });
  const stageDay3 = world.getCropGrowthStage(10, 10);
  assert(stageDay3 >= 2, '8.4: Cultura progrediu para estágio 2');

  // Não materializou nenhum chunk indevido
  assert.strictEqual(world.getChunkManager().getLoadedChunkCount(), 0, '8.5: Nenhum chunk materializado no descanso');

  console.log('✓ 8. Integridade agrícola e determinismo das culturas no descanso validados');
}

// =========================================================================
// 9. Expiração determinística de objetos temporários (TTL) no descanso
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const restSystem = new RestSystem();

  // Criar um objeto temporário com TTL de 300 segundos (ex: drop de item)
  const tempDrop: TemporaryWorldObject = {
    id: 'temp_drop_sleep_test',
    type: 'item_drop',
    position: { worldX: 100, worldY: 100 },
    width: 16,
    height: 16,
    lifecycle: createObjectLifecycle(world.getTime(), 300),
  };

  world.getObjectManager().addObject(tempDrop);
  world.getTemporaryObjectSystem().register(tempDrop);
  assert.strictEqual(world.getTemporaryObjectSystem().isTracking('temp_drop_sleep_test'), true, '9.1: Objeto rastreado');

  // Ao descansar (avanço de ~1200 segundos), o drop de TTL 300 deve expirar determinísticamente
  restSystem.rest({ player, world });

  assert.strictEqual(world.getTemporaryObjectSystem().isTracking('temp_drop_sleep_test'), false, '9.2: Objeto expirou no heap');
  assert.strictEqual(world.getObjectManager().hasObject('temp_drop_sleep_test'), false, '9.3: Objeto foi removido do ObjectManager');

  console.log('✓ 9. Expiração determinística de objetos temporários no descanso validada');
}

// =========================================================================
// 10. Bloqueio quando RestTarget.canRest retorna false
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const restSystem = new RestSystem();

  player.getEnergy().setCurrent(40);
  const initialTime = world.getTime();

  const conditionalTarget: RestTarget = {
    canRest(_ctx: RestContext): boolean {
      return false; // Condição não atendida (ex: monstros por perto ou não é noite)
    },
    getRestDefinition(): RestDefinition {
      return { label: 'Cama' };
    },
  };

  const result = restSystem.rest({
    player,
    world,
    target: conditionalTarget,
  });

  assert.strictEqual(result.success, false, '10.1: Descanso bloqueado por canRest() === false');
  assert.strictEqual(result.code, 'CONDITIONS_NOT_MET', '10.2: Código CONDITIONS_NOT_MET');
  assert.strictEqual(player.getEnergy().getCurrent(), 40, '10.3: Energia permanece inalterada em 40');
  assert.strictEqual(world.getTime(), initialTime, '10.4: Tempo não avançou');

  console.log('✓ 10. Bloqueio quando RestTarget.canRest retorna false validado');
}

// =========================================================================
// 11. Modos customizados de recuperação de energia (amount e percentage)
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const restSystem = new RestSystem();

  // Modo 'amount': restaurar valor fixo de 30
  player.getEnergy().setCurrent(20);
  const resultAmount = restSystem.rest({ player, world }, {
    energyRestoreMode: 'amount',
    energyRestoreAmount: 30,
    advanceToNextDay: false,
  });
  assert.strictEqual(resultAmount.restoredEnergy, 30, '11.1: Restaura exatamente 30 de energia');
  assert.strictEqual(player.getEnergy().getCurrent(), 50, '11.2: Saldo de 50 de energia');
  assert.strictEqual(resultAmount.timeAdvancedSeconds, 0, '11.3: Tempo não avançou pois advanceToNextDay era falso');

  // Modo 'percentage': restaurar 50% do máximo (100 * 50% = 50)
  player.getEnergy().setCurrent(10);
  const resultPercentage = restSystem.rest({ player, world }, {
    energyRestoreMode: 'percentage',
    energyRestoreAmount: 50,
    advanceToNextDay: false,
  });
  assert.strictEqual(resultPercentage.restoredEnergy, 50, '11.4: Restaura 50% de 100');
  assert.strictEqual(player.getEnergy().getCurrent(), 60, '11.5: Saldo de 60 de energia');

  console.log('✓ 11. Modos customizados de recuperação de energia validados');
}

// =========================================================================
// 12. World.advanceToNextDay e TimeSystem.advanceToNextDay
// =========================================================================
{
  const world = new World();
  const timeSystem = world.getTimeSystem();

  // Dia 1, tempo 0
  assert.strictEqual(timeSystem.getDay(), 1, '12.1: Dia 1');
  assert.strictEqual(timeSystem.getTimeOfDaySeconds(), 0, '12.2: Tempo do dia 0');

  // Avança até 700 segundos no dia 1
  world.advanceTime(700);
  assert.strictEqual(timeSystem.getDay(), 1, '12.3: Ainda no dia 1');
  assert.strictEqual(timeSystem.getTimeOfDaySeconds(), 700, '12.4: 700 segundos decorridos');

  // advanceToNextDay deve avançar os 500 segundos restantes (1200 - 700)
  const advanced = world.advanceToNextDay();
  assert.strictEqual(advanced, 500, '12.5: Avançou 500 segundos exatos até o dia 2');
  assert.strictEqual(timeSystem.getDay(), 2, '12.6: Agora é dia 2');
  assert.strictEqual(timeSystem.getTimeOfDaySeconds(), 0, '12.7: Início exato do dia 2');

  console.log('✓ 12. World.advanceToNextDay e TimeSystem.advanceToNextDay validados');
}

console.log('======================================================');
console.log('Todos os 12 testes da Suíte RestSystem e Integração de Energia passaram com sucesso!');
console.log('======================================================');
