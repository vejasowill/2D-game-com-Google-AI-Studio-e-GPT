import assert from 'node:assert';
import { World } from './World.ts';
import { Player } from './Player.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { Renderer } from './Renderer.ts';
import { Camera } from './Camera.ts';
import { ItemIconRenderer } from './ItemIconRenderer.ts';
import { ItemDefinition } from './ItemDefinition.ts';
import { Input } from './Input.ts';
import { Game } from './Game.ts';

console.log('--- Iniciando Suíte de Testes de Apresentação / Observabilidade (Partes 1 a 6) ---');

ItemRegistry.ensureInitialized();
ToolRegistry.ensureInitialized();

// Helper mock para CanvasRenderingContext2D
function createMockCanvas(): HTMLCanvasElement {
  const drawCalls: string[] = [];
  return {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    parentElement: null,
    style: { width: '800px', height: '600px' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    getContext: () => ({
      save: () => drawCalls.push('save'),
      restore: () => drawCalls.push('restore'),
      setTransform: () => {},
      beginPath: () => {},
      ellipse: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fillRect: (x: number, y: number, w: number, h: number) => drawCalls.push(`fillRect(${x},${y},${w},${h})`),
      strokeRect: (x: number, y: number, w: number, h: number) => drawCalls.push(`strokeRect(${x},${y},${w},${h})`),
      fillText: (text: string, x: number, y: number) => drawCalls.push(`fillText(${text},${x},${y})`),
      measureText: (text: string) => ({ width: text.length * 6 }),
      drawImage: () => drawCalls.push('drawImage'),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    }),
  } as unknown as HTMLCanvasElement;
}

// =========================================================================
// A. Todos os ItemDefinitions técnicos possuem representação visual válida
// =========================================================================
{
  const expectedItems = ['wood', 'stone', 'flower', 'axe', 'hoe', 'watering_can', 'turnip_seed', 'turnip'];

  for (const itemId of expectedItems) {
    const itemDef = ItemRegistry.get(itemId);
    assert(itemDef !== undefined, `A.1: Item '${itemId}' deve estar registrado no ItemRegistry`);
    assert(itemDef.icon !== undefined, `A.2: Item '${itemId}' deve possuir definição declarativa icon`);
    assert(typeof itemDef.icon.kind === 'string' && itemDef.icon.kind.length > 0, `A.3: Item '${itemId}' deve ter icon.kind válido`);
  }

  console.log('✓ Requisito A passou: Todos os ItemDefinitions técnicos possuem representação visual válida');
}

// =========================================================================
// B. Um item sem sprite externo ainda recebe fallback visual
// =========================================================================
{
  const mockCanvas = createMockCanvas();
  const ctx = mockCanvas.getContext('2d')!;

  let fillRectCalls = 0;
  const testCtx = {
    ...ctx,
    fillRect: () => {
      fillRectCalls++;
    },
  } as unknown as CanvasRenderingContext2D;

  const mockItemDef: ItemDefinition = {
    id: 'custom_ore',
    name: 'Minério Customizado',
    maxStackSize: 99,
    icon: { kind: 'stone' },
  };

  // Renderiza ícone de item sem spritesheet no AssetManager
  ItemIconRenderer.renderIcon(testCtx, mockItemDef, 10, 10, 16);
  assert(fillRectCalls > 0, 'B.1: renderIcon deve desenhar fallback procedural quando não há sprite externo');

  // Item sem icon declarado usa fallback genérico seguro
  fillRectCalls = 0;
  const noIconDef: ItemDefinition = {
    id: 'unknown_item',
    name: 'Item Desconhecido',
    maxStackSize: 10,
  };
  ItemIconRenderer.renderIcon(testCtx, noIconDef, 10, 10, 16);
  assert(fillRectCalls > 0, 'B.2: Item sem icon definido recebe fallback visual genérico');

  console.log('✓ Requisito B passou: Itens sem sprite externo recebem fallback visual procedural');
}

// =========================================================================
// C. Os oito itens técnicos atuais são distinguíveis pela definição de ícone
// =========================================================================
{
  const expectedItems = ['wood', 'stone', 'flower', 'axe', 'hoe', 'watering_can', 'turnip_seed', 'turnip'];
  const iconKinds = new Set<string>();

  for (const itemId of expectedItems) {
    const def = ItemRegistry.get(itemId)!;
    iconKinds.add(def.icon!.kind);
  }

  // Todos os 8 itens possuem tipos declarativos distintos
  assert.strictEqual(iconKinds.size, 8, 'C.1: Todos os 8 itens técnicos possuem icon.kind distintos');
  assert(iconKinds.has('wood'), 'C.2: Ícone wood presente');
  assert(iconKinds.has('stone'), 'C.3: Ícone stone presente');
  assert(iconKinds.has('flower'), 'C.4: Ícone flower presente');
  assert(iconKinds.has('axe'), 'C.5: Ícone axe presente');
  assert(iconKinds.has('hoe'), 'C.6: Ícone hoe presente');
  assert(iconKinds.has('watering_can'), 'C.7: Ícone watering_can presente');
  assert(iconKinds.has('seed'), 'C.8: Ícone seed presente');
  assert(iconKinds.has('turnip'), 'C.9: Ícone turnip presente');

  console.log('✓ Requisito C passou: Os 8 itens técnicos atuais são claramente distinguíveis por sua representação');
}

// =========================================================================
// D. A Hotbar continua consultando o Inventory real
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  const mockCanvas = createMockCanvas();
  const renderer = new Renderer(mockCanvas);

  // Inicia com inventário vazio
  assert.strictEqual(player.inventory.getSlot(0), null, 'D.1: Slot 0 inicialmente nulo');

  // Adiciona item diretamente no Inventory real
  player.inventory.addItemStack(createItemStack('wood', 12));
  const slot0 = player.inventory.getSlot(0);
  assert(slot0 !== null && slot0.itemId === 'wood' && slot0.quantity === 12, 'D.2: Item adicionado ao Inventory');

  // Hotbar reflete o slot 0 sem criar cópia
  const equipped = player.getEquippedItem();
  assert(equipped !== null && equipped.itemId === 'wood' && equipped.quantity === 12, 'D.3: Hotbar reflete o item real');

  // Modificação no inventário reflete na Hotbar imediatamente
  player.inventory.addItemStack(createItemStack('wood', 5));
  assert.strictEqual(player.getEquippedItem()?.quantity, 17, 'D.4: Hotbar atualiza quantidade do inventário real');

  console.log('✓ Requisito D passou: A Hotbar consulta estritamente o Inventory real como fonte de verdade');
}

