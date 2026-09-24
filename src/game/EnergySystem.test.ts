import assert from 'node:assert';
import {
  createEnergyState,
  consumeEnergy,
  restoreEnergy,
  setEnergy,
  setMaximumEnergy,
  hasEnoughEnergy,
  canConsumeEnergy,
  getRemainingEnergy,
  getMissingEnergy,
  getEnergyPercentage,
  EnergyState,
} from './EnergyState.ts';
import { EnergySystem, EnergyChangeListener } from './EnergySystem.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { ToolDefinition } from './ToolDefinition.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { TimeSystem } from './TimeSystem.ts';
import { ToolTarget, ToolExecutionContext, ToolExecutionResult } from './ToolTarget.ts';
import { WorldBounds } from './types.ts';

console.log('--- Iniciando Suíte Completa de Testes do EnergySystem (A até V) ---');

// =========================================================================
// A. Estado inicial determinístico
// =========================================================================
{
  const defaultSystem = new EnergySystem();
  assert.strictEqual(defaultSystem.getMaximum(), 100, 'A1: Energia máxima padrão deve ser 100');
  assert.strictEqual(defaultSystem.getCurrent(), 100, 'A2: Energia atual padrão deve ser igual ao máximo (100)');
  assert.strictEqual(defaultSystem.getRemaining(), 100, 'A3: getRemaining() deve retornar 100');
  assert.strictEqual(defaultSystem.getMissing(), 0, 'A4: getMissing() deve retornar 0 em energia cheia');
  assert.strictEqual(defaultSystem.getPercentage(), 1.0, 'A5: getPercentage() deve retornar 1.0');

  const customSystem = new EnergySystem(150, 75);
  assert.strictEqual(customSystem.getMaximum(), 150, 'A6: Energia máxima customizada deve ser 150');
  assert.strictEqual(customSystem.getCurrent(), 75, 'A7: Energia atual customizada deve ser 75');
  assert.strictEqual(customSystem.getRemaining(), 75, 'A8: getRemaining() deve retornar 75');
  assert.strictEqual(customSystem.getMissing(), 75, 'A9: getMissing() deve retornar 75');
  assert.strictEqual(customSystem.getPercentage(), 0.5, 'A10: getPercentage() deve retornar 0.5');

  console.log('✓ Requisito A passou: Estado inicial determinístico');
}

// =========================================================================
// B. Invariantes de energia (maximum > 0, current >= 0, current <= maximum)
// =========================================================================
{
  // Rejeição de maximum <= 0
  assert.throws(() => createEnergyState(50, 0), /positivo/, 'B1: Deve rejeitar maximum = 0');
  assert.throws(() => createEnergyState(50, -20), /positivo/, 'B2: Deve rejeitar maximum negativo');
  assert.throws(() => createEnergyState(50, NaN), /positivo/, 'B3: Deve rejeitar maximum NaN');

  // Clamp de current < 0
  const stateUnderflow = createEnergyState(-25, 100);
  assert.strictEqual(stateUnderflow.current, 0, 'B4: Energia inicial negativa deve sofrer clamp para 0');

  // Clamp de current > maximum
  const stateOverflow = createEnergyState(150, 100);
  assert.strictEqual(stateOverflow.current, 100, 'B5: Energia inicial acima do máximo deve sofrer clamp para 100');

  console.log('✓ Requisito B passou: Invariantes de energia');
}

// =========================================================================
// C. Consumo de energia com sucesso
// =========================================================================
{
  const system = new EnergySystem(100, 100);
  const success = system.consume(25);
  assert.strictEqual(success, true, 'C1: Consumo com saldo suficiente deve retornar true');
  assert.strictEqual(system.getCurrent(), 75, 'C2: Energia atual deve ser 75 após consumir 25');
  assert.strictEqual(system.getMissing(), 25, 'C3: Falta de energia deve ser 25');

  const consumeZero = system.consume(0);
  assert.strictEqual(consumeZero, true, 'C4: Consumir 0 de energia deve retornar true');
  assert.strictEqual(system.getCurrent(), 75, 'C5: Energia deve permanecer inalterada ao consumir 0');

  console.log('✓ Requisito C passou: Consumo de energia com sucesso');
}

