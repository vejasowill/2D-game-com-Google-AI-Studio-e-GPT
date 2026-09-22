import { Biome } from './Biome.ts';
import { Inventory } from './Inventory.ts';
import { ItemDefinition } from './ItemDefinition.ts';
import { ItemDropObject } from './ItemDropObject.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { InteractionContext } from './InteractionTypes.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FALHA DE ASSERT] ${message}`);
    throw new Error(`[FALHA DE ASSERT] ${message}`);
  }
}

function assertThrows(fn: () => void, expectedSubstring?: string, label?: string): void {
  let threw = false;
  try {
    fn();
  } catch (err: unknown) {
    threw = true;
    if (expectedSubstring && err instanceof Error) {
      assert(
        err.message.includes(expectedSubstring),
        `Esperava erro contendo "${expectedSubstring}", recebeu: "${err.message}" (${label})`,
      );
    }
  }
  assert(threw, `Esperava lançamento de erro em: ${label ?? 'função'}`);
}

console.log('[TEST] Iniciando suíte de testes de Inventário e Coleta (A até Y)...');

// Preparar ambiente de teste
ItemRegistry.clear();

const woodDef: ItemDefinition = {
  id: 'wood',
  name: 'Madeira',
  description: 'Tronco de madeira.',
  maxStackSize: 99,
  category: 'material',
};

const stoneDef: ItemDefinition = {
  id: 'stone',
  name: 'Pedra',
  description: 'Pedra bruta.',
  maxStackSize: 50,
  category: 'material',
};

const rareDef: ItemDefinition = {
  id: 'rare_gem',
  name: 'Gema Rara',
  description: 'Gema valiosa e não empilhável.',
  maxStackSize: 1,
  category: 'valuable',
};

ItemRegistry.register(woodDef);
ItemRegistry.register(stoneDef);
ItemRegistry.register(rareDef);

// ============================================================================
// Teste A: Criação de inventário com número de slots correto e todos vazios (null)
// ============================================================================
{
  const inv = new Inventory(10);
  assert(inv.getSlotCount() === 10, 'A1: Deve ter 10 slots');
  assert(inv.isEmpty() === true, 'A2: Deve estar vazio');

  const slots = inv.getAllSlots();
  assert(slots.length === 10, 'A3: getAllSlots deve retornar 10 posições');
  for (let i = 0; i < 10; i++) {
    assert(inv.getSlot(i) === null, `A4: slot ${i} deve ser null`);
    assert(slots[i] === null, `A5: slots[${i}] deve ser null`);
  }
  console.log('✓ Teste A passou');
}

// ============================================================================
// Teste B: getItemCount retorna 0 para inventário vazio ou item inexistente
// ============================================================================
{
  const inv = new Inventory(5);
  assert(inv.getItemCount('wood') === 0, 'B1: wood deve ser 0');
  assert(inv.getItemCount('stone') === 0, 'B2: stone deve ser 0');
  assert(inv.getItemCount('inexistent') === 0, 'B3: inexistent deve ser 0');
  console.log('✓ Teste B passou');
}

// ============================================================================
// Teste C: isFull e isEmpty funcionam com vazio, parcialmente cheio e cheio
// ============================================================================
{
  const inv = new Inventory(2);
  assert(inv.isEmpty() === true, 'C1: inicialmente vazio');
  assert(inv.isFull() === false, 'C2: inicialmente não cheio');

  inv.addItemStack(createItemStack('wood', 10));
  assert(inv.isEmpty() === false, 'C3: com 1 item não é vazio');
  assert(inv.isFull() === false, 'C4: com 1 item em 2 slots não é cheio');

  inv.addItemStack(createItemStack('stone', 5));
  assert(inv.isEmpty() === false, 'C5: com 2 itens não é vazio');
  assert(inv.isFull() === true, 'C6: com 2 itens em 2 slots é cheio');
  console.log('✓ Teste C passou');
}

// ============================================================================
// Teste D: Adicionar item em inventário vazio ocupa o primeiro slot
// ============================================================================
{
  const inv = new Inventory(5);
  const result = inv.addItemStack(createItemStack('wood', 15));

  assert(result.added === 15, 'D1: added deve ser 15');
  assert(result.remainder === null, 'D2: remainder deve ser null');
  const slot0 = inv.getSlot(0);
  assert(slot0 !== null && slot0.itemId === 'wood' && slot0.quantity === 15, 'D3: slot 0 deve conter 15 wood');
  assert(inv.getSlot(1) === null, 'D4: slot 1 deve ser null');
  assert(inv.getItemCount('wood') === 15, 'D5: getItemCount deve ser 15');
  console.log('✓ Teste D passou');
}

// ============================================================================
// Teste E: Adicionar item com stack parcial do mesmo item mescla no stack existente
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 10));
  const result = inv.addItemStack(createItemStack('wood', 5));

  assert(result.added === 5, 'E1: added deve ser 5');
  assert(result.remainder === null, 'E2: remainder deve ser null');
  const slot0 = inv.getSlot(0);
  assert(slot0 !== null && slot0.itemId === 'wood' && slot0.quantity === 15, 'E3: slot 0 deve ter 15');
  assert(inv.getSlot(1) === null, 'E4: slot 1 continua null');
  console.log('✓ Teste E passou');
}

// ============================================================================
// Teste F: Adicionar excedente ao espaço do stack preenche e usa próximo slot
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 90));
  const result = inv.addItemStack(createItemStack('wood', 20));

  assert(result.added === 20, 'F1: added deve ser 20');
  assert(result.remainder === null, 'F2: remainder deve ser null');
  assert(inv.getSlot(0)?.quantity === 99, 'F3: slot 0 deve ter 99 (maxStackSize)');
  assert(inv.getSlot(1)?.quantity === 11, 'F4: slot 1 deve ter excedente 11');
  assert(inv.getItemCount('wood') === 110, 'F5: total deve ser 110');
  console.log('✓ Teste F passou');
}

// ============================================================================
// Teste G: Quantidade que excede maxStackSize divide corretamente entre múltiplos slots
// ============================================================================
{
  const inv = new Inventory(5);
  // stone maxStackSize é 50
  const result = inv.addItemStack(createItemStack('stone', 125, 200));

  assert(result.added === 125, 'G1: added deve ser 125');
  assert(result.remainder === null, 'G2: remainder deve ser null');
  assert(inv.getSlot(0)?.quantity === 50, 'G3: slot 0 tem 50');
  assert(inv.getSlot(1)?.quantity === 50, 'G4: slot 1 tem 50');
  assert(inv.getSlot(2)?.quantity === 25, 'G5: slot 2 tem 25');
  assert(inv.getSlot(3) === null, 'G6: slot 3 continua null');
  assert(inv.getItemCount('stone') === 125, 'G7: total é 125');
  console.log('✓ Teste G passou');
}

// ============================================================================
// Teste H: Adicionar item em inventário totalmente cheio não altera slots e retorna remainder
// ============================================================================
{
  const inv = new Inventory(2);
  inv.addItemStack(createItemStack('wood', 99));
  inv.addItemStack(createItemStack('stone', 50));
  assert(inv.isFull() === true, 'H1: cheio');

  const result = inv.addItemStack(createItemStack('rare_gem', 1));
  assert(result.added === 0, 'H2: added deve ser 0');
  assert(result.remainder !== null && result.remainder.itemId === 'rare_gem' && result.remainder.quantity === 1, 'H3: remainder é 1 gem');
  assert(inv.getItemCount('rare_gem') === 0, 'H4: gem count continua 0');
  console.log('✓ Teste H passou');
}

// ============================================================================
// Teste I: Adicionar com espaço parcial adiciona o máximo possível e retorna remainder
// ============================================================================
{
  const inv = new Inventory(2);
  inv.addItemStack(createItemStack('wood', 90));
  inv.addItemStack(createItemStack('stone', 50));

  const result = inv.addItemStack(createItemStack('wood', 25));
  assert(result.added === 9, 'I1: deve ter adicionado 9');
  assert(result.remainder !== null && result.remainder.quantity === 16, 'I2: sobra deve ser 16');
  assert(inv.getSlot(0)?.quantity === 99, 'I3: slot 0 agora está em 99');
  assert(inv.getItemCount('wood') === 99, 'I4: total de madeira é 99');
  console.log('✓ Teste I passou');
}

// ============================================================================
// Teste J: addItemStack respeita maxStackSize definido pelo ItemRegistry
// ============================================================================
{
  const inv = new Inventory(5);
  // rare_gem maxStackSize = 1
  inv.addItemStack(createItemStack('rare_gem', 1));
  inv.addItemStack(createItemStack('rare_gem', 1));

  assert(inv.getSlot(0)?.quantity === 1, 'J1: slot 0 tem 1 gem');
  assert(inv.getSlot(1)?.quantity === 1, 'J2: slot 1 tem 1 gem');
  assert(inv.getItemCount('rare_gem') === 2, 'J3: total é 2 gems em 2 slots');
  console.log('✓ Teste J passou');
}

// ============================================================================
// Teste K: removeItem reduz slots e zera slots esvaziados (torna null)
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 10));

  const result = inv.removeItem('wood', 10);
  assert(result.removed === 10, 'K1: removed deve ser 10');
  assert(result.remainingNeeded === 0, 'K2: remainingNeeded deve ser 0');
  assert(inv.getSlot(0) === null, 'K3: slot 0 deve ter se tornado null');
  assert(inv.getItemCount('wood') === 0, 'K4: count deve ser 0');
  assert(inv.isEmpty() === true, 'K5: inv deve estar vazio');
  console.log('✓ Teste K passou');
}

// ============================================================================
// Teste L: removeItem através de múltiplos slots consome ordenadamente
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 99));
  inv.addItemStack(createItemStack('wood', 20));

  const result = inv.removeItem('wood', 105);
  assert(result.removed === 105, 'L1: removed deve ser 105');
  assert(result.remainingNeeded === 0, 'L2: remainingNeeded deve ser 0');
  assert(inv.getSlot(0) === null, 'L3: primeiro slot esvaziado (null)');
  assert(inv.getSlot(1)?.quantity === 14, 'L4: segundo slot restou 14');
  assert(inv.getItemCount('wood') === 14, 'L5: total é 14');
  console.log('✓ Teste L passou');
}

// ============================================================================
// Teste M: removeItem com quantidade maior que disponível remove tudo e retorna remainingNeeded
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 15));

  const result = inv.removeItem('wood', 40);
  assert(result.removed === 15, 'M1: removed deve ser 15');
  assert(result.remainingNeeded === 25, 'M2: remainingNeeded deve ser 25');
  assert(inv.getSlot(0) === null, 'M3: slot 0 esvaziado');
  assert(inv.getItemCount('wood') === 0, 'M4: total é 0');
  console.log('✓ Teste M passou');
}

// ============================================================================
// Teste N: removeSlotItem remove quantidade específica de slot preservando restante
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 50));

  const result = inv.removeSlotItem(0, 20);
  assert(result.removedStack?.quantity === 20, 'N1: removedStack deve ser 20');
  assert(result.remainingInSlot?.quantity === 30, 'N2: remainingInSlot deve ser 30');
  assert(inv.getSlot(0)?.quantity === 30, 'N3: slot 0 deve ter 30');
  console.log('✓ Teste N passou');
}

// ============================================================================
// Teste O: removeSlotItem com quantidade >= slot.quantity limpa o slot (torna null)
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 50));

  const result = inv.removeSlotItem(0, 50);
  assert(result.removedStack?.quantity === 50, 'O1: removedStack deve ter 50');
  assert(result.remainingInSlot === null, 'O2: remainingInSlot deve ser null');
  assert(inv.getSlot(0) === null, 'O3: slot 0 deve ser null');
  console.log('✓ Teste O passou');
}

// ============================================================================
// Teste P: swapSlots troca o conteúdo de dois slots com itens diferentes ou com vazio
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 10));
  inv.addItemStack(createItemStack('stone', 25));

  const ok1 = inv.swapSlots(0, 1);
  assert(ok1 === true, 'P1: swapSlots retornou true');
  assert(inv.getSlot(0)?.itemId === 'stone', 'P2: slot 0 agora é pedra');
  assert(inv.getSlot(1)?.itemId === 'wood', 'P3: slot 1 agora é madeira');

  const ok2 = inv.swapSlots(1, 2);
  assert(ok2 === true, 'P4: swapSlots com vazio retornou true');
  assert(inv.getSlot(1) === null, 'P5: slot 1 ficou null');
  assert(inv.getSlot(2)?.itemId === 'wood', 'P6: slot 2 agora é madeira');
  console.log('✓ Teste P passou');
}

// ============================================================================
// Teste Q: swapSlots com mesmo item tenta mesclá-los até maxStackSize
// ============================================================================
{
  const inv = new Inventory(5);
  // stone maxStackSize = 50
  inv.setSlot(0, createItemStack('stone', 30));
  inv.setSlot(1, createItemStack('stone', 35));

  const merged = inv.swapSlots(0, 1);
  assert(merged === true, 'Q1: swapSlots retornou true');
  assert(inv.getSlot(1)?.quantity === 50, 'Q2: slot 1 atingiu maxStackSize de 50');
  assert(inv.getSlot(0)?.quantity === 15, 'Q3: slot 0 ficou com a sobra de 15');
  console.log('✓ Teste Q passou');
}

// ============================================================================
// Teste R: splitSlot divide um stack e move para outro slot
// ============================================================================
{
  const inv = new Inventory(5);
  inv.setSlot(0, createItemStack('wood', 40));

  const ok1 = inv.splitSlot(0, 15, 1);
  assert(ok1 === true, 'R1: splitSlot retornou true');
  assert(inv.getSlot(0)?.quantity === 25, 'R2: slot 0 ficou com 25');
  assert(inv.getSlot(1)?.quantity === 15, 'R3: slot 1 recebeu 15');

  const ok2 = inv.splitSlot(0, 10, 1);
  assert(ok2 === true, 'R4: splitSlot com mesmo item retornou true');
  assert(inv.getSlot(0)?.quantity === 15, 'R5: slot 0 ficou com 15');
  assert(inv.getSlot(1)?.quantity === 25, 'R6: slot 1 agora tem 25');
  console.log('✓ Teste R passou');
}

// ============================================================================
// Teste S: clear esvazia todos os slots do inventário
// ============================================================================
{
  const inv = new Inventory(5);
  inv.addItemStack(createItemStack('wood', 10));
  inv.addItemStack(createItemStack('stone', 20));
  assert(inv.isEmpty() === false, 'S1: inicialmente com itens');

  inv.clear();
  assert(inv.isEmpty() === true, 'S2: isEmpty deve ser true');
  assert(inv.getItemCount('wood') === 0, 'S3: wood count é 0');
  assert(inv.getItemCount('stone') === 0, 'S4: stone count é 0');
  console.log('✓ Teste S passou');
}

// ============================================================================
// Teste T: Player possui um Inventory funcional inicializado
// ============================================================================
{
  const player = new Player({ worldX: 0, worldY: 0 });
  assert(player.inventory instanceof Inventory, 'T1: player.inventory é instância de Inventory');
  assert(player.inventory.getSlotCount() > 0, 'T2: slotCount > 0');
  assert(player.inventory.isEmpty() === true, 'T3: inicialmente vazio');

  player.inventory.addItemStack(createItemStack('wood', 5));
  assert(player.inventory.getItemCount('wood') === 5, 'T4: player.inventory recebeu madeira');
  console.log('✓ Teste T passou');
}

// ============================================================================
// Teste U: ItemDropObject possui type 'item_drop', interaction 'collect' e state
// ============================================================================
{
  const drop = new ItemDropObject('drop_test_1', { worldX: 100, worldY: 100 }, 'wood', 4);
  assert(drop.id === 'drop_test_1', 'U1: id correto');
  assert(drop.type === 'item_drop', 'U2: type é item_drop');
  assert(drop.itemId === 'wood', 'U3: itemId é wood');
  assert(drop.quantity === 4, 'U4: quantity é 4');
  assert(drop.interaction.id === 'collect', 'U5: interaction id é collect');
  assert(drop.interaction.label === 'Coletar', 'U6: label é Coletar');
  console.log('✓ Teste U passou');
}

// ============================================================================
// Teste V: Interagir com ItemDropObject com espaço coleta tudo e gera remove_object
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 50, worldY: 50 });
  const drop = new ItemDropObject('drop_wood_1', { worldX: 60, worldY: 50 }, 'wood', 5);

  world.getObjectManager().addObject(drop);
  assert(world.getObjectManager().hasObject('drop_wood_1') === true, 'V1: drop adicionado ao mundo');

  const context: InteractionContext = {
    player,
    world,
    object: drop,
  };

  const result = drop.interact(context);
  assert(result.success === true, 'V2: sucesso na coleta');
  assert(result.message?.includes('Madeira +5') === true, 'V3: mensagem correta');
  assert(result.mutations?.length === 1, 'V4: 1 mutação');
  assert(result.mutations?.[0].type === 'remove_object', 'V5: mutação é remove_object');

  WorldMutationHandler.applyInteractionResult(world, drop, result);

  assert(player.inventory.getItemCount('wood') === 5, 'V6: madeira no inventário do Player');
  assert(world.getObjectManager().hasObject('drop_wood_1') === false, 'V7: drop removido do mundo');
  console.log('✓ Teste V passou');
}

// ============================================================================
// Teste W: Interagir com espaço parcial consome parte e gera update_state
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 0, worldY: 0 }, undefined, undefined, 1);
  // Preenche 95 madeiras no único slot (maxStackSize = 99, só cabem 4)
  player.inventory.addItemStack(createItemStack('wood', 95));

  const drop = new ItemDropObject('drop_wood_big', { worldX: 10, worldY: 10 }, 'wood', 10);
  world.getObjectManager().addObject(drop);

  const context: InteractionContext = {
    player,
    world,
    object: drop,
  };

  const result = drop.interact(context);
  assert(result.success === true, 'W1: coleta parcial com sucesso');
  assert(result.message?.includes('Madeira +4') === true, 'W2: mensagem informa +4');
  assert(result.mutations?.length === 1, 'W3: 1 mutação');
  assert(result.mutations?.[0].type === 'update_state', 'W4: mutação é update_state');

  WorldMutationHandler.applyInteractionResult(world, drop, result);

  assert(player.inventory.getItemCount('wood') === 99, 'W5: Player atingiu 99 de madeira');
  assert(world.getObjectManager().hasObject('drop_wood_big') === true, 'W6: drop continua no mundo');
  const dropState = world.getObjectManager().getObjectState('drop_wood_big') as { quantity: number };
  assert(dropState.quantity === 6, 'W7: drop restou com 6 madeiras');
  console.log('✓ Teste W passou');
}

// ============================================================================
// Teste X: Interagir com inventário cheio retorna success: false sem mutações
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 0, worldY: 0 }, undefined, undefined, 1);
  // Ocupa o único slot com pedra
  player.inventory.addItemStack(createItemStack('stone', 50));
  assert(player.inventory.isFull() === true, 'X1: inventário cheio');

  const drop = new ItemDropObject('drop_wood_blocked', { worldX: 10, worldY: 10 }, 'wood', 3);
  world.getObjectManager().addObject(drop);

  const context: InteractionContext = {
    player,
    world,
    object: drop,
  };

  const result = drop.interact(context);
  assert(result.success === false, 'X2: interact retorna false');
  assert(result.message === 'Inventário cheio!', 'X3: mensagem de inventário cheio');
  assert(result.mutations === undefined, 'X4: sem mutações');
  assert(world.getObjectManager().hasObject('drop_wood_blocked') === true, 'X5: drop continua no mundo');
  assert(player.inventory.getItemCount('wood') === 0, 'X6: madeira continua 0');
  console.log('✓ Teste X passou');
}

// ============================================================================
// Teste Y: Ciclo completo (Árvore -> Drop determinístico -> Coleta -> Inventário)
// ============================================================================
{
  const world = new World(42);
  const player = new Player({ worldX: 100, worldY: 100 });

  const tree = new NaturalTreeObject(
    'natural:tree:10:10',
    { worldX: 100, worldY: 100 },
    32,
    48,
    Biome.FOREST,
    10,
    10,
    0,
  );

  world.getObjectManager().addObject(tree);

  // 1. Interação com a árvore: sacudir galhos
  const treeContext: InteractionContext = {
    player,
    world,
    object: tree,
  };

  const shakeResult = tree.interact(treeContext);
  assert(shakeResult.success === true, 'Y1: árvore sacudida com sucesso');
  assert(shakeResult.message?.includes('Galhos de madeira caíram') === true, 'Y2: feedback da árvore');
  assert(shakeResult.mutations?.length === 1, 'Y3: mutação de criação do drop');

  // Aplicar mutações
  WorldMutationHandler.applyInteractionResult(world, tree, shakeResult);

  // Drop materializado no mundo
  const dropId = 'drop:wood:10:10';
  const dropObj = world.getObjectManager().getObjectById(dropId) as ItemDropObject;
  assert(dropObj !== null, 'Y4: drop de madeira existe no mundo');
  assert(dropObj.itemId === 'wood', 'Y5: itemId é wood');
  assert(dropObj.quantity === 3, 'Y6: quantity é 3');

  // 2. Interação subsequente na árvore não duplica drop
  const secondShake = tree.interact(treeContext);
  assert(secondShake.success === true, 'Y7: segunda interação tratada');
  assert(secondShake.message?.includes('Nenhum galho solto') === true, 'Y8: galhos já soltos');
  assert(secondShake.mutations === undefined, 'Y9: sem mutações na segunda tentativa');

  // 3. Coleta do drop pelo Player
  const dropContext: InteractionContext = {
    player,
    world,
    object: dropObj,
  };

  const collectResult = dropObj.interact(dropContext);
  assert(collectResult.success === true, 'Y10: coleta executada');
  assert(collectResult.message?.includes('Madeira +3') === true, 'Y11: mensagem de feedback do item');

  WorldMutationHandler.applyInteractionResult(world, dropObj, collectResult);

  // 4. Verificação final do ciclo
  assert(world.getObjectManager().hasObject(dropId) === false, 'Y12: drop removido do mundo');
  assert(player.inventory.getItemCount('wood') === 3, 'Y13: 3 madeiras no inventário');
  assert(player.inventory.getSlot(0)?.quantity === 3, 'Y14: slot 0 tem 3 madeiras');

  console.log('✓ Teste Y passou');
}

console.log('Todos os 25 testes (A até Y) da suíte de Inventário e Coleta foram concluídos com sucesso!');
