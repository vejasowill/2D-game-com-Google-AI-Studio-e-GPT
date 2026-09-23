import assert from 'node:assert';
import { Input } from './Input.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { Renderer } from './Renderer.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { createItemStack } from './ItemStack.ts';
import { Biome } from './Biome.ts';
import { CollisionSystem } from './CollisionSystem.ts';

console.log('--- Iniciando Testes de Controles Mobile Mínimos (Touch, Joystick, Hotbar, Actions) ---');

// Inicializa o registro de itens
ItemRegistry.ensureInitialized();

// ============================================================================
// TESTE 1: JOYSTICK VIRTUAL - MOVIMENTO EM 360 GRAUS E VETOR DE ENTRADA
// ============================================================================
{
  const input = new Input();

  // 1.1 Repouso inicial: vetor nulo
  assert.deepStrictEqual(input.getMovementDirection(), { x: 0, y: 0 }, 'Em repouso, direção deve ser (0, 0)');

  // 1.2 Movimento puro para a direita (0 rad / 0 graus)
  input.setTouchMovement(1, 0);
  let dir = input.getMovementDirection();
  assert.strictEqual(dir.x, 1, 'Movimento X deve ser 1');
  assert.strictEqual(dir.y, 0, 'Movimento Y deve ser 0');
  assert.strictEqual(Math.hypot(dir.x, dir.y), 1, 'Magnitude deve ser 1.0');

  // 1.3 Movimento puro para cima (-90 graus)
  input.setTouchMovement(0, -1);
  dir = input.getMovementDirection();
  assert.strictEqual(dir.x, 0);
  assert.strictEqual(dir.y, -1);
  assert.strictEqual(Math.hypot(dir.x, dir.y), 1);

  // 1.4 Movimento em ângulo arbitrário (ex: 30 graus: cos=0.866, sin=0.5)
  const angle = Math.PI / 6;
  input.setTouchMovement(Math.cos(angle), Math.sin(angle));
  dir = input.getMovementDirection();
  assert(Math.abs(Math.hypot(dir.x, dir.y) - 1.0) < 0.0001, 'Magnitude a 30 graus deve ser 1.0');
  assert(Math.abs(dir.x - Math.cos(angle)) < 0.0001);
  assert(Math.abs(dir.y - Math.sin(angle)) < 0.0001);

  // 1.5 Reset do joystick
  input.resetTouchMovement();
  assert.deepStrictEqual(input.getMovementDirection(), { x: 0, y: 0 }, 'Após resetTouchMovement, deve retornar (0, 0)');

  input.destroy();
  console.log('✔ Teste 1 concluído: Joystick 360 graus e vetor de entrada validados.');
}

// ============================================================================
// TESTE 2: NORMALIZAÇÃO ESTRITA DE MOVIMENTO DIAGONAL
// ============================================================================
{
  const input = new Input();

  // Enviar vetor diagonal com magnitude excessiva (ex: canto superior-direito arrastado ao máximo: 1, -1)
  input.setTouchMovement(1, -1);
  const dir = input.getMovementDirection();
  const mag = Math.hypot(dir.x, dir.y);

  // A magnitude NUNCA deve ultrapassar 1.0
  assert(
    Math.abs(mag - 1.0) < 0.0001,
    `Magnitude diagonal do joystick deve ser estritamente normalizada para 1.0 (obtido: ${mag})`,
  );
  assert(Math.abs(dir.x - Math.SQRT1_2) < 0.0001, `dir.x diagonal deve ser SQRT1_2 (obtido: ${dir.x})`);
  assert(Math.abs(dir.y - (-Math.SQRT1_2)) < 0.0001, `dir.y diagonal deve ser -SQRT1_2 (obtido: ${dir.y})`);

  input.destroy();
  console.log('✔ Teste 2 concluído: Normalização estrita de movimento diagonal validada.');
}

// ============================================================================
// TESTE 3: COMBINAÇÃO SEGURA DE TECLADO E TOQUE (SEM EXCEDER MAGNITUDE 1.0)
// ============================================================================
{
  const input = new Input();

  // Ativa tecla 'D' (direita)
  input.triggerKeyDown('KeyD');
  // E também ativa joystick para baixo
  input.setTouchMovement(0, 1);

  const dir = input.getMovementDirection();
  const mag = Math.hypot(dir.x, dir.y);

  assert(mag <= 1.0001, `Magnitude combinada de teclado + touch não pode exceder 1.0 (obtido: ${mag})`);

  input.triggerKeyUp('KeyD');
  input.resetTouchMovement();
  input.destroy();
  console.log('✔ Teste 3 concluído: Coexistência de teclado e joystick touch validada.');
}

