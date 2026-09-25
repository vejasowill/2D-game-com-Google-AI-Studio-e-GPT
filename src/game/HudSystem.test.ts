import assert from 'node:assert';
import { World } from './World.ts';
import { Player } from './Player.ts';
import { calculateHudState, formatGameClock } from './HudState.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { Biome } from './Biome.ts';
import { RestSystem } from './RestSystem.ts';
import { Input } from './Input.ts';
import { Renderer } from './Renderer.ts';
import { isTouchOrMobileEnvironment } from '../ui/inputContext.ts';

console.log('--- Iniciando Suíte de Testes da HUD Mínima (Tempo & Energia & Contexto de Entrada) ---');

// Assegura registros inicializados
ItemRegistry.ensureInitialized();
ToolRegistry.reset();
ToolRegistry.ensureInitialized();

// =========================================================================
// A. O indicador de tempo utiliza o TimeSystem como autoridade única
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });

  // Estado inicial
  const hudInitial = calculateHudState(world, player);
  assert.strictEqual(hudInitial.day, 1, 'A.1: HUD reflete day 1 do TimeSystem');
  assert.strictEqual(hudInitial.timeOfDaySeconds, 0, 'A.2: timeOfDaySeconds inicial é 0');
  assert.strictEqual(hudInitial.formattedTime, '06:00', 'A.3: Horário inicial às 06:00 (alvorecer)');

  // Avança o tempo do mundo através do TimeSystem
  world.advanceTime(100); // 100s equivalem a 2 horas de jogo (100 / 50 = 2h)
  const hudAfter100s = calculateHudState(world, player);
  assert.strictEqual(hudAfter100s.timeOfDaySeconds, 100, 'A.4: HUD acompanha monotonicamente timeOfDaySeconds');
  assert.strictEqual(hudAfter100s.formattedTime, '08:00', 'A.5: 100s resulta no horário esperado 08:00');

  // Ajusta diretamente o relógio do TimeSystem
  world.setTime(300); // 300s equivalem a 6 horas após 06:00 = 12:00
  const hudDirect = calculateHudState(world, player);
  assert.strictEqual(hudDirect.timeOfDaySeconds, 300, 'A.6: HUD consulta o TimeSystem atualizado');
  assert.strictEqual(hudDirect.formattedTime, '12:00', 'A.7: Horário de meio-dia 12:00');

  console.log('✓ Requisito A passou: O indicador de tempo utiliza estritamente o TimeSystem');
}

// =========================================================================
// B. O dia exibido corresponde ao day atual
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });

  assert.strictEqual(calculateHudState(world, player).day, 1, 'B.1: Dia inicial é 1');

  // Avança para o início do próximo dia usando advanceToNextDay
  world.advanceToNextDay();
  const hudDay2 = calculateHudState(world, player);
  assert.strictEqual(hudDay2.day, 2, 'B.2: Dia atualizado para 2');
  assert.strictEqual(hudDay2.timeOfDaySeconds, 0, 'B.3: timeOfDaySeconds zerado no novo dia');
  assert.strictEqual(hudDay2.formattedTime, '06:00', 'B.4: Desperta às 06:00 do Dia 2');

  // Avança múltiplos dias
  world.advanceTime(1200 * 3); // +3 dias
  const hudDay5 = calculateHudState(world, player);
  assert.strictEqual(hudDay5.day, 5, 'B.5: Dia atualizado para 5');

  console.log('✓ Requisito B passou: O dia exibido corresponde exatamente ao day atual');
}

// =========================================================================
// C. O horário exibido corresponde a timeOfDaySeconds
// =========================================================================
{
  // Teste de mapeamento puro da função formatGameClock
  assert.strictEqual(formatGameClock(0, 1200, 6), '06:00', 'C.1: 0s -> 06:00');
  assert.strictEqual(formatGameClock(50, 1200, 6), '07:00', 'C.2: 50s (+1h) -> 07:00');
  assert.strictEqual(formatGameClock(100, 1200, 6), '08:00', 'C.3: 100s (+2h) -> 08:00');
  assert.strictEqual(formatGameClock(300, 1200, 6), '12:00', 'C.4: 300s (+6h) -> 12:00');
  assert.strictEqual(formatGameClock(600, 1200, 6), '18:00', 'C.5: 600s (+12h) -> 18:00');
  assert.strictEqual(formatGameClock(900, 1200, 6), '00:00', 'C.6: 900s (+18h) -> 00:00');
  assert.strictEqual(formatGameClock(1150, 1200, 6), '05:00', 'C.7: 1150s (+23h) -> 05:00');
  assert.strictEqual(formatGameClock(1199, 1200, 6), '05:58', 'C.8: 1199s -> 05:58');

  // Suporte a startHour customizado (ex: 0 para meia-noite)
  assert.strictEqual(formatGameClock(0, 1200, 0), '00:00', 'C.9: startHour 0 -> 00:00');

  console.log('✓ Requisito C passou: O horário exibido corresponde determinísticamente a timeOfDaySeconds');
}