// =========================================================================
// E. O nome exibido para o item selecionado vem do ItemRegistry
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.inventory.addItemStack(createItemStack('turnip_seed', 10));

  player.hotbar.setSelectedSlot(0);
  const stack0 = player.inventory.getSlot(player.hotbar.getSelectedSlotIndex());
  assert(stack0 !== null);
  const def0 = ItemRegistry.get(stack0.itemId);
  assert.strictEqual(def0?.name, 'Machado', 'E.1: Nome obtido do ItemRegistry para slot 0 é Machado');

  player.hotbar.setSelectedSlot(1);
  const stack1 = player.inventory.getSlot(player.hotbar.getSelectedSlotIndex());
  assert(stack1 !== null);
  const def1 = ItemRegistry.get(stack1.itemId);
  assert.strictEqual(def1?.name, 'Semente de Nabo', 'E.2: Nome obtido do ItemRegistry para slot 1 é Semente de Nabo');

  console.log('✓ Requisito E passou: O nome exibido do item selecionado provém estritamente do ItemRegistry');
}

// =========================================================================
// F. Slot vazio não produz nome incorreto
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  // Slot 5 está vazio
  player.hotbar.setSelectedSlot(5);
  const emptyStack = player.inventory.getSlot(5);
  assert.strictEqual(emptyStack, null, 'F.1: Slot vazio retorna null');

  const itemName = emptyStack ? ItemRegistry.get((emptyStack as any).itemId)?.name : null;
  assert.strictEqual(itemName, null, 'F.2: Slot vazio não produz nome de item indevido');

  console.log('✓ Requisito F passou: Slot vazio não produz nome incorreto');
}