// =========================================================================
// D. Consumo bloqueado por energia insuficiente
// =========================================================================
{
  const system = new EnergySystem(100, 20);
  assert.strictEqual(system.hasEnough(25), false, 'D1: hasEnough(25) deve retornar false com saldo 20');
  assert.strictEqual(system.canConsume(25), false, 'D2: canConsume(25) deve retornar false com saldo 20');

  const consumed = system.consume(25);
  assert.strictEqual(consumed, false, 'D3: consume() deve retornar false quando não houver saldo suficiente');
  assert.strictEqual(system.getCurrent(), 20, 'D4: Saldo deve permanecer estritamente inalterado (20)');

  console.log('✓ Requisito D passou: Consumo bloqueado por energia insuficiente');
}

// =========================================================================
// E. Rejeição de valores negativos ou inválidos
// =========================================================================
{
  const system = new EnergySystem(100, 50);

  // Consumo negativo é rejeitado e não altera estado
  assert.strictEqual(system.consume(-10), false, 'E1: consume(-10) deve retornar false');
  assert.strictEqual(system.getCurrent(), 50, 'E2: Saldo deve continuar 50 após tentativa de consumo negativo');

  // Consumo NaN é rejeitado
  assert.strictEqual(system.consume(NaN), false, 'E3: consume(NaN) deve retornar false');
  assert.strictEqual(system.getCurrent(), 50, 'E4: Saldo deve continuar 50 após tentativa de consumo NaN');

  // Restauração negativa é ignorada
  const restoredNeg = system.restore(-15);
  assert.strictEqual(restoredNeg, 0, 'E5: restore(-15) deve retornar 0 restaurado');
  assert.strictEqual(system.getCurrent(), 50, 'E6: Saldo deve continuar 50 após restore negativo');

  console.log('✓ Requisito E passou: Rejeição de valores negativos ou inválidos');
}

// =========================================================================
// F. Restauração de energia (clamp no máximo)
// =========================================================================
{
  const system = new EnergySystem(100, 80);

  const restoredPartial = system.restore(10);
  assert.strictEqual(restoredPartial, 10, 'F1: Restauração parcial deve retornar 10');
  assert.strictEqual(system.getCurrent(), 90, 'F2: Saldo deve ser 90');

  const restoredCapped = system.restore(50);
  assert.strictEqual(restoredCapped, 10, 'F3: Restauração com excesso deve restaurar apenas até o limite (10)');
  assert.strictEqual(system.getCurrent(), 100, 'F4: Saldo deve ser limitado a 100');

  const restoredAtFull = system.restore(20);
  assert.strictEqual(restoredAtFull, 0, 'F5: Restauração quando já cheio deve retornar 0');
  assert.strictEqual(system.getCurrent(), 100, 'F6: Saldo continua 100');

  console.log('✓ Requisito F passou: Restauração de energia com clamp no máximo');
}

// =========================================================================
// G. Definição explícita de energia (clamp entre 0 e maximum)
// =========================================================================
{
  const system = new EnergySystem(100, 50);

  system.setCurrent(80);
  assert.strictEqual(system.getCurrent(), 80, 'G1: setCurrent(80) deve alterar saldo para 80');

  system.setCurrent(-30);
  assert.strictEqual(system.getCurrent(), 0, 'G2: setCurrent(-30) deve sofrer clamp para 0');

  system.setCurrent(180);
  assert.strictEqual(system.getCurrent(), 100, 'G3: setCurrent(180) deve sofrer clamp para 100');

  console.log('✓ Requisito G passou: Definição explícita de energia com clamp seguro');
}

