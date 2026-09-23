import assert from 'node:assert';
import { Biome } from './Biome.ts';
import { createItemStack } from './ItemStack.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { Player, PlayerActionState, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { DEFAULT_ITEM_DROP_TTL } from './constants.ts';

console.log('--- Iniciando Testes da Primeira Vertical Slice (Axe → Tree → Wood → Inventory) ---');

// Inicializa o registro de itens
ItemRegistry.ensureInitialized();

// ============================================================================
// 1. INFRAESTRUTURA DE ESTADOS DE AÇÃO E ANIMAÇÃO DO PLAYER
// ============================================================================
{
  const player = new Player({ worldX: 200, worldY: 200 });
  const originalSize = player.size;

  // Repouso inicial: deve estar em IDLE
  assert.strictEqual(player.getActionState(), PlayerActionState.IDLE, 'Player em repouso deve ter estado IDLE');
  assert.strictEqual(player.getActiveAction(), null, 'Player em IDLE não deve ter ação ativa');

  // Disparo de ação de corte com machado
  player.direction = PlayerDirection.DOWN;
  player.startAction('chop', 'axe', 0.4);

  assert.strictEqual(player.getActionState(), PlayerActionState.USE_ITEM, 'Player disparando golpe deve estar em USE_ITEM');
  assert.strictEqual(player.isUsingItem, true, 'isUsingItem deve ser true durante a ação');

  const action = player.getActiveAction();
  assert(action !== null, 'activeAction deve estar preenchida');
  assert.strictEqual(action?.action, 'chop', 'Ação deve ser "chop"');
  assert.strictEqual(action?.itemId, 'axe', 'Item deve ser "axe"');
  assert.strictEqual(action?.duration, 0.4, 'Duração deve ser 0.4s');
  assert.strictEqual(action?.elapsedTime, 0, 'Tempo inicial deve ser 0');
  assert.strictEqual(action?.progress, 0, 'Progresso inicial deve ser 0');
  assert.strictEqual(action?.direction, PlayerDirection.DOWN, 'Direção inicial da ação deve ser DOWN');

  // CRÍTICO: A hitbox nunca pode ser alterada
  assert.strictEqual(player.size, originalSize, 'Hitbox física (player.size) JAMAIS deve ser alterada por ações');

  // Simular avanço de metade do tempo (0.2s)
  const dummyInput = {
    getMovementDirection: () => ({ x: 0, y: 0 }),
    isInteractPressed: () => false,
    isUseItemPressed: () => false,
    getHotbarSlotSelection: () => null,
    isNextHotbarSlotPressed: () => false,
    isPreviousHotbarSlotPressed: () => false,
  };
  const dummyCollision = {
    movePlayer: () => {},
  } as any;

  player.update(0.2, dummyInput, dummyCollision);

  assert.strictEqual(player.getActionState(), PlayerActionState.USE_ITEM, 'Ainda deve estar em USE_ITEM na metade da ação');
  const midAction = player.getActiveAction();
  assert(midAction !== null, 'Ação ainda deve existir');
  assert.strictEqual(midAction?.elapsedTime, 0.2, 'Tempo decorrido deve ser 0.2s');
  assert(Math.abs(midAction!.progress - 0.5) < 1e-4, 'Progresso deve ser 0.5 (50%)');

  // Simular tentativa de rotação durante o golpe: a direção do golpe deve permanecer travada
  const turningInput = {
    getMovementDirection: () => ({ x: 1, y: 0 }),
    isInteractPressed: () => false,
    isUseItemPressed: () => false,
    getHotbarSlotSelection: () => null,
    isNextHotbarSlotPressed: () => false,
    isPreviousHotbarSlotPressed: () => false,
  };
  player.update(0.1, turningInput, dummyCollision);
  assert.strictEqual(player.direction, PlayerDirection.DOWN, 'Direção deve permanecer travada na direção da ação durante o golpe');

  // Finalizar a ação (mais 0.15s => total 0.45s > 0.4s)
  player.update(0.15, dummyInput, dummyCollision);
  assert.strictEqual(player.getActionState(), PlayerActionState.IDLE, 'Ação concluída deve retornar para IDLE');
  assert.strictEqual(player.getActiveAction(), null, 'activeAction deve ser null após o término');
  assert.strictEqual(player.isUsingItem, false, 'isUsingItem deve ser false após o término');
  assert.strictEqual(player.size, originalSize, 'Hitbox física permanece rigorosamente inalterada');

  console.log('✓ 1. Infraestrutura de estados de ação, progresso temporal e desacoplamento de hitbox validados');
}