// =========================================================================
// D. O indicador de energia utiliza o EnergySystem do Player
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });

  const hud = calculateHudState(world, player);
  assert.strictEqual(hud.currentEnergy, 100, 'D.1: currentEnergy reflete player.getEnergy()');
  assert.strictEqual(hud.maximumEnergy, 100, 'D.2: maximumEnergy reflete player.getEnergy()');
  assert.strictEqual(hud.energyPercentage, 1.0, 'D.3: energyPercentage é 1.0');

  // Alteração no player reflete na consulta seguinte
  player.getEnergy().setCurrent(75);
  const hud75 = calculateHudState(world, player);
  assert.strictEqual(hud75.currentEnergy, 75, 'D.4: currentEnergy atualizado para 75');
  assert.strictEqual(hud75.energyPercentage, 0.75, 'D.5: energyPercentage é 0.75');

  console.log('✓ Requisito D passou: O indicador de energia utiliza diretamente o EnergySystem do Player');
}

// =========================================================================
// E. A energia exibida acompanha alterações no EnergySystem durante o gameplay
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem();

  // Árvore para corte com machado (custo declarativo de 10 energia)
  const tree = new NaturalTreeObject('tree_hud_test', { worldX: 100, worldY: 124 }, 24, 24, Biome.FOREST, 0, 0, 0);
  world.getObjectManager().addObject(tree);

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  // Antes do uso: 100 de energia
  assert.strictEqual(calculateHudState(world, player).currentEnergy, 100, 'E.1: 100 antes da ação');

  // Uso do machado consome 10 de energia
  const useResult = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(useResult.success, true, 'E.2: Machado usado com sucesso');

  // HUD reflete imediatamente a redução de energia
  const hudAfterChop = calculateHudState(world, player);
  assert.strictEqual(hudAfterChop.currentEnergy, 90, 'E.3: Energia reduziu para 90');
  assert.strictEqual(hudAfterChop.energyPercentage, 0.9, 'E.4: Porcentagem é 0.9');

  // Descanso com RestSystem restaura a energia completamente
  const restSystem = new RestSystem();
  restSystem.rest({ player, world });

  const hudAfterRest = calculateHudState(world, player);
  assert.strictEqual(hudAfterRest.currentEnergy, 100, 'E.5: Energia restaurada para 100 após descanso');
  assert.strictEqual(hudAfterRest.energyPercentage, 1.0, 'E.6: Porcentagem é 1.0');
  assert.strictEqual(hudAfterRest.day, 2, 'E.7: Dia avançou para 2 após descanso');

  console.log('✓ Requisito E passou: A energia exibida acompanha alterações no EnergySystem');
}

// =========================================================================
// F. Nenhuma segunda fonte de verdade temporal ou energética foi criada
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });

  // Múltiplas consultas consecutivas retornam o mesmo valor das autoridades centrais
  const q1 = calculateHudState(world, player);
  const q2 = calculateHudState(world, player);

  assert.strictEqual(q1.day, q2.day, 'F.1: Consistência temporal');
  assert.strictEqual(q1.currentEnergy, q2.currentEnergy, 'F.2: Consistência de energia');

  // Forçar alteração externa no TimeSystem é detectada sem variáveis locais de cache
  world.getTimeSystem().advance(250);
  const q3 = calculateHudState(world, player);
  assert.strictEqual(q3.timeOfDaySeconds, 250, 'F.3: Sem shadow variable ou relógio secundário');

  // Forçar alteração externa no EnergySystem é detectada sem variáveis locais de cache
  player.getEnergy().setCurrent(42);
  const q4 = calculateHudState(world, player);
  assert.strictEqual(q4.currentEnergy, 42, 'F.4: Sem shadow variable de energia');

  console.log('✓ Requisito F passou: Nenhuma segunda fonte de verdade temporal ou energética foi criada');
}