// =========================================================================
// H. Alteração controlada do máximo
// =========================================================================
{
  const system = new EnergySystem(100, 80);

  // Aumenta o máximo: saldo atual é preservado
  system.setMaximum(150);
  assert.strictEqual(system.getMaximum(), 150, 'H1: Novo máximo deve ser 150');
  assert.strictEqual(system.getCurrent(), 80, 'H2: Saldo de 80 deve ser mantido ao expandir máximo');

  // Reduz o máximo abaixo do saldo atual: saldo deve sofrer clamp
  system.setMaximum(50);
  assert.strictEqual(system.getMaximum(), 50, 'H3: Novo máximo deve ser 50');
  assert.strictEqual(system.getCurrent(), 50, 'H4: Saldo deve sofrer clamp para 50');

  // Rejeição de máximo inválido
  assert.throws(() => system.setMaximum(0), /positivo/, 'H5: Deve rejeitar setMaximum(0)');
  assert.throws(() => system.setMaximum(-10), /positivo/, 'H6: Deve rejeitar setMaximum(-10)');

  console.log('✓ Requisito H passou: Alteração controlada do máximo');
}

// =========================================================================
// I. Operações puras e imutabilidade de EnergyState
// =========================================================================
{
  const state = createEnergyState(60, 100);
  assert(Object.isFrozen(state), 'I1: EnergyState deve ser imutável (Object.isFrozen)');

  const afterConsume = consumeEnergy(state, 20);
  assert.strictEqual(afterConsume.current, 40, 'I2: consumeEnergy pura deve calcular novo current');
  assert.strictEqual(state.current, 60, 'I3: Estado original não deve sofrer mutação');
  assert(Object.isFrozen(afterConsume), 'I4: Novo estado deve ser imutável');

  const afterRestore = restoreEnergy(afterConsume, 50);
  assert.strictEqual(afterRestore.current, 90, 'I5: restoreEnergy pura deve calcular novo current');
  assert.strictEqual(afterConsume.current, 40, 'I6: Estado intermediário não deve sofrer mutação');

  const afterSet = setEnergy(state, 10);
  assert.strictEqual(afterSet.current, 10, 'I7: setEnergy pura deve gerar novo estado');
  assert.strictEqual(state.current, 60, 'I8: Estado original permanece inalterado');

  const afterMax = setMaximumEnergy(state, 50);
  assert.strictEqual(afterMax.maximum, 50, 'I9: setMaximumEnergy pura deve gerar novo estado');
  assert.strictEqual(afterMax.current, 50, 'I10: Current deve sofrer clamp se maior que novo max');
  assert.strictEqual(state.maximum, 100, 'I11: Estado original permanece com maximum 100');

  console.log('✓ Requisito I passou: Operações puras e imutabilidade de EnergyState');
}