// ============================================================================
// 2. ESTADO TIPADO DA ÁRVORE (TreeState / LifeStage)
// ============================================================================
{
  const tree = new NaturalTreeObject(
    'tree_state_test',
    { worldX: 100, worldY: 100 },
    24,
    32,
    Biome.FOREST,
    5,
    5,
    0,
  );

  assert.strictEqual(tree.isChopped, false, 'Árvore recém-criada não deve estar cortada');
  assert.strictEqual(tree.isHarvested, false, 'Árvore recém-criada não deve estar colhida');
  assert.strictEqual(tree.getStage(), 'intact', 'Estágio inicial deve ser "intact"');
  assert.strictEqual(tree.canInteract(), true, 'Árvore intacta deve aceitar interação (sacudir)');
  assert.strictEqual(tree.canReceiveAction('chop'), true, 'Árvore intacta deve aceitar ação "chop"');

  const treeState = tree.getTreeState();
  assert.strictEqual(treeState.chopped, false);
  assert.strictEqual(treeState.harvested, false);

  console.log('✓ 2. Estado tipado da árvore (TreeState e estágios de vida) validado');
}

// ============================================================================
// 3. FLUXO COMPLETO DA PRIMEIRA VERTICAL SLICE: MACHADO → ÁRVORE → DROP → INVENTÁRIO
// ============================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem(40, 0.5);

  // A. Equipar machado na hotbar
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);
  assert.strictEqual(player.getEquippedItem()?.itemId, 'axe', 'Machado deve estar equipado');

  // B. Criar árvore intacta logo à frente do Player (ao sul / DOWN)
  const tree = new NaturalTreeObject(
    'tree_slice_main',
    { worldX: 96, worldY: 118 },
    24,
    32,
    Biome.FOREST,
    12,
    14,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  // C. Usar machado na árvore
  const chopResult = itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(chopResult.success, true, 'Uso do machado deve ter sucesso');
  assert.strictEqual(chopResult.action, 'chop', 'Ação executada deve ser "chop"');
  assert.strictEqual(chopResult.code, 'tree_chopped', 'Código de resultado deve ser "tree_chopped"');

  // D. Verificar alteração determinística de estado da árvore
  assert.strictEqual(tree.isChopped, true, 'Árvore deve passar para o estado isChopped === true');
  assert.strictEqual(tree.getStage(), 'stump', 'Estágio visual e lógico da árvore deve ser "stump"');
  assert.strictEqual(tree.canInteract(), false, 'Toco remanescente não deve aceitar interação (sacudir)');
  assert.strictEqual(tree.canReceiveAction('chop'), false, 'Toco remanescente não deve aceitar novo corte');

  // E. Verificar geração determinística do drop de madeira no mundo
  const expectedDropId = `drop:wood:chop:12:14`;
  const dropObj = world.getObjectManager().getObjectById(expectedDropId);
  assert(dropObj !== null, 'Drop de madeira deve ter sido criado no mundo');
  assert.strictEqual(dropObj?.type, 'item_drop', 'Tipo do objeto deve ser "item_drop"');
  assert.strictEqual((dropObj?.state as any)?.itemId, 'wood', 'Drop deve conter "wood"');
  assert.strictEqual((dropObj?.state as any)?.quantity, 3, 'Drop deve conter exatamente 3 madeiras');

  // F. Verificar registro automático no TemporaryObjectSystem
  const tempSystem = world.getTemporaryObjectSystem();
  assert.strictEqual(tempSystem.isTracking(expectedDropId), true, 'Drop deve estar registrado no TemporaryObjectSystem');
  const remainingTtl = tempSystem.getRemainingTtl(expectedDropId);
  assert(remainingTtl !== null && remainingTtl <= DEFAULT_ITEM_DROP_TTL, 'TTL deve ser <= DEFAULT_ITEM_DROP_TTL');

  // G. Jogador coleta o drop de madeira via interação
  const interactionSystem = new InteractionSystem(48);
  assert.strictEqual(player.inventory.getItemCount('wood'), 0, 'Inventário não deve ter madeira antes da coleta');
  const interactResult = interactionSystem.executeInteraction(player, world, dropObj as any);

  assert(interactResult !== null, 'Coleta do drop deve retornar resultado');
  assert.strictEqual(interactResult?.success, true, 'Coleta do drop deve ter sucesso');
  assert.strictEqual(player.inventory.getItemCount('wood'), 3, 'Jogador deve ter coletado exatamente 3 madeiras');

  // H. O drop deve ter sido removido do mundo e desregistrado do TemporaryObjectSystem
  assert.strictEqual(world.getObjectManager().getObjectById(expectedDropId), null, 'Drop coletado deve sumir do mundo');
  assert.strictEqual(tempSystem.isTracking(expectedDropId), false, 'Drop coletado deve ser desregistrado do TemporaryObjectSystem');

  console.log('✓ 3. Fluxo completo da primeira vertical slice (Machado → Árvore → Drop → Inventário) validado');
}