// ============================================================================
// TESTE 4: BOTÃO INTERACT - AÇÃO DISCRETA, SEM DUPLICIDADE E ISOLAMENTO
// ============================================================================
{
  const input = new Input();

  // 4.1 Início do toque em INTERACT
  input.triggerActionDown('interact');
  assert.strictEqual(input.isActionJustPressed('interact'), true, 'No 1º frame, interact deve ser justPressed');
  assert.strictEqual(input.isActionPressed('interact'), true, 'No 1º frame, interact deve estar pressed');
  assert.strictEqual(input.isActionJustPressed('use_item'), false, 'interact NÃO deve disparar use_item');

  // 4.2 Próximo frame (dedo permanece segurando o botão)
  input.clearFrameState();
  assert.strictEqual(
    input.isActionJustPressed('interact'),
    false,
    'No 2º frame segurando, justPressed deve ser false (sem auto-repetição)',
  );
  assert.strictEqual(input.isActionPressed('interact'), true, 'Ainda está pressed enquanto segurado');

  // 4.3 Soltura do botão
  input.triggerActionUp('interact');
  assert.strictEqual(input.isActionPressed('interact'), false, 'Após soltura, pressed deve ser false');

  // 4.4 Novo toque em INTERACT
  input.triggerActionDown('interact');
  assert.strictEqual(input.isActionJustPressed('interact'), true, 'Novo toque deve registrar justPressed novamente');

  input.triggerActionUp('interact');
  input.clearFrameState();
  input.destroy();
  console.log('✔ Teste 4 concluído: Botão INTERACT discreto e sem duplicidade validado.');
}

// ============================================================================
// TESTE 5: BOTÃO USE ITEM - DISPARO DE AÇÃO DE ITEM E ISOLAMENTO TOTAL
// ============================================================================
{
  const input = new Input();

  // 5.1 Início do toque em USE ITEM
  input.triggerActionDown('use_item');
  assert.strictEqual(input.isActionJustPressed('use_item'), true, 'use_item deve ser justPressed');
  assert.strictEqual(input.isActionPressed('use_item'), true, 'use_item deve estar pressed');
  assert.strictEqual(input.isActionJustPressed('interact'), false, 'use_item NÃO deve acionar interact');

  // 5.2 Segundo frame
  input.clearFrameState();
  assert.strictEqual(input.isActionJustPressed('use_item'), false, 'Sem repetição contínua no frame seguinte');
  assert.strictEqual(input.isActionPressed('use_item'), true, 'Permanece pressed enquanto segurado');

  // 5.3 Soltura
  input.triggerActionUp('use_item');
  assert.strictEqual(input.isActionPressed('use_item'), false);

  input.destroy();
  console.log('✔ Teste 5 concluído: Botão USE ITEM e isolamento de ações validados.');
}

// ============================================================================
// TESTE 6: HOTBAR - SELEÇÃO POR TOQUE E TOLERÂNCIA DE HIT-TESTING
// ============================================================================
{
  // Cria canvas mock para Renderer
  const mockCanvas = {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    parentElement: null,
    style: {},
    getContext: () => ({
      fillRect: () => {},
      strokeRect: () => {},
      setTransform: () => {},
      fillText: () => {},
      measureText: () => ({ width: 10 }),
    }),
  } as unknown as HTMLCanvasElement;

  const renderer = new Renderer(mockCanvas);
  const player = new Player({ worldX: 100, worldY: 100 });

  // Dimensões esperadas:
  // slotSize = 36, gap = 4, 8 slots -> totalWidth = 8*36 + 7*4 = 316
  // startX = (800 - 316) / 2 = 242
  // startY = 600 - 36 - 12 = 552
  const slot0X = 242 + 0 * 40 + 18; // Centro do slot 0 = 260
  const slot0Y = 552 + 18;          // Centro do slot 0 = 570

  // 6.1 Toque no centro do Slot 0
  const hitSlot0 = renderer.getHotbarSlotAt(slot0X, slot0Y, player);
  assert.strictEqual(hitSlot0, 0, 'Toque no centro do Slot 0 deve retornar 0');

  // 6.2 Toque no centro do Slot 7
  const slot7X = 242 + 7 * 40 + 18;
  const hitSlot7 = renderer.getHotbarSlotAt(slot7X, slot0Y, player);
  assert.strictEqual(hitSlot7, 7, 'Toque no centro do Slot 7 deve retornar 7');

  // 6.3 Toque dentro da tolerância vertical (+/- 6px além da borda do slot)
  const hitSlot0WithTolerance = renderer.getHotbarSlotAt(slot0X, 552 - 5, player);
  assert.strictEqual(hitSlot0WithTolerance, 0, 'Toque com tolerância vertical deve selecionar o Slot 0');

  // 6.4 Toque longe da hotbar (meio da tela) deve retornar null
  const hitWorldCenter = renderer.getHotbarSlotAt(400, 300, player);
  assert.strictEqual(hitWorldCenter, null, 'Toque no centro da tela não deve selecionar slot');

  // 6.5 Toque bem abaixo da tela deve retornar null
  const hitBelow = renderer.getHotbarSlotAt(slot0X, 610, player);
  assert.strictEqual(hitBelow, null, 'Toque fora da área inferior deve retornar null');

  console.log('✔ Teste 6 concluído: Hotbar com seleção touch e tolerância validada.');
}