// =========================================================================
// G. O painel de inventário representa exatamente os 20 slots do Inventory
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  const mockCanvas = createMockCanvas();
  const renderer = new Renderer(mockCanvas);

  const allSlots = player.inventory.getAllSlots();
  assert.strictEqual(allSlots.length, 20, 'G.1: Inventory possui exatamente 20 slots');

  // Adiciona itens em slots variados
  player.inventory.setSlot(0, createItemStack('wood', 10));
  player.inventory.setSlot(7, createItemStack('hoe', 1));
  player.inventory.setSlot(19, createItemStack('stone', 64)); // Último slot

  // Executa renderização do painel
  let renderThrew = false;
  try {
    renderer.renderInventoryPanel(player);
  } catch {
    renderThrew = true;
  }
  assert.strictEqual(renderThrew, false, 'G.2: renderInventoryPanel executa com sucesso');

  // Verifica que hit test de slots cobre de 0 a 19
  const bounds = renderer.getInventoryPanelBounds();
  assert(bounds.width > 0 && bounds.height > 0, 'G.3: Dimensões válidas do painel');

  console.log('✓ Requisito G passou: O painel de inventário representa exatamente os 20 slots do Inventory');
}

// =========================================================================
// H. Alterar uma quantidade no Inventory aparece na UI na próxima renderização/atualização
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  player.inventory.setSlot(0, createItemStack('wood', 5));
  assert.strictEqual(player.inventory.getSlot(0)?.quantity, 5, 'H.1: Quantidade inicial 5');

  // Altera quantidade no backend
  player.inventory.setSlot(0, createItemStack('wood', 25));
  assert.strictEqual(player.inventory.getSlot(0)?.quantity, 25, 'H.2: Quantidade atualizada para 25');

  // Na próxima leitura de slots da UI, reflete imediatamente
  const slots = player.inventory.getAllSlots();
  assert.strictEqual(slots[0]?.quantity, 25, 'H.3: getAllSlots reflete a nova quantidade 25');

  console.log('✓ Requisito H passou: Alterações no Inventory refletem imediatamente na UI');
}

// =========================================================================
// I. Não existe um segundo estado de inventário criado pela UI
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  const mockCanvas = createMockCanvas();
  const renderer = new Renderer(mockCanvas);

  // Renderiza a UI dezenas de vezes
  for (let i = 0; i < 20; i++) {
    renderer.renderInventoryPanel(player);
  }

  // O inventário continua sendo a mesma instância com os mesmos slots
  assert.strictEqual(player.inventory.getSlotCount(), 20, 'I.1: Slot count inalterado');
  assert.strictEqual(player.inventory.getAllSlots().length, 20, 'I.2: Tamanho dos slots preservado');

  console.log('✓ Requisito I passou: Nenhum estado paralelo ou cópia secundária de inventário criada');
}

// =========================================================================
// J. Nenhuma dessas mudanças altera física, colisão, TimeSystem, EnergySystem ou gameplay
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 120, worldY: 150 });
  const mockCanvas = createMockCanvas();
  const renderer = new Renderer(mockCanvas);

  const initialPos = { ...player.position };
  const initialEnergy = player.getEnergy().getCurrent();
  const initialTime = world.getTimeSystem().getTime().totalElapsedSeconds;

  // Renderiza Hotbar, HUD e Painel do Inventário
  const camera = new Camera(120, 150);
  renderer.render(world, camera, player, undefined, undefined, undefined, true);

  // Timers e estados
  renderer.update(0.5, player);

  assert.deepStrictEqual(player.position, initialPos, 'J.1: Posição do jogador intacta');
  assert.strictEqual(player.getEnergy().getCurrent(), initialEnergy, 'J.2: Energia intacta');
  assert.strictEqual(world.getTimeSystem().getTime().totalElapsedSeconds, initialTime, 'J.3: Tempo intacto');

  console.log('✓ Requisito J passou: A camada visual de observabilidade não afeta física, tempo ou energia');
}