// =========================================================================
// G. A HUD não altera física ou gameplay
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 150, worldY: 200 });

  const initialPosition = { ...player.position };
  const initialSpeed = player.speed;
  const initialDirection = player.direction;
  const initialSize = player.size;
  const initialBounds = player.getVisualBounds();

  // Executa cálculo da HUD 100 vezes
  for (let i = 0; i < 100; i++) {
    calculateHudState(world, player);
  }

  // Verifica que o estado físico permanece estritamente idêntico
  assert.deepStrictEqual(player.position, initialPosition, 'G.1: Posição do jogador intacta');
  assert.strictEqual(player.speed, initialSpeed, 'G.2: Velocidade do jogador intacta');
  assert.strictEqual(player.direction, initialDirection, 'G.3: Direção do jogador intacta');
  assert.strictEqual(player.size, initialSize, 'G.4: Tamanho do jogador intacto');
  assert.deepStrictEqual(player.getVisualBounds(), initialBounds, 'G.5: Bounds do jogador intactos');

  console.log('✓ Requisito G passou: A HUD não altera física ou gameplay');
}

// =========================================================================
// H. A interface mobile continua funcionando normalmente
// =========================================================================
{
  const input = new Input();

  // Simula interação mobile do joystick
  input.triggerActionDown('use_item');
  assert.strictEqual(input.isActionJustPressed('use_item'), true, 'H.1: use_item detectado');

  input.triggerActionDown('interact');
  assert.strictEqual(input.isActionJustPressed('interact'), true, 'H.2: interact detectado');

  input.triggerActionDown('place');
  assert.strictEqual(input.isActionJustPressed('place'), true, 'H.3: place detectado');

  input.triggerActionDown('break');
  assert.strictEqual(input.isActionJustPressed('break'), true, 'H.4: break detectado');

  input.destroy();
  console.log('✓ Requisito H passou: A interface mobile continua funcionando normalmente');
}

// =========================================================================
// I. Ocultação condicional dos controles PC no contexto mobile/touch
// =========================================================================
{
  // Em ambiente Node.js sem window, isTouchOrMobileEnvironment retorna false de forma segura
  assert.strictEqual(isTouchOrMobileEnvironment(), false, 'I.1: Em Node.js seguro sem window');

  // Simula ambiente de toque com ontouchstart no window
  const originalWindow = (globalThis as Record<string, unknown>).window;

  try {
    (globalThis as Record<string, unknown>).window = {
      ontouchstart: null,
      matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }),
    };

    assert.strictEqual(isTouchOrMobileEnvironment(), true, 'I.2: Detecta ambiente de toque/mobile');
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  }

  console.log('✓ Requisito I passou: Controles PC são condicionados ao contexto de entrada correto');
}

// =========================================================================
// J. Renderer desenha a HUD no Canvas sem sobrepor controles mobile
// =========================================================================
{
  // Cria canvas simulado para testar renderHud e getHudBounds
  const mockCanvas = {
    width: 800,
    height: 600,
    getContext: () => ({
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 60 }),
      drawImage: () => {},
    }),
  } as unknown as HTMLCanvasElement;

  const renderer = new Renderer(mockCanvas);
  const bounds = renderer.getHudBounds();

  // Validação espacial dos limites da HUD
  assert(bounds.width > 0 && bounds.width <= 150, 'J.1: HUD compacta (largura <= 150px)');
  assert(bounds.height > 0 && bounds.height <= 45, 'J.2: HUD compacta (altura <= 45px)');
  assert.strictEqual(bounds.y, 10, 'J.3: Posicionada no topo (y = 10)');
  assert(bounds.x > 0, 'J.4: Coordenada X válida no topo direito');

  // Não invade a metade inferior onde ficam Joystick, Action Buttons e Hotbar (y >= 450)
  assert(bounds.y + bounds.height < 100, 'J.5: Restrita à margem superior sem colidir com controles inferiores');

  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });

  // Execução de renderHud não lança exceção
  let renderThrew = false;
  try {
    renderer.renderHud(world, player);
  } catch {
    renderThrew = true;
  }
  assert.strictEqual(renderThrew, false, 'J.6: renderHud executa com sucesso no canvas');

  console.log('✓ Requisito J passou: Renderer desenha a HUD no Canvas de forma compacta e sem conflitos espaciais');
}

console.log('======================================================');
console.log('Todos os 10 testes da Suíte de HUD Mínima passaram com sucesso!');
console.log('======================================================');