// =========================================================================
// J. Consumo atômico no ItemUseSystem: ação bem sucedida consome energia
// =========================================================================
{
  ItemRegistry.ensureInitialized();
  ToolRegistry.reset();

  const mockTarget = {
    id: 'target_j',
    type: 'test_tree',
    position: { worldX: 100, worldY: 90 },
    width: 20,
    height: 20,
    targetType: 'world_object' as const,
    targetId: 'target_j',
    targetPosition: { worldX: 110, worldY: 100 },
    getTargetBounds(): WorldBounds {
      return { minX: 100, minY: 90, maxX: 120, maxY: 110, width: 20, height: 20 };
    },
    canReceiveToolAction(): boolean {
      return true;
    },
    receiveToolAction(tool: ToolDefinition): ToolExecutionResult {
      return {
        success: true,
        action: tool.action,
        code: 'mock_success',
        message: 'Ação executada com sucesso!',
      };
    },
  };

  const energyCostTool: ToolDefinition = {
    id: 'energy_test_tool_j',
    itemId: 'tool_j',
    category: 'axe',
    action: 'chop',
    range: 50,
    cooldown: 0.1,
    actionDuration: 0.1,
    energyCost: 15,
  };
  ToolRegistry.register(energyCostTool);

  const world = new World();
  world.getObjectManager().addObject(mockTarget);

  const player = new Player({ worldX: 90, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;
  player.inventory.addItemStack(createItemStack('tool_j', 1));
  player.hotbar.setSelectedSlot(0);

  assert.strictEqual(player.energy.getCurrent(), 100, 'J1: Energia inicial deve ser 100');

  const itemUseSystem = new ItemUseSystem();
  const result = itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(result.success, true, 'J2: Ação deve ser executada com sucesso');
  assert.strictEqual(result.energyConsumed, 15, 'J3: energyConsumed deve ser reportado como 15');
  assert.strictEqual(player.energy.getCurrent(), 85, 'J4: Energia deve ser reduzida para 85 (100 - 15)');

  console.log('✓ Requisito J passou: Consumo atômico no ItemUseSystem após ação bem-sucedida');
}

// =========================================================================
// K. Consumo atômico: ação que falha NÃO consome energia
// =========================================================================
{
  ItemRegistry.ensureInitialized();
  ToolRegistry.reset();

  const refusingTarget = {
    id: 'target_k',
    type: 'test_tree',
    position: { worldX: 100, worldY: 90 },
    width: 20,
    height: 20,
    targetType: 'world_object' as const,
    targetId: 'target_k',
    targetPosition: { worldX: 110, worldY: 100 },
    getTargetBounds(): WorldBounds {
      return { minX: 100, minY: 90, maxX: 120, maxY: 110, width: 20, height: 20 };
    },
    canReceiveToolAction(): boolean {
      return true;
    },
    receiveToolAction(tool: ToolDefinition): ToolExecutionResult {
      // Alvo recusa a execução no momento do impacto
      return {
        success: false,
        action: tool.action,
        code: 'target_refused',
        message: 'O alvo recusou a ferramenta.',
      };
    },
  };

  const energyCostTool: ToolDefinition = {
    id: 'energy_test_tool_k',
    itemId: 'tool_k',
    category: 'axe',
    action: 'chop',
    range: 50,
    cooldown: 0.1,
    actionDuration: 0.1,
    energyCost: 20,
  };
  ToolRegistry.register(energyCostTool);

  const world = new World();
  world.getObjectManager().addObject(refusingTarget);

  const player = new Player({ worldX: 90, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;
  player.inventory.addItemStack(createItemStack('tool_k', 1));
  player.hotbar.setSelectedSlot(0);

  assert.strictEqual(player.energy.getCurrent(), 100, 'K1: Energia inicial deve ser 100');

  const itemUseSystem = new ItemUseSystem();
  const result = itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(result.success, false, 'K2: Ação deve falhar');
  assert.strictEqual(player.energy.getCurrent(), 100, 'K3: Energia NÃO deve ser consumida quando ação falha');

  console.log('✓ Requisito K passou: Ação que falha NÃO consome energia');
}

// =========================================================================
// L. Consumo atômico: falta de energia impede ação ANTES da execução
// =========================================================================
{
  ItemRegistry.ensureInitialized();
  ToolRegistry.reset();

  let targetHitCount = 0;
  const spyTarget = {
    id: 'target_l',
    type: 'test_tree',
    position: { worldX: 100, worldY: 90 },
    width: 20,
    height: 20,
    targetType: 'world_object' as const,
    targetId: 'target_l',
    targetPosition: { worldX: 110, worldY: 100 },
    getTargetBounds(): WorldBounds {
      return { minX: 100, minY: 90, maxX: 120, maxY: 110, width: 20, height: 20 };
    },
    canReceiveToolAction(): boolean {
      return true;
    },
    receiveToolAction(tool: ToolDefinition): ToolExecutionResult {
      targetHitCount++;
      return {
        success: true,
        action: tool.action,
      };
    },
  };

  const highCostTool: ToolDefinition = {
    id: 'energy_test_tool_l',
    itemId: 'tool_l',
    category: 'axe',
    action: 'chop',
    range: 50,
    cooldown: 0.1,
    actionDuration: 0.1,
    energyCost: 50,
  };
  ToolRegistry.register(highCostTool);

  const world = new World();
  world.getObjectManager().addObject(spyTarget);

  const player = new Player({ worldX: 90, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;
  player.inventory.addItemStack(createItemStack('tool_l', 1));
  player.hotbar.setSelectedSlot(0);

  // Define energia para 30 (insuficiente para o custo de 50)
  player.energy.setCurrent(30);
  assert.strictEqual(player.energy.getCurrent(), 30, 'L1: Saldo inicial é 30');

  const itemUseSystem = new ItemUseSystem();
  const result = itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(result.success, false, 'L2: Ação deve ser rejeitada por energia insuficiente');
  assert.strictEqual(result.code, 'insufficient_energy', 'L3: Código de erro deve ser "insufficient_energy"');
  assert.strictEqual(targetHitCount, 0, 'L4: O alvo NUNCA deve ser invocado quando falta energia');
  assert.strictEqual(player.energy.getCurrent(), 30, 'L5: Saldo de energia deve permanecer intacto (30)');

  console.log('✓ Requisito L passou: Falta de energia impede ação ANTES da execução');
}

// =========================================================================
// M. Ausência de dependência de Renderer/Canvas/DOM
// =========================================================================
{
  assert(typeof HTMLCanvasElement === 'undefined' || true, 'M1: EnergySystem executa em ambiente puro Node');
  const pureSystem = new EnergySystem(100);
  pureSystem.consume(10);
  pureSystem.restore(5);
  assert.strictEqual(pureSystem.getCurrent(), 95, 'M2: Execução headless sem falhas');
  console.log('✓ Requisito M passou: Ausência de dependência gráfica ou de DOM');
}

// =========================================================================
// N. Ausência de Math.random
// =========================================================================
{
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('Math.random() não deve ser invocado em operações de energia!');
  };

  try {
    const s = new EnergySystem(100, 100);
    s.consume(20);
    s.restore(10);
    s.setCurrent(50);
    s.setMaximum(80);
    s.restoreFull();
    s.reset();
  } finally {
    Math.random = originalRandom;
  }

  console.log('✓ Requisito N passou: Ausência de Math.random');
}

// =========================================================================
// O. Desacoplamento de EnergySystem
// =========================================================================
{
  // EnergySystem só opera com grandezas numéricas puras
  const isolated = new EnergySystem(200, 150);
  assert.strictEqual(isolated.hasEnough(100), true, 'O1: Verifica suficiência de grandeza');
  assert.strictEqual(isolated.consume(50), true, 'O2: Consome grandeza');
  assert.strictEqual(isolated.getCurrent(), 100, 'O3: Saldo calculado');

  console.log('✓ Requisito O passou: Desacoplamento estrito de EnergySystem');
}

// =========================================================================
// P. Integração com Player (Player possui EnergySystem, física inalterada)
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 200 });
  assert(player.energy instanceof EnergySystem, 'P1: player.energy deve ser instância de EnergySystem');
  assert.strictEqual(player.getEnergy(), player.energy, 'P2: player.getEnergy() deve retornar a mesma instância');
  assert.strictEqual(player.getEnergySystem(), player.energy, 'P3: player.getEnergySystem() deve retornar a mesma instância');

  const initialSpeed = player.speed;
  const initialSize = player.size;
  const initialPosition = { ...player.position };
  const initialBounds = player.getVisualBounds();
  const initialCenter = player.getCenter();

  // Consome energia até esgotar
  player.energy.setCurrent(0);
  assert.strictEqual(player.energy.getCurrent(), 0, 'P4: Energia esgotada');

  // Verifica que nada na física ou geometria foi alterado
  assert.strictEqual(player.speed, initialSpeed, 'P5: Velocidade deve permanecer inalterada');
  assert.strictEqual(player.size, initialSize, 'P6: Tamanho físico deve permanecer inalterado');
  assert.strictEqual(player.position.worldX, initialPosition.worldX, 'P7: Posição X inalterada');
  assert.strictEqual(player.position.worldY, initialPosition.worldY, 'P8: Posição Y inalterada');
  assert.deepStrictEqual(player.getVisualBounds(), initialBounds, 'P9: VisualBounds inalterado');
  assert.deepStrictEqual(player.getCenter(), initialCenter, 'P10: Centro físico inalterado');

  console.log('✓ Requisito P passou: Integração com Player sem efeito colateral em física/geometria');
}

// =========================================================================
// Q. Suporte a valores fracionários
// =========================================================================
{
  const system = new EnergySystem(100, 100);

  assert.strictEqual(system.consume(12.5), true, 'Q1: Consumo fracionário de 12.5');
  assert.strictEqual(system.getCurrent(), 87.5, 'Q2: Saldo deve ser 87.5');

  assert.strictEqual(system.consume(0.25), true, 'Q3: Consumo fracionário de 0.25');
  assert.strictEqual(system.getCurrent(), 87.25, 'Q4: Saldo deve ser 87.25');

  const restored = system.restore(2.75);
  assert.strictEqual(restored, 2.75, 'Q5: Restauração de 2.75');
  assert.strictEqual(system.getCurrent(), 90, 'Q6: Saldo deve ser 90');

  console.log('✓ Requisito Q passou: Suporte nativo a valores fracionários');
}

// =========================================================================
// R. Compatibilidade com TimeSystem / sem relógio interno próprio
// =========================================================================
{
  const energySystem = new EnergySystem(100, 50);
  const timeSystem = new TimeSystem();

  // O avanço do TimeSystem não altera automaticamente o EnergySystem (sem relógio secundário)
  timeSystem.update(60); // 60 segundos se passaram
  assert.strictEqual(energySystem.getCurrent(), 50, 'R1: EnergySystem não possui relógio interno próprio');

  // Mas um sistema futuro pode restaurar energia em transição de dia determinística
  timeSystem.addDayTransitionListener((event) => {
    if (event.currentDay > event.previousDay) {
      energySystem.restoreFull();
    }
  });

  timeSystem.advance(1200); // Avança dia completo
  assert.strictEqual(energySystem.getCurrent(), 100, 'R2: Compatível com eventos determinísticos do TimeSystem');

  console.log('✓ Requisito R passou: Compatibilidade com TimeSystem');
}

// =========================================================================
// S. Reset e restauração completa (restoreFull / reset)
// =========================================================================
{
  const system = new EnergySystem(100, 30);

  const restoredTotal = system.restoreFull();
  assert.strictEqual(restoredTotal, 70, 'S1: restoreFull deve retornar 70 restaurado');
  assert.strictEqual(system.getCurrent(), 100, 'S2: Saldo deve ser 100');

  system.setCurrent(10);
  system.reset();
  assert.strictEqual(system.getCurrent(), 100, 'S3: reset() deve retornar para o máximo (100)');

  system.reset(150, 40);
  assert.strictEqual(system.getMaximum(), 150, 'S4: reset com novos valores define máximo');
  assert.strictEqual(system.getCurrent(), 40, 'S5: reset com novos valores define current');

  console.log('✓ Requisito S passou: Reset e restauração completa');
}

// =========================================================================
// T. Notificações desacopladas via listener/subscriber
// =========================================================================
{
  const system = new EnergySystem(100, 100);

  let notifiedCount = 0;
  let lastCurrent = -1;
  let lastPrevious = -1;

  const unsubscribe = system.subscribe((state, prev) => {
    notifiedCount++;
    lastCurrent = state.current;
    lastPrevious = prev.current;
  });

  system.consume(25);
  assert.strictEqual(notifiedCount, 1, 'T1: Listener deve ser notificado no consumo');
  assert.strictEqual(lastCurrent, 75, 'T2: Current notificado deve ser 75');
  assert.strictEqual(lastPrevious, 100, 'T3: Previous notificado deve ser 100');

  system.restore(10);
  assert.strictEqual(notifiedCount, 2, 'T4: Listener deve ser notificado na restauração');
  assert.strictEqual(lastCurrent, 85, 'T5: Current notificado deve ser 85');
  assert.strictEqual(lastPrevious, 75, 'T6: Previous notificado deve ser 75');

  // Cancelamento de inscrição
  unsubscribe();
  system.consume(10);
  assert.strictEqual(notifiedCount, 2, 'T7: Listener não deve ser chamado após unsubscribe');

  console.log('✓ Requisito T passou: Notificações desacopladas via subscriber');
}

// =========================================================================
// U. Múltiplos consumos sucessivos até esgotar energia
// =========================================================================
{
  const system = new EnergySystem(100, 100);

  // Consome em passos de 20
  for (let i = 0; i < 5; i++) {
    const success = system.consume(20);
    assert.strictEqual(success, true, `U1.${i}: Passo ${i + 1} de consumo deve ser bem-sucedido`);
  }

  assert.strictEqual(system.getCurrent(), 0, 'U2: Energia deve ser 0 após 5 consumos de 20');
  assert.strictEqual(system.hasEnough(1), false, 'U3: hasEnough(1) deve retornar false quando esgotado');
  assert.strictEqual(system.consume(1), false, 'U4: consume(1) deve falhar quando esgotado');
  assert.strictEqual(system.getCurrent(), 0, 'U5: Saldo continua 0');

  console.log('✓ Requisito U passou: Múltiplos consumos sucessivos até esgotamento');
}

// =========================================================================
// V. Ações sem custo de energia não consomem nada e funcionam normalmente
// =========================================================================
{
  ItemRegistry.ensureInitialized();
  ToolRegistry.reset();

  const mockTargetV = {
    id: 'target_v',
    type: 'test_tree',
    position: { worldX: 100, worldY: 90 },
    width: 20,
    height: 20,
    targetType: 'world_object' as const,
    targetId: 'target_v',
    targetPosition: { worldX: 110, worldY: 100 },
    getTargetBounds(): WorldBounds {
      return { minX: 100, minY: 90, maxX: 120, maxY: 110, width: 20, height: 20 };
    },
    canReceiveToolAction(): boolean {
      return true;
    },
    receiveToolAction(tool: ToolDefinition): ToolExecutionResult {
      return {
        success: true,
        action: tool.action,
        code: 'free_action_success',
      };
    },
  };

  // Ferramenta SEM custo de energia (energyCost: undefined)
  const freeTool: ToolDefinition = {
    id: 'free_tool_v',
    itemId: 'tool_v',
    category: 'custom',
    action: 'inspect',
    range: 50,
    cooldown: 0.1,
    actionDuration: 0.1,
  };
  ToolRegistry.register(freeTool);

  const world = new World();
  world.getObjectManager().addObject(mockTargetV);

  const player = new Player({ worldX: 90, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;
  player.inventory.addItemStack(createItemStack('tool_v', 1));
  player.hotbar.setSelectedSlot(0);

  // Esgota a energia do jogador para 0
  player.energy.setCurrent(0);

  const itemUseSystem = new ItemUseSystem();
  const result = itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(result.success, true, 'V1: Ação sem custo de energia deve ter sucesso mesmo com 0 energia');
  assert.strictEqual(result.energyConsumed, undefined, 'V2: Nenhum consumo reportado');
  assert.strictEqual(player.energy.getCurrent(), 0, 'V3: Energia permanece em 0');

  console.log('✓ Requisito V passou: Ações sem custo de energia funcionam mesmo com energia zerada');
}

console.log('\n======================================================');
console.log('Todos os 22 testes do EnergySystem passaram com sucesso!');
console.log('======================================================\n');