// ============================================================================
// TESTE 7: INTEGRAÇÃO DA VERTICAL SLICE VIA ENTRADAS MOBILE
// Ciclo: Equipar Machado → Mover via Joystick → Usar Ferramenta (Corte) →
//        Mover até Drop → Ação INTERACT → Coletar Madeira no Inventário
// ============================================================================
{
  const world = new World(42);
  const player = new Player({ worldX: 96, worldY: 96 });
  const collision = new CollisionSystem(world);
  const itemUseSystem = new ItemUseSystem();
  const interactionSystem = new InteractionSystem();
  const input = new Input();

  // 7.1 Equipar o machado no slot 0 da hotbar
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);
  assert.strictEqual(player.getEquippedItem()?.itemId, 'axe', 'Machado deve estar equipado');

  // 7.2 Posicionar árvore intacta à frente do jogador (ao sul / DOWN)
  const tree = new NaturalTreeObject(
    'mobile_test_tree',
    { worldX: 96, worldY: 112 },
    24,
    32,
    Biome.FOREST,
    6,
    7,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  // 7.3 Simula o toque no botão USE ITEM via input touch abstraction
  input.triggerActionDown('use_item');

  // Frame 1: Aciona uso do machado através do touch
  const useResult1 = itemUseSystem.update(player, world, input, 0.016);
  assert(useResult1 !== null, 'Uso do item deve produzir resultado');
  assert.strictEqual(useResult1?.success, true, 'Golpe com machado deve ser bem-sucedido');
  assert.strictEqual(useResult1?.action, 'chop', 'Ação executada deve ser chop');
  assert.strictEqual(useResult1?.code, 'tree_chopped', 'Resultado deve ser tree_chopped');
  assert.strictEqual(tree.isChopped, true, 'Árvore deve passar para o estado isChopped');
  assert.strictEqual(tree.getStage(), 'stump', 'Estágio visual da árvore deve ser stump');

  input.triggerActionUp('use_item');
  input.clearFrameState();

  // 7.4 Verifica que o drop de madeira foi gerado no mundo
  const expectedDropId = `drop:wood:chop:6:7`;
  const dropObj = world.getObjectManager().getObjectById(expectedDropId);
  assert(dropObj !== null, 'Drop de madeira deve ter sido criado no mundo');
  assert.strictEqual(dropObj?.type, 'item_drop', 'Tipo do objeto deve ser "item_drop"');

  // 7.5 Simula movimentação do jogador em direção ao drop usando o JOYSTICK TOUCH
  input.setTouchMovement(0, 1); // joystick para baixo
  const moveDir = input.getMovementDirection();
  collision.movePlayer(player, moveDir, 0.05); // avança levemente em direção ao drop

  // 7.6 Simula toque no botão INTERACT para coletar o drop de madeira
  input.resetTouchMovement();
  input.triggerActionDown('interact');

  const interactResult = interactionSystem.update(player, world, input, 0.016);
  assert(interactResult !== null, 'Interação com drop deve produzir resultado');
  assert.strictEqual(interactResult?.success, true, 'Coleta da madeira deve ter sucesso');

  // 7.7 Valida que o inventário do jogador agora possui madeira!
  const woodCount = player.inventory.getItemCount('wood');
  assert.strictEqual(woodCount, 3, 'Jogador deve ter exatamente 3 madeiras no inventário após coleta via touch INTERACT!');

  input.triggerActionUp('interact');
  input.clearFrameState();
  input.destroy();
  console.log('✔ Teste 7 concluído: Ciclo completo da vertical slice via controles touch validado com sucesso!');
}

console.log('--- TODOS OS TESTES DE CONTROLES MOBILE PASSARAM COM SUCESSO ---');