// ============================================================================
// 4. IDEMPOTÊNCIA E PREVENÇÃO DE DUPLICAÇÃO DE CORTE
// ============================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem(40, 0.5);

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  // Árvore pré-cortada
  const tree = new NaturalTreeObject(
    'tree_chopped_test',
    { worldX: 100, worldY: 118 },
    24,
    32,
    Biome.FOREST,
    8,
    8,
    0,
    Object.freeze({ chopped: true, harvested: false }),
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  // Tentativa de cortar árvore que já foi cortada
  const repeatChop = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(repeatChop.success, false, 'Cortar árvore já cortada deve falhar');
  assert.strictEqual(repeatChop.code, 'no_target', 'Alvo já cortado não deve ser aceito como alvo de chop');

  // Chamada direta do método receiveAction para garantir idempotência interna
  const directAction = tree.receiveAction('chop', {
    equippedItem: player.getEquippedItem()!,
    action: 'chop',
    player,
    world,
  });
  assert.strictEqual(directAction.success, false, 'receiveAction em árvore cortada deve falhar');
  assert.strictEqual(directAction.code, 'already_chopped', 'Código deve ser already_chopped');
  assert.strictEqual(directAction.mutations, undefined, 'Nenhuma mutação/drop deve ser gerada');

  console.log('✓ 4. Idempotência absoluta e prevenção contra duplicação de drops validadas');
}

