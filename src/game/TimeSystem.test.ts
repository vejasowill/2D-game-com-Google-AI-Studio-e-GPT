import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TimeSystem } from './TimeSystem.ts';
import { calculateGameTime, DEFAULT_DAY_LENGTH_SECONDS } from './GameTime.ts';
import { World } from './World.ts';
import { Player, PlayerDirection } from './Player.ts';
import { CropRegistry } from './CropRegistry.ts';
import { CropSystem } from './CropSystem.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { SoilRegistry } from './SoilState.ts';
import { HarvestSystem } from './HarvestSystem.ts';
import { PlantCropSystem } from './PlantCropSystem.ts';
import { createItemStack } from './ItemStack.ts';
import { TileType } from './types.ts';
import { TILE_SIZE, CHUNK_SIZE } from './constants.ts';

describe('TimeSystem & World Temporal Authority Suite', () => {
  beforeEach(() => {
    ToolRegistry.reset();
    SoilRegistry.reset();
    ItemRegistry.clear();
    ItemRegistry.ensureInitialized();
    CropRegistry.reset();
  });

  // A. Estado inicial determinístico
  it('A. Estado inicial determinístico deve possuir valores padrão consistentes', () => {
    const ts = new TimeSystem();

    assert.equal(ts.getTotalElapsedSeconds(), 0, 'Tempo inicial deve ser 0');
    assert.equal(ts.getDay(), 1, 'Dia inicial deve ser 1');
    assert.equal(ts.getTimeOfDaySeconds(), 0, 'Horário inicial dentro do dia deve ser 0');
    assert.equal(ts.getDayLengthSeconds(), DEFAULT_DAY_LENGTH_SECONDS, 'Duração do dia deve ser a padrão');
    assert.equal(ts.getDayProgress(), 0, 'Progresso do dia deve iniciar em 0');
    assert.equal(ts.isPaused(), false, 'Não deve iniciar pausado por padrão');
    assert.equal(ts.getTimeScale(), 1.0, 'Escala padrão deve ser 1.0');

    const gameTime = ts.getTime();
    assert.equal(gameTime.totalElapsedSeconds, 0);
    assert.equal(gameTime.day, 1);
    assert.equal(gameTime.timeOfDaySeconds, 0);
    assert.equal(gameTime.dayLengthSeconds, DEFAULT_DAY_LENGTH_SECONDS);
    assert.equal(gameTime.isPaused, false);
    assert.equal(gameTime.timeScale, 1.0);
  });

  // B. Avanço por deltaTime
  it('B. Avanço temporal deve acumular estritamente por deltaTime', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });

    ts.update(1.5);
    assert.equal(ts.getTotalElapsedSeconds(), 1.5);

    ts.update(2.25);
    assert.equal(ts.getTotalElapsedSeconds(), 3.75);

    ts.update(0.25);
    assert.equal(ts.getTotalElapsedSeconds(), 4.0);
  });

  // C. Independência de FPS
  it('C. Independência de FPS: 60 passos de 1/60s produzem o mesmo tempo que 1 passo de 1.0s', () => {
    const tsA = new TimeSystem({ dayLengthSeconds: 1000 });
    const tsB = new TimeSystem({ dayLengthSeconds: 1000 });

    const step = 1 / 60;
    for (let i = 0; i < 60; i++) {
      tsA.update(step);
    }

    tsB.update(1.0);

    assert.ok(
      Math.abs(tsA.getTotalElapsedSeconds() - tsB.getTotalElapsedSeconds()) < 1e-9,
      '60 passos fracionários devem coincidir com 1 passo integral de 1.0s',
    );
    assert.equal(tsA.getDay(), tsB.getDay());
  });

  // D. Cálculo correto de day
  it('D. Cálculo correto de day baseado na duração configurada', () => {
    const dayLength = 600; // 10 minutos
    const ts = new TimeSystem({ dayLengthSeconds: dayLength });

    ts.setTime(0);
    assert.equal(ts.getDay(), 1, '0s é Dia 1');

    ts.setTime(599.9);
    assert.equal(ts.getDay(), 1, '599.9s ainda é Dia 1');

    ts.setTime(600);
    assert.equal(ts.getDay(), 2, '600s é o início do Dia 2');

    ts.setTime(1199.9);
    assert.equal(ts.getDay(), 2, '1199.9s é o final do Dia 2');

    ts.setTime(1200);
    assert.equal(ts.getDay(), 3, '1200s é o início do Dia 3');

    ts.setTime(6000);
    assert.equal(ts.getDay(), 11, '6000s é o Dia 11');
  });

  // E. Cálculo correto de timeOfDay
  it('E. Cálculo correto de timeOfDaySeconds e dayProgress', () => {
    const dayLength = 1000;
    const ts = new TimeSystem({ dayLengthSeconds: dayLength });

    ts.setTime(250);
    assert.equal(ts.getTimeOfDaySeconds(), 250);
    assert.equal(ts.getDayProgress(), 0.25);

    ts.setTime(1750);
    assert.equal(ts.getTimeOfDaySeconds(), 750);
    assert.equal(ts.getDayProgress(), 0.75);

    ts.setTime(2000);
    assert.equal(ts.getTimeOfDaySeconds(), 0);
    assert.equal(ts.getDayProgress(), 0);
  });

  // F. Mudança de dia
  it('F. Transição simples de dia dispara evento desacoplado', () => {
    const dayLength = 1000;
    const ts = new TimeSystem({ dayLengthSeconds: dayLength });

    const transitions: { previousDay: number; currentDay: number; daysElapsed: number }[] = [];
    ts.addDayTransitionListener((event) => {
      transitions.push({
        previousDay: event.previousDay,
        currentDay: event.currentDay,
        daysElapsed: event.daysElapsed,
      });
    });

    ts.setTime(995);
    assert.equal(transitions.length, 0);

    // Avança 10s cruzando a fronteira dos 1000s
    ts.update(10);
    assert.equal(ts.getDay(), 2);
    assert.equal(transitions.length, 1);
    assert.deepEqual(transitions[0], {
      previousDay: 1,
      currentDay: 2,
      daysElapsed: 1,
    });
  });

  // G. Múltiplas mudanças de dia
  it('G. Salto de múltiplos dias dispara evento com daysElapsed correto', () => {
    const dayLength = 1000;
    const ts = new TimeSystem({ dayLengthSeconds: dayLength });

    const transitions: { previousDay: number; currentDay: number; daysElapsed: number }[] = [];
    ts.addDayTransitionListener((event) => {
      transitions.push({
        previousDay: event.previousDay,
        currentDay: event.currentDay,
        daysElapsed: event.daysElapsed,
      });
    });

    // Avança 3500s (3 dias e meio)
    ts.advance(3500);
    assert.equal(ts.getDay(), 4);
    assert.equal(transitions.length, 1);
    assert.deepEqual(transitions[0], {
      previousDay: 1,
      currentDay: 4,
      daysElapsed: 3,
    });
  });

  // H. Ausência de regressão no crescimento das culturas
  it('H. Ausência de regressão no crescimento das culturas ao avançar tempo do mundo', () => {
    const world = new World(42);
    const cropSystem = world.getCropSystem();

    // Plantar nabo no tempo 0
    cropSystem.plantCrop(5, 5, 'turnip', world.getTime());
    cropSystem.waterCrop(5, 5, world.getTime());

    // No instante 0: estágio 0
    assert.equal(world.getCropGrowthStage(5, 5), 0);

    // Avançar 5 segundos via World.update (ainda estágio 0, pois dura 10s)
    world.update(5);
    assert.equal(world.getCropGrowthStage(5, 5), 0);

    // Avançar mais 5 segundos (total 10s = stage 1)
    world.update(5);
    assert.equal(world.getCropGrowthStage(5, 5), 1);

    // Avançar mais 10 segundos (total 20s = stage 2)
    world.update(10);
    assert.equal(world.getCropGrowthStage(5, 5), 2);

    // Avançar mais 10 segundos (total 30s = stage 3 / mature)
    world.update(10);
    assert.equal(world.getCropGrowthStage(5, 5), 3);
    assert.equal(cropSystem.isMature(5, 5, world.getTime()), true);
  });

  // I. Integração com CropSystem
  it('I. Integração com CropSystem utiliza fonte única de tempo do TimeSystem', () => {
    const world = new World(123);
    const timeSystem = world.getTimeSystem();

    assert.equal(world.getTime(), timeSystem.getTotalElapsedSeconds());

    timeSystem.advance(100);
    assert.equal(world.getTime(), 100);

    // Plantar no tempo 100
    world.applyTileModification(3, 3, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(3, 3, 'turnip', world.getTime());
    world.waterCrop(3, 3);

    const crop = world.getCropAt(3, 3);
    assert.ok(crop);
    assert.equal(crop.plantedAt, 100);
    assert.equal(crop.lastWateredAt, 100);

    // Avançar tempo via World.update (30s de crescimento para atingir estágio 3)
    world.update(30);
    assert.equal(world.getTime(), 130);
    assert.equal(world.getCropGrowthStage(3, 3), 3);
  });

  // J. Pausa / congelamento temporal
  it('J. Pausa congela o avanço no update mas preserva o estado', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });

    ts.update(50);
    assert.equal(ts.getTotalElapsedSeconds(), 50);

    ts.pause();
    assert.equal(ts.isPaused(), true);

    ts.update(100);
    assert.equal(ts.getTotalElapsedSeconds(), 50, 'Tempo não deve avançar enquanto pausado');
    assert.equal(ts.getLastDeltaSeconds(), 0);

    ts.resume();
    assert.equal(ts.isPaused(), false);

    ts.update(25);
    assert.equal(ts.getTotalElapsedSeconds(), 75, 'Tempo deve voltar a avançar após resume');
  });

  // K. Avanço controlado manualmente em testes (advance e setTime)
  it('K. Avanço manual controlado opera diretamente mesmo pausado', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });
    ts.pause();

    ts.advance(300);
    assert.equal(ts.getTotalElapsedSeconds(), 300);

    ts.setTime(850);
    assert.equal(ts.getTotalElapsedSeconds(), 850);
    assert.equal(ts.getDay(), 1);
  });

  // L. Ausência de uso de relógio real
  it('L. Ausência de uso de relógio real (Date.now / performance.now)', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });

    const originalDateNow = Date.now;
    Date.now = () => {
      throw new Error('Date.now() chamado indevidamente no TimeSystem');
    };

    try {
      ts.update(16.6);
      ts.advance(100);
      ts.setTime(500);
      ts.getDay();
      ts.getTimeOfDaySeconds();
      ts.getTime();
      ts.pause();
      ts.resume();
    } finally {
      Date.now = originalDateNow;
    }
  });

  // M. Ausência de Math.random
  it('M. Ausência de Math.random no subsistema temporal', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });

    const originalRandom = Math.random;
    Math.random = () => {
      throw new Error('Math.random() chamado indevidamente no TimeSystem');
    };

    try {
      ts.update(30);
      ts.advance(250);
      ts.setTime(1200);
      ts.getDay();
      ts.getTimeOfDaySeconds();
      ts.getDayProgress();
    } finally {
      Math.random = originalRandom;
    }
  });

  // N. Ausência de dependência de Renderer/Canvas
  it('N. Ausência de dependência de Renderer/Canvas (executa sem ambiente visual)', () => {
    const world = new World(777);
    const ts = world.getTimeSystem();

    assert.ok(ts);
    assert.equal(typeof ts.update, 'function');
    assert.equal(typeof ts.getTime, 'function');
    assert.equal(world.getTime(), 0);

    world.update(1.0);
    assert.equal(world.getTime(), 1.0);
  });

  // O. Ausência de dependência de Player
  it('O. Ausência de dependência de Player (subsistema puramente autônomo)', () => {
    const ts = new TimeSystem();
    ts.update(10);
    assert.equal(ts.getTotalElapsedSeconds(), 10);
  });

  // P. Comportamento determinístico após unload/reload de chunks
  it('P. Comportamento determinístico de culturas e tempo após descarregar e recarregar chunks', () => {
    const world = new World(100);
    const chunkManager = world.getChunkManager();

    // Carregar chunk (0, 0)
    chunkManager.getChunk(0, 0);

    // Preparar solo e plantar no tile (2, 2)
    world.applyTileModification(2, 2, TileType.TILLED_SOIL);
    world.getCropSystem().plantCrop(2, 2, 'turnip', world.getTime());
    world.waterCrop(2, 2);

    // Avançar tempo para 40s (cultura madura)
    world.update(40);
    assert.equal(world.getCropGrowthStage(2, 2), 3);

    // Descarregar chunk (0, 0)
    chunkManager.unloadChunk(0, 0);
    assert.equal(chunkManager.isChunkLoaded(0, 0), false);

    // Avançar mais 20s enquanto o chunk está fora da memória
    world.update(20);
    assert.equal(world.getTime(), 60);

    // Recarregar chunk (0, 0)
    chunkManager.getChunk(0, 0);
    assert.equal(chunkManager.isChunkLoaded(0, 0), true);

    // O cultivo deve continuar existindo no estado maduro correto
    assert.equal(world.getCropGrowthStage(2, 2), 3);
    assert.equal(world.isCropWatered(2, 2), true);
  });

  // Q. Transição exata na fronteira do dia (boundary test)
  it('Q. Transição exata na fronteira do dia (boundary test na troca de segundos)', () => {
    const dayLength = 1200;
    const ts = new TimeSystem({ dayLengthSeconds: dayLength });

    ts.setTime(1199.999);
    assert.equal(ts.getDay(), 1, '1199.999s é o último instante do Dia 1');
    assert.ok(Math.abs(ts.getTimeOfDaySeconds() - 1199.999) < 1e-6);

    ts.setTime(1200.0);
    assert.equal(ts.getDay(), 2, '1200.0s é exatamente o início do Dia 2');
    assert.equal(ts.getTimeOfDaySeconds(), 0, 'No instante de transição timeOfDay deve ser 0');

    ts.setTime(1200.001);
    assert.equal(ts.getDay(), 2, '1200.001s pertence ao Dia 2');
    assert.ok(Math.abs(ts.getTimeOfDaySeconds() - 0.001) < 1e-6);
  });

  // R. Comportamento com deltaTimes variáveis e fracionários
  it('R. Comportamento com deltaTimes variáveis e fracionários acumula determinísticamente', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });
    const deltas = [0.01666, 0.03333, 0.00833, 0.05, 0.01667];
    const expectedSum = deltas.reduce((acc, cur) => acc + cur, 0);

    for (const dt of deltas) {
      ts.update(dt);
    }

    assert.ok(
      Math.abs(ts.getTotalElapsedSeconds() - expectedSum) < 1e-9,
      'A soma acumulada deve ser idêntica à soma de deltas fracionários',
    );
  });

  // S. Garantia de monotonicidade (nunca retroceder no update normal)
  it('S. Garantia de monotonicidade: update negativo ou zero é ignorado', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });
    ts.update(50);
    assert.equal(ts.getTotalElapsedSeconds(), 50);

    ts.update(-10);
    assert.equal(ts.getTotalElapsedSeconds(), 50, 'deltaTime negativo deve ser ignorado');

    ts.update(0);
    assert.equal(ts.getTotalElapsedSeconds(), 50, 'deltaTime zero não altera o tempo');
  });

  // T. Save/load snapshot determinístico
  it('T. Serialização e restauração determinística via snapshot', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 800, timeScale: 1.5, paused: true });
    ts.setTime(1400);

    const snapshot = ts.serialize();
    assert.equal(snapshot.totalElapsedSeconds, 1400);
    assert.equal(snapshot.dayLengthSeconds, 800);
    assert.equal(snapshot.timeScale, 1.5);
    assert.equal(snapshot.paused, true);

    const restored = TimeSystem.fromSnapshot(snapshot);
    assert.equal(restored.getTotalElapsedSeconds(), 1400);
    assert.equal(restored.getDayLengthSeconds(), 800);
    assert.equal(restored.getDay(), 2);
    assert.equal(restored.getTimeOfDaySeconds(), 600);
    assert.equal(restored.getTimeScale(), 1.5);
    assert.equal(restored.isPaused(), true);
  });

  // U. Listeners/handlers desacoplados de transição de dia
  it('U. Listeners de transição de dia recebem eventos e permitem desinscrição', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 100 });
    let callCount = 0;

    const unsubscribe = ts.addDayTransitionListener(() => {
      callCount++;
    });

    ts.advance(150);
    assert.equal(callCount, 1, 'Listener deve ser chamado na transição');

    unsubscribe();

    ts.advance(150);
    assert.equal(callCount, 1, 'Listener desinscrito não deve receber nova chamada');
  });

  // V. Escala de tempo (time scale / speed multiplier)
  it('V. Escala de tempo multiplica o efeito do deltaTime', () => {
    const ts = new TimeSystem({ dayLengthSeconds: 1000 });

    ts.setTimeScale(2.0);
    ts.update(1.0);
    assert.equal(ts.getTotalElapsedSeconds(), 2.0, 'Velocidade 2x dobra o avanço');

    ts.setTimeScale(0.5);
    ts.update(1.0);
    assert.equal(ts.getTotalElapsedSeconds(), 2.5, 'Velocidade 0.5x reduz o avanço pela metade');
  });

  // W. Cálculo determinístico independente da taxa de quadros
  it('W. Comparação entre 120 quadros a 30 FPS vs 240 quadros a 60 FPS', () => {
    const ts30fps = new TimeSystem({ dayLengthSeconds: 1000 });
    const ts60fps = new TimeSystem({ dayLengthSeconds: 1000 });

    for (let i = 0; i < 120; i++) {
      ts30fps.update(1 / 30);
    }

    for (let i = 0; i < 240; i++) {
      ts60fps.update(1 / 60);
    }

    assert.ok(Math.abs(ts30fps.getTotalElapsedSeconds() - 4.0) < 1e-9);
    assert.ok(Math.abs(ts60fps.getTotalElapsedSeconds() - 4.0) < 1e-9);
    assert.ok(
      Math.abs(ts30fps.getTotalElapsedSeconds() - ts60fps.getTotalElapsedSeconds()) < 1e-9,
      '30 FPS e 60 FPS de mesma duração total produzem tempos equivalentes',
    );
  });

  // X. Compatibilidade total com o ciclo agrícola existente
  it('X. Ciclo agrícola completo funciona perfeitamente com a fundação temporal TimeSystem', () => {
    const world = new World(42);
    const harvestSystem = new HarvestSystem();
    const plantSystem = new PlantCropSystem();

    const targetTile = { tileX: 2, tileY: 1 };
    const player = new Player({
      worldX: targetTile.tileX * TILE_SIZE - 8,
      worldY: targetTile.tileY * TILE_SIZE + 4,
    });
    player.direction = PlayerDirection.RIGHT;

    // 1. Preparar solo
    world.applyTileModification(targetTile.tileX, targetTile.tileY, TileType.TILLED_SOIL);

    // 2. Plantar nabo
    player.inventory.addItemStack(createItemStack('turnip_seed', 2));
    player.hotbar.setSelectedSlot(0);
    const plantResult = plantSystem.executePlant(player, world, targetTile);
    assert.equal(plantResult.success, true);
    assert.equal(world.hasCropAt(targetTile.tileX, targetTile.tileY), true);

    // 3. Regar
    world.waterCrop(targetTile.tileX, targetTile.tileY);
    assert.equal(world.isCropWatered(targetTile.tileX, targetTile.tileY), true);

    // 4. Avançar o tempo do mundo através do TimeSystem
    world.update(40);
    assert.equal(world.getTime(), 40);
    assert.equal(world.getCropGrowthStage(targetTile.tileX, targetTile.tileY), 3);

    // 5. Colher
    const harvestResult = harvestSystem.executeHarvest(player, world, targetTile);
    assert.equal(harvestResult.success, true);
    assert.equal(world.hasCropAt(targetTile.tileX, targetTile.tileY), false);

    // 6. Verificar inventário recebeu o item 'turnip'
    const harvestedStack = player.inventory.getAllSlots().find((s) => s?.itemId === 'turnip');
    assert.ok(harvestedStack);
    assert.equal(harvestedStack.quantity, 1);
  });
});
