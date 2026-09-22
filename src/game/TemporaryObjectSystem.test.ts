import { strict as assert } from 'node:assert';
import { CHUNK_SIZE, DEFAULT_ITEM_DROP_TTL, TILE_SIZE } from './constants.ts';
import { ItemDropObject } from './ItemDropObject.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { LifecycleConfig } from './LifecycleConfig.ts';
import { Player } from './Player.ts';
import { TemporaryObjectSystem } from './TemporaryObjectSystem.ts';
import {
  createObjectLifecycle,
  isPermanentWorldObject,
  isTemporaryWorldObject,
  TemporaryWorldObject,
} from './TemporaryWorldObject.ts';
import { TestToggleObject } from './TestToggleObject.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';

function runTestSuite(): void {
  console.log('--- Iniciando Testes do Sistema de Ciclo de Vida (TemporaryObjectSystem) ---');

  ItemRegistry.ensureInitialized();

  // =========================================================================
  // Teste A: Objeto permanente nunca expira
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();

    const permanentBeacon = new TestToggleObject(
      'permanent_beacon_1',
      { worldX: 100, worldY: 100 },
      false,
    );

    assert.equal(isTemporaryWorldObject(permanentBeacon), false, 'Beacon não deve ser temporário');
    assert.equal(isPermanentWorldObject(permanentBeacon), true, 'Beacon deve ser identificado como permanente');

    world.getObjectManager().addObject(permanentBeacon);
    assert.equal(system.isTracking('permanent_beacon_1'), false, 'Objeto permanente não deve ser rastreado no lifecycle');

    // Avançar tempo gigantesco (10.000 segundos)
    world.update(10000);

    assert.equal(world.getObjectManager().hasObject('permanent_beacon_1'), true, 'Objeto permanente deve permanecer vivo no mundo');
    assert.equal(system.getTrackedCount(), 0, 'Sistema não deve reter referências de objetos permanentes');
    console.log('✓ Teste A passou: Objeto permanente nunca expira');
  }

  // =========================================================================
  // Teste B: Objeto temporário recebe TTL e configuração declarativa
  // =========================================================================
  {
    const customLifecycle = createObjectLifecycle(10, 60);
    assert.equal(customLifecycle.createdAt, 10, 'createdAt deve ser 10');
    assert.equal(customLifecycle.ttl, 60, 'ttl deve ser 60');
    assert.equal(customLifecycle.expiresAt, 70, 'expiresAt deve ser 10 + 60 = 70');

    // ItemDrop com valores padrão de configuração declarativa
    const defaultDrop = new ItemDropObject(
      'drop_default_ttl',
      { worldX: 200, worldY: 200 },
      'wood',
      5,
    );

    assert.equal(isTemporaryWorldObject(defaultDrop), true, 'ItemDrop deve ser temporário');
    assert.equal(defaultDrop.lifecycle.createdAt, 0, 'createdAt padrão deve ser 0');
    assert.equal(defaultDrop.lifecycle.ttl, DEFAULT_ITEM_DROP_TTL, 'TTL padrão deve ser 300s');
    assert.equal(defaultDrop.lifecycle.expiresAt, DEFAULT_ITEM_DROP_TTL, 'expiresAt deve ser 300s');

    // LifecycleConfig declarativo
    assert.equal(LifecycleConfig.getDefaultTtl('item_drop'), DEFAULT_ITEM_DROP_TTL, 'LifecycleConfig deve ter TTL de item_drop');
    console.log('✓ Teste B passou: Objeto temporário recebe TTL e configuração declarativa');
  }

  // =========================================================================
  // Teste C: Objeto ainda dentro do TTL permanece
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();

    const drop = new ItemDropObject(
      'drop_surviving',
      { worldX: 50, worldY: 50 },
      'wood',
      2,
      16,
      16,
      0,
      100, // TTL = 100s
    );

    world.getObjectManager().addObject(drop);
    assert.equal(system.isTracking('drop_surviving'), true, 'Drop deve ser registrado no lifecycle');

    // Avançar tempo até t = 99 (antes da expiração)
    world.update(99);

    assert.equal(world.getObjectManager().hasObject('drop_surviving'), true, 'Drop deve permanecer no mundo em t=99s');
    assert.equal(system.isTracking('drop_surviving'), true, 'Drop deve continuar sendo rastreado');
    const remaining = system.getRemainingTtl('drop_surviving');
    assert.ok(remaining !== null && Math.abs(remaining - 1) < 0.001, 'TTL restante deve ser ~1s');
    console.log('✓ Teste C passou: Objeto ainda dentro do TTL permanece');
  }

  // =========================================================================
  // Teste D: Objeto expirado é removido
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();

    const drop = new ItemDropObject(
      'drop_to_expire',
      { worldX: 50, worldY: 50 },
      'wood',
      2,
      16,
      16,
      0,
      50, // TTL = 50s
    );

    world.getObjectManager().addObject(drop);
    assert.equal(world.getObjectManager().hasObject('drop_to_expire'), true);

    // Atualizar além do TTL: de 0 para 50.1s
    world.update(50.1);

    assert.equal(world.getObjectManager().hasObject('drop_to_expire'), false, 'Drop expirado deve ser removido do WorldObjectManager');
    assert.equal(system.isTracking('drop_to_expire'), false, 'Drop expirado não deve mais ser rastreado no lifecycle');
    console.log('✓ Teste D passou: Objeto expirado é removido');
  }

  // =========================================================================
  // Teste E: Coleta antes da expiração remove também o registro do lifecycle
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();
    const player = new Player({ worldX: 100, worldY: 100 });

    const drop = new ItemDropObject(
      'drop_collect_early',
      { worldX: 100, worldY: 100 },
      'wood',
      4,
      16,
      16,
      0,
      200, // TTL = 200s
    );

    world.getObjectManager().addObject(drop);
    assert.equal(system.isTracking('drop_collect_early'), true);

    // Jogador coleta o drop completamente aos 10s
    world.update(10);
    const result = drop.interact({ player, world, object: drop });
    assert.equal(result.success, true);
    assert.ok(result.mutations && result.mutations.length > 0);

    // Aplicação da mutação de remoção por coleta
    for (const mutation of result.mutations!) {
      if (mutation.type === 'remove_object') {
        world.getObjectManager().removeObject(mutation.objectId);
      }
    }

    assert.equal(world.getObjectManager().hasObject('drop_collect_early'), false, 'Objeto removido do World');
    assert.equal(system.isTracking('drop_collect_early'), false, 'Registro de lifecycle deve ser removido após coleta');
    assert.equal(system.getTrackedCount(), 0, 'Tracked count deve ser 0');
    console.log('✓ Teste E passou: Coleta antes da expiração remove registro do lifecycle');
  }

  // =========================================================================
  // Teste F: Remoção externa antes da expiração não causa erro posteriormente (idempotência)
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();

    const drop = new ItemDropObject(
      'drop_external_removal',
      { worldX: 300, worldY: 300 },
      'wood',
      1,
      16,
      16,
      0,
      40,
    );

    world.getObjectManager().addObject(drop);

    // Remoção externa no t = 10s
    world.update(10);
    world.getObjectManager().removeObject('drop_external_removal');
    assert.equal(system.isTracking('drop_external_removal'), false);

    // Avançar o tempo até t = 100s (muito após os 40s originais)
    assert.doesNotThrow(() => {
      world.update(90);
    }, 'Update posterior do lifecycle não deve causar exceção para objetos previamente removidos');

    assert.equal(world.getObjectManager().hasObject('drop_external_removal'), false);
    console.log('✓ Teste F passou: Remoção externa antes da expiração não causa erro posteriormente');
  }

  // =========================================================================
  // Teste G: Coleta parcial NÃO reinicia TTL
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();
    const player = new Player({ worldX: 0, worldY: 0 });

    // Encher o inventário do player com slots ocupados, deixando espaço para apenas 1 item 'wood' adicional
    const def = ItemRegistry.get('wood')!;
    for (let slot = 0; slot < player.inventory.getSlotCount() - 1; slot++) {
      player.inventory.setSlot(slot, createItemStack('stone_dummy', 1, 1));
    }
    // No último slot, colocar quase cheio: maxStackSize - 1 (espaço para apenas 1 unidade de 'wood')
    player.inventory.setSlot(
      player.inventory.getSlotCount() - 1,
      createItemStack('wood', def.maxStackSize - 1, def.maxStackSize),
    );

    // Drop com 5 itens no t = 20s com TTL = 100s (expira aos 120s)
    world.setTime(20);
    const drop = new ItemDropObject(
      'drop_partial_collect',
      { worldX: 0, worldY: 0 },
      'wood',
      5,
      16,
      16,
      20,
      100,
    );
    world.getObjectManager().addObject(drop);

    // Avançar tempo até t = 50s (30s se passaram)
    world.update(30);

    // Interagir (coleta parcial: coleta 1, sobram 4)
    const result = drop.interact({ player, world, object: drop });
    assert.equal(result.success, true);
    assert.equal(drop.quantity, 4, 'Drop deve ter 4 unidades restantes');

    // Verificar que o lifecycle NÃO foi reiniciado nem alterado
    assert.equal(drop.lifecycle.createdAt, 20, 'createdAt original deve ser preservado');
    assert.equal(drop.lifecycle.ttl, 100, 'ttl original deve ser preservado');
    assert.equal(drop.lifecycle.expiresAt, 120, 'expiresAt original deve ser rigorosamente preservado (120s)');

    // Tempo restante deve ser exatamente 120 - 50 = 70s
    const remaining = system.getRemainingTtl('drop_partial_collect');
    assert.ok(remaining !== null && Math.abs(remaining - 70) < 0.001, 'TTL restante deve ser 70s');

    // Avançar até t = 119s: ainda deve existir
    world.update(69);
    assert.equal(world.getObjectManager().hasObject('drop_partial_collect'), true);

    // Avançar até t = 121s: deve expirar
    world.update(2);
    assert.equal(world.getObjectManager().hasObject('drop_partial_collect'), false, 'Drop deve expirar na data original');
    console.log('✓ Teste G passou: Coleta parcial NÃO reinicia TTL');
  }

  // =========================================================================
  // Teste H: TTL continua após descarregamento/recarregamento de chunk
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();
    const chunkManager = world.getChunkManager();

    // Criar drop no chunk (4, 4)
    const chunkPixelX = 4 * CHUNK_SIZE * TILE_SIZE + 32;
    const chunkPixelY = 4 * CHUNK_SIZE * TILE_SIZE + 32;
    chunkManager.getOrCreateChunk(4, 4);

    world.setTime(0);
    const drop = new ItemDropObject(
      'drop_chunk_streaming_1',
      { worldX: chunkPixelX, worldY: chunkPixelY },
      'wood',
      3,
      16,
      16,
      0,
      300, // TTL = 300s
    );
    world.getObjectManager().addObject(drop);

    // t = 100s: descarregar chunk (4, 4)
    world.update(100);
    chunkManager.unloadChunk(4, 4);
    assert.equal(chunkManager.hasChunk(4, 4), false, 'Chunk (4,4) descarregado');

    // O objeto continua preservado no WorldObjectManager com tempo decorrido
    assert.equal(world.getObjectManager().hasObject('drop_chunk_streaming_1'), true);

    // t = 200s: recarregar chunk (4, 4)
    world.update(100);
    chunkManager.getOrCreateChunk(4, 4);

    assert.equal(world.getObjectManager().hasObject('drop_chunk_streaming_1'), true, 'Drop continua presente no mundo');
    const remaining = system.getRemainingTtl('drop_chunk_streaming_1');
    assert.ok(remaining !== null && Math.abs(remaining - 100) < 0.001, 'Tempo restante deve ser 300 - 200 = 100s');
    console.log('✓ Teste H passou: TTL continua após descarregamento/recarregamento de chunk');
  }

  // =========================================================================
  // Teste I e Cenário Específico Obrigatório:
  // t=0 → cria drop
  // t=TTL/2 → descarrega chunk
  // t=TTL → chunk continua descarregado
  // t>TTL → recarrega chunk
  // Resultado esperado: o item não deve reaparecer
  // =========================================================================
  {
    const world = new World(999);
    const chunkManager = world.getChunkManager();
    const system = world.getTemporaryObjectSystem();

    const chunkX = 6;
    const chunkY = 6;
    const posX = chunkX * CHUNK_SIZE * TILE_SIZE + 40;
    const posY = chunkY * CHUNK_SIZE * TILE_SIZE + 40;

    chunkManager.getOrCreateChunk(chunkX, chunkY);

    // 1. t = 0: cria drop com TTL = 100
    world.setTime(0);
    const TTL = 100;
    const drop = new ItemDropObject(
      'drop_scenario_spec',
      { worldX: posX, worldY: posY },
      'wood',
      2,
      16,
      16,
      0,
      TTL,
    );
    world.getObjectManager().addObject(drop);
    assert.equal(world.getObjectManager().hasObject('drop_scenario_spec'), true);

    // 2. t = TTL / 2 (50s): descarrega chunk
    world.update(TTL / 2);
    chunkManager.unloadChunk(chunkX, chunkY);
    assert.equal(chunkManager.hasChunk(chunkX, chunkY), false, 'Chunk deve estar descarregado');

    // 3. t = TTL (100s): chunk continua descarregado
    world.update(TTL / 2);
    assert.equal(chunkManager.hasChunk(chunkX, chunkY), false, 'Chunk continua descarregado');

    // 4. t > TTL (110s): simulação avança além do TTL
    world.update(10);
    assert.equal(world.getObjectManager().hasObject('drop_scenario_spec'), false, 'Objeto expirou durante o descarregamento');
    assert.equal(system.isTracking('drop_scenario_spec'), false, 'Objeto não é mais rastreado');

    // 5. t > TTL: recarrega chunk
    chunkManager.getOrCreateChunk(chunkX, chunkY);
    assert.equal(chunkManager.hasChunk(chunkX, chunkY), true, 'Chunk recarregado');

    // Resultado esperado: o item NÃO deve reaparecer
    assert.equal(
      world.getObjectManager().hasObject('drop_scenario_spec'),
      false,
      'O item NÃO deve reaparecer após recarregar o chunk!',
    );
    console.log('✓ Teste I / Cenário Específico passou: Objeto expirado durante descarregamento não reaparece ao recarregar');
  }

  // =========================================================================
  // Teste J: Múltiplos objetos com tempos de expiração diferentes
  // =========================================================================
  {
    const world = new World(12345);
    world.setTime(0);

    const d1 = new ItemDropObject('d1', { worldX: 10, worldY: 10 }, 'wood', 1, 16, 16, 0, 10);
    const d2 = new ItemDropObject('d2', { worldX: 20, worldY: 20 }, 'wood', 1, 16, 16, 0, 20);
    const d3 = new ItemDropObject('d3', { worldX: 30, worldY: 30 }, 'wood', 1, 16, 16, 0, 30);
    const d4 = new ItemDropObject('d4', { worldX: 40, worldY: 40 }, 'wood', 1, 16, 16, 0, 50);

    world.getObjectManager().addObject(d4); // Ordem de inserção propositalmente não sequencial
    world.getObjectManager().addObject(d2);
    world.getObjectManager().addObject(d1);
    world.getObjectManager().addObject(d3);

    assert.equal(world.getTemporaryObjectSystem().getTrackedCount(), 4);

    // Em t = 15: apenas d1 expira
    world.update(15);
    assert.equal(world.getObjectManager().hasObject('d1'), false);
    assert.equal(world.getObjectManager().hasObject('d2'), true);
    assert.equal(world.getObjectManager().hasObject('d3'), true);
    assert.equal(world.getObjectManager().hasObject('d4'), true);

    // Em t = 25: d2 expira
    world.update(10);
    assert.equal(world.getObjectManager().hasObject('d2'), false);
    assert.equal(world.getObjectManager().hasObject('d3'), true);
    assert.equal(world.getObjectManager().hasObject('d4'), true);

    // Em t = 60: todos expiram
    world.update(35);
    assert.equal(world.getObjectManager().hasObject('d3'), false);
    assert.equal(world.getObjectManager().hasObject('d4'), false);
    assert.equal(world.getTemporaryObjectSystem().getTrackedCount(), 0);
    console.log('✓ Teste J passou: Múltiplos objetos com tempos de expiração diferentes ordenados por heap');
  }

  // =========================================================================
  // Teste K: Milhares de objetos não exigem varredura completa a cada frame (O(1) frame check)
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();
    world.setTime(0);

    const TOTAL_OBJECTS = 2000;
    for (let i = 0; i < TOTAL_OBJECTS; i++) {
      const drop = new ItemDropObject(
        `perf_drop_${i}`,
        { worldX: i * 2, worldY: i * 2 },
        'wood',
        1,
        16,
        16,
        0,
        1000 + i, // Expiram muito no futuro (t >= 1000)
      );
      world.getObjectManager().addObject(drop);
    }

    assert.equal(system.getTrackedCount(), TOTAL_OBJECTS);

    // Update de 1 frame de delta = 0.016s (t = 0.016s)
    world.update(0.016);

    // A raiz do min-heap foi verificada e como expiresAt (1000) > currentTime (0.016),
    // o algoritmo encerrou IMEDIATAMENTE inspecionando apenas 1 nó!
    const inspected = system.getLastInspectedCount();
    assert.equal(
      inspected,
      1,
      `Inspeções no frame devem ser exatamente 1 (raiz do min-heap), mas foram ${inspected}`,
    );
    assert.ok(
      inspected < TOTAL_OBJECTS,
      'Comprovado: Sistema NUNCA faz varredura completa O(N) sobre todos os objetos no frame',
    );
    console.log(`✓ Teste K passou: ${TOTAL_OBJECTS} objetos inspecionados com custo O(1) de 1 comparação por frame`);
  }

  // =========================================================================
  // Teste L: Nenhuma referência de objeto removido permanece no lifecycle
  // =========================================================================
  {
    const world = new World(12345);
    const system = world.getTemporaryObjectSystem();
    world.setTime(0);

    const drop = new ItemDropObject('leak_test_drop', { worldX: 0, worldY: 0 }, 'wood', 1, 16, 16, 0, 10);
    world.getObjectManager().addObject(drop);
    assert.equal(system.getTrackedCount(), 1);

    // Remove do mundo
    world.getObjectManager().removeObject('leak_test_drop');
    assert.equal(system.getTrackedCount(), 0, 'Nenhuma referência deve permanecer');
    assert.equal(system.isTracking('leak_test_drop'), false);
    assert.equal(system.getRemainingTtl('leak_test_drop'), null);
    console.log('✓ Teste L passou: Ausência de vazamento de referências no lifecycle');
  }

  // =========================================================================
  // Teste M: Coordenadas negativas continuam funcionando perfeitamente
  // =========================================================================
  {
    const world = new World(12345);
    world.setTime(0);

    const dropNeg = new ItemDropObject(
      'drop_negative_coord',
      { worldX: -1500, worldY: -3200 },
      'wood',
      3,
      16,
      16,
      0,
      25,
    );

    world.getObjectManager().addObject(dropNeg);
    assert.equal(world.getObjectManager().hasObject('drop_negative_coord'), true);

    world.update(20);
    assert.equal(world.getObjectManager().hasObject('drop_negative_coord'), true);

    world.update(10);
    assert.equal(world.getObjectManager().hasObject('drop_negative_coord'), false, 'Expira corretamente em coordenadas negativas');
    console.log('✓ Teste M passou: Coordenadas negativas continuam funcionando perfeitamente');
  }

  // =========================================================================
  // Teste N: Comportamento não materializa chunks desnecessariamente
  // =========================================================================
  {
    const world = new World(12345);
    const initialLoadedChunks = world.getLoadedChunkCount();

    // Criar objetos e atualizar o lifecycle
    const drop = new ItemDropObject('no_chunk_spawn_drop', { worldX: 10000, worldY: 10000 }, 'wood', 1, 16, 16, 0, 10);
    world.getObjectManager().addObject(drop);
    world.update(5);
    world.update(10);

    assert.equal(
      world.getLoadedChunkCount(),
      initialLoadedChunks,
      'Operações de ciclo de vida e tempo NUNCA devem instanciar chunks no ChunkManager',
    );
    console.log('✓ Teste N passou: Operações de lifecycle não materializam chunks desnecessariamente');
  }

  // =========================================================================
  // Teste O: Determinismo dos testes
  // =========================================================================
  {
    const runSimulation = () => {
      const w = new World(12345);
      w.setTime(0);
      const d = new ItemDropObject('deterministic_drop', { worldX: 100, worldY: 100 }, 'wood', 2, 16, 16, 0, 50);
      w.getObjectManager().addObject(d);

      const events: string[] = [];
      for (let t = 0; t <= 60; t += 10) {
        w.update(10);
        events.push(`t=${w.getTime()}:has=${w.getObjectManager().hasObject('deterministic_drop')}`);
      }
      return events.join(';');
    };

    const run1 = runSimulation();
    const run2 = runSimulation();
    assert.equal(run1, run2, 'Duas simulações com os mesmos passos devem produzir resultados 100% idênticos');
    console.log('✓ Teste O passou: Determinismo estrito do ciclo de vida sob controle de simulação');
  }

  // =========================================================================
  // Teste P: Nenhuma alteração de hitbox, física ou visual é causada pelo lifecycle
  // =========================================================================
  {
    const drop = new ItemDropObject(
      'contract_check_drop',
      { worldX: 64, worldY: 96 },
      'wood',
      5,
      20,
      24,
      0,
      300,
    );

    assert.equal(drop.width, 20, 'Largura da hitbox preservada');
    assert.equal(drop.height, 24, 'Altura da hitbox preservada');
    assert.equal(drop.position.worldX, 64, 'worldX preservado');
    assert.equal(drop.position.worldY, 96, 'worldY preservado');
    assert.equal(drop.type, 'item_drop', 'type preservado');
    assert.equal(drop.interaction.id, 'collect', 'interaction.id preservado');
    console.log('✓ Teste P passou: Hitbox, física e propriedades visuais desacopladas de lifecycle');
  }

  console.log('\n===================================================================');
  console.log('TODOS OS 16 TESTES (A até P) E CENÁRIO ESPECÍFICO PASSARAM COM SUCESSO!');
  console.log('===================================================================\n');
}

runTestSuite();