// ============================================================================
// 5. COMPORTAMENTO COM INVENTÁRIO CHEIO E COLETA PARCIAL
// ============================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem(40, 0.5);

  // Equipar machado no slot 0
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  // Preencher todos os outros slots com pedras (inventário totalmente cheio)
  for (let i = 1; i < player.inventory.getSlotCount(); i++) {
    player.inventory.addItemStack(createItemStack('stone', 99));
  }
  assert.strictEqual(player.inventory.isFull(), true, 'Inventário deve estar completamente lotado');

  // Cortar a árvore
  const tree = new NaturalTreeObject(
    'tree_full_inv',
    { worldX: 100, worldY: 118 },
    24,
    32,
    Biome.FOREST,
    20,
    20,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  const chopResult = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(chopResult.success, true, 'O corte da árvore funciona mesmo com inventário cheio');

  const dropId = `drop:wood:chop:20:20`;
  const dropObj = world.getObjectManager().getObjectById(dropId);
  assert(dropObj !== null, 'Drop de madeira cai no chão mesmo com inventário cheio');

  // Tentativa de coleta com inventário cheio
  const interactionSystem = new InteractionSystem(48);
  const fullCollectResult = interactionSystem.executeInteraction(player, world, dropObj as any);
  assert(fullCollectResult !== null, 'Tentativa de coleta com inventário cheio deve retornar resultado');
  assert.strictEqual(fullCollectResult?.success, false, 'Coleta deve falhar se o inventário estiver cheio');
  assert.strictEqual(fullCollectResult?.message, 'Inventário cheio!', 'Mensagem clara de inventário cheio');
  assert(world.getObjectManager().getObjectById(dropId) !== null, 'Drop NÃO deve ser destruído se o inventário estiver cheio');
  assert.strictEqual((dropObj as any).quantity, 3, 'Drop mantém exatamente sua quantidade de 3 madeiras');

  // Liberar 1 vaga com capacidade para apenas 1 madeira (stack de 98 madeiras, com maxStackSize = 99)
  player.inventory.clearSlot(1);
  player.inventory.setSlot(1, createItemStack('wood', 98));

  // Coleta parcial: o jogador só consegue pegar 1 madeira (para chegar a 99)
  const partialCollectResult = interactionSystem.executeInteraction(player, world, dropObj as any);

  assert(partialCollectResult !== null, 'Coleta parcial deve retornar resultado');
  assert.strictEqual(partialCollectResult?.success, true, 'Coleta parcial deve ter sucesso');
  assert.strictEqual(player.inventory.getItemCount('wood'), 99, 'Slot de madeira atingiu o limite de 99');
  assert.strictEqual((dropObj as any).quantity, 2, 'Drop deve permanecer no mundo com 2 madeiras restantes');
  assert(world.getObjectManager().getObjectById(dropId) !== null, 'Drop permanece no mundo na coleta parcial');

  console.log('✓ 5. Comportamento determinístico com inventário cheio e coleta parcial validado');
}

// ============================================================================
// 6. CICLO DE VIDA E EXPIRAÇÃO POR TTL DO DROP NÃO COLETADO
// ============================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem(40, 0.5);

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'tree_ttl_test',
    { worldX: 100, worldY: 118 },
    24,
    32,
    Biome.FOREST,
    33,
    33,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  itemUseSystem.useEquippedItem(player, world);

  const dropId = `drop:wood:chop:33:33`;
  assert(world.getObjectManager().getObjectById(dropId) !== null, 'Drop criado');
  assert.strictEqual(world.getTemporaryObjectSystem().isTracking(dropId), true, 'Drop registrado no TemporaryObjectSystem');

  // Avançar o tempo quase até o fim do TTL (299 segundos)
  world.update(299.0);
  assert(world.getObjectManager().getObjectById(dropId) !== null, 'Drop ainda existe aos 299s (TTL = 300s)');
  assert.strictEqual(world.getTemporaryObjectSystem().isTracking(dropId), true, 'Drop ainda registrado aos 299s');

  // Avançar além do TTL (+2 segundos => total 301s > 300s)
  world.update(2.0);
  assert.strictEqual(world.getObjectManager().getObjectById(dropId), null, 'Drop expirado deve ser removido do mundo');
  assert.strictEqual(world.getTemporaryObjectSystem().isTracking(dropId), false, 'Drop expirado deve ser desregistrado do lifecycle');

  console.log('✓ 6. Expiração determinística do drop por TTL no TemporaryObjectSystem validada');
}

console.log('\n===================================================================');
console.log('TODOS OS REQUISITOS DA PRIMEIRA VERTICAL SLICE FORAM 100% APROVADOS!');
console.log('===================================================================\n');