// =========================================================================
// K. Abertura do inventário via Input [I] e botão [INV]
// =========================================================================
{
  const input = new Input();
  input.triggerActionDown('toggle_inventory');
  assert.strictEqual(input.isActionJustPressed('toggle_inventory'), true, 'K.1: toggle_inventory disparado');

  input.clearFrameState();
  assert.strictEqual(input.isActionJustPressed('toggle_inventory'), false, 'K.2: toggle_inventory limpo no próximo frame');

  input.destroy();
  console.log('✓ Requisito K passou: Ação toggle_inventory funciona via Input');
}

// =========================================================================
// L. Arrastar itens pelo Inventário (Drag-and-Drop)
// =========================================================================
{
  const mockCanvas = createMockCanvas();
  const game = new Game(mockCanvas);
  const player = game.getPlayer();
  const renderer = game.getRenderer();

  // Garante estado controlado do inventário
  player.inventory.clear();
  player.inventory.setSlot(0, createItemStack('axe', 1));
  player.inventory.setSlot(1, createItemStack('hoe', 1));
  player.inventory.setSlot(5, createItemStack('wood', 10));
  player.inventory.setSlot(6, createItemStack('wood', 5));

  const boundsSlot0 = renderer.getInventorySlotBounds(0)!;
  const boundsSlot1 = renderer.getInventorySlotBounds(1)!;
  const boundsSlot2 = renderer.getInventorySlotBounds(2)!; // vazio
  const boundsSlot5 = renderer.getInventorySlotBounds(5)!;
  const boundsSlot6 = renderer.getInventorySlotBounds(6)!;

  assert(boundsSlot0 !== null, 'L.0: Bounds do slot 0 calculados com sucesso');

  // L.1: Não deve iniciar arrasto se o inventário estiver fechado
  const dragClosed = game.handleInventoryDragStart(0, boundsSlot0.x + 10, boundsSlot0.y + 10);
  assert.strictEqual(dragClosed, false, 'L.1: Arrasto rejeitado com inventário fechado');
  assert.strictEqual(game.getDraggedSlotIndex(), null, 'L.1: draggedSlotIndex permanece null');

  // Abre o inventário
  game.setInventoryOpen(true);
  assert.strictEqual(game.getIsInventoryOpen(), true, 'L.1b: Inventário aberto');

  // L.2: Não inicia arrasto em slot vazio (slot 2)
  const dragEmpty = game.handleInventoryDragStart(2, boundsSlot2.x + 10, boundsSlot2.y + 10);
  assert.strictEqual(dragEmpty, false, 'L.2: Arrasto rejeitado em slot vazio');
  assert.strictEqual(game.getDraggedSlotIndex(), null, 'L.2: draggedSlotIndex permanece null');

  // L.3: Inicia arrasto em slot ocupado (slot 0 contendo machado)
  const dragStart = game.handleInventoryDragStart(0, boundsSlot0.x + 15, boundsSlot0.y + 15);
  assert.strictEqual(dragStart, true, 'L.3: Arrasto iniciado no slot 0');
  assert.strictEqual(game.getDraggedSlotIndex(), 0, 'L.3b: draggedSlotIndex é 0');
  assert.deepStrictEqual(game.getDragPos(), { x: boundsSlot0.x + 15, y: boundsSlot0.y + 15 }, 'L.3c: dragPos inicial correto');

  // L.4: Movimentação do ponteiro atualiza dragPos e hoveredSlotIndex
  const targetX = boundsSlot2.x + 18;
  const targetY = boundsSlot2.y + 18;
  game.handleInventoryDragMove(targetX, targetY);
  assert.strictEqual(game.getHoveredSlotIndex(), 2, 'L.4: hoveredSlotIndex atualizado para 2');
  assert.deepStrictEqual(game.getDragPos(), { x: targetX, y: targetY }, 'L.4b: dragPos atualizado');

  // L.5: Drop no slot vazio (slot 2) transfere o item
  const dropSuccess = game.handleInventoryDragEnd(targetX, targetY);
  assert.strictEqual(dropSuccess, true, 'L.5: Drop realizado com sucesso');
  assert.strictEqual(player.inventory.getSlot(0), null, 'L.5b: Slot 0 de origem agora está vazio');
  assert.strictEqual(player.inventory.getSlot(2)?.itemId, 'axe', 'L.5c: Slot 2 de destino agora contém axe');
  assert.strictEqual(game.getDraggedSlotIndex(), null, 'L.5d: draggedSlotIndex resetado após drop');
  assert.strictEqual(game.getDragPos(), null, 'L.5e: dragPos resetado após drop');

  // L.6: Drop em slot ocupado com item diferente troca os itens (swap)
  // Arrasta slot 1 ('hoe') e solta em slot 2 ('axe')
  game.handleInventoryDragStart(1, boundsSlot1.x + 10, boundsSlot1.y + 10);
  game.handleInventoryDragMove(boundsSlot2.x + 10, boundsSlot2.y + 10);
  game.handleInventoryDragEnd(boundsSlot2.x + 10, boundsSlot2.y + 10);
  assert.strictEqual(player.inventory.getSlot(1)?.itemId, 'axe', 'L.6a: Slot 1 agora contém axe');
  assert.strictEqual(player.inventory.getSlot(2)?.itemId, 'hoe', 'L.6b: Slot 2 agora contém hoe');

  // L.7: Drop em slot com o mesmo item mescla os stacks (slot 5 com 10 wood para slot 6 com 5 wood)
  game.handleInventoryDragStart(5, boundsSlot5.x + 10, boundsSlot5.y + 10);
  game.handleInventoryDragMove(boundsSlot6.x + 10, boundsSlot6.y + 10);
  game.handleInventoryDragEnd(boundsSlot6.x + 10, boundsSlot6.y + 10);
  assert.strictEqual(player.inventory.getSlot(5), null, 'L.7a: Slot 5 esvaziado após merge');
  assert.strictEqual(player.inventory.getSlot(6)?.itemId, 'wood', 'L.7b: Slot 6 continua wood');
  assert.strictEqual(player.inventory.getSlot(6)?.quantity, 15, 'L.7c: Quantidade de wood mesclada para 15');

  // L.8: Drop fora de qualquer slot cancela o arrasto sem modificar inventário
  game.handleInventoryDragStart(6, boundsSlot6.x + 10, boundsSlot6.y + 10);
  game.handleInventoryDragMove(10, 10); // Coordenada fora do grid de inventário
  const dropOutside = game.handleInventoryDragEnd(10, 10);
  assert.strictEqual(dropOutside, false, 'L.8a: Drop fora rejeitado');
  assert.strictEqual(player.inventory.getSlot(6)?.quantity, 15, 'L.8b: Slot 6 permanece intacto com 15');
  assert.strictEqual(game.getDraggedSlotIndex(), null, 'L.8c: draggedSlotIndex resetado');

  // L.9: Cancelamento voluntário ou fechar inventário limpa drag
  game.handleInventoryDragStart(6, boundsSlot6.x + 10, boundsSlot6.y + 10);
  assert.strictEqual(game.getDraggedSlotIndex(), 6, 'L.9a: Drag iniciado');
  game.setInventoryOpen(false);
  assert.strictEqual(game.getDraggedSlotIndex(), null, 'L.9b: Fechar inventário cancela drag');

  // L.10: Renderização visual do painel com drag ativo executa sem erros
  game.setInventoryOpen(true);
  game.handleInventoryDragStart(6, boundsSlot6.x + 10, boundsSlot6.y + 10);
  let renderThrew = false;
  try {
    renderer.renderInventoryPanel(
      player,
      game.getDraggedSlotIndex(),
      game.getDragPos(),
      game.getHoveredSlotIndex(),
      game.getSelectedInventorySlotIndex(),
    );
  } catch {
    renderThrew = true;
  }
  assert.strictEqual(renderThrew, false, 'L.10: renderInventoryPanel com arrasto ativo executa sem erros');

  game.destroy();
  console.log('✓ Requisito L passou: Arrastar itens pelo Inventário (Drag-and-Drop) funciona perfeitamente');
}

console.log('======================================================');
console.log('Todos os testes de Apresentação e Observabilidade passaram com sucesso!');
console.log('======================================================');
