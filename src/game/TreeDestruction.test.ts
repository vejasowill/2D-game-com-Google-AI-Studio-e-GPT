import assert from 'node:assert';
import { Biome } from './Biome.ts';
import { ChunkManager } from './ChunkManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { DEFAULT_ITEM_DROP_TTL, TILE_SIZE } from './constants.ts';
import { DestroyedNaturalObjectRegistry } from './DestroyedNaturalObjectRegistry.ts';
import { ItemDropObject } from './ItemDropObject.ts';
import { createItemStack } from './ItemStack.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { NaturalObjectGenerator } from './NaturalObjectGenerator.ts';
import { NaturalObjectType } from './NaturalObjectDefinition.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';

console.log('--- Iniciando Testes de Destruição Permanente de Árvores e Objetos Naturais (A até T) ---');

// ============================================================================
// REQUISITO A: Árvore intacta existe normalmente
// ============================================================================
{
  const world = new World(12345);
  const tree = new NaturalTreeObject(
    'natural:tree:10:10',
    { worldX: 10 * TILE_SIZE, worldY: 10 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    10,
    10,
    0,
  );
  world.getObjectManager().addObject(tree);

  const found = world.getObjectManager().getObjectById('natural:tree:10:10');
  assert(found !== null, 'Requisito A: Árvore intacta deve existir no WorldObjectManager');
  assert.strictEqual(found?.type, 'tree', 'Requisito A: Tipo deve ser "tree"');
  assert.strictEqual(tree.isDestroyed, false, 'Requisito A: Árvore intacta não deve estar destruída');
  assert.strictEqual(tree.isChopped, false, 'Requisito A: isChopped deve ser false');
  assert.strictEqual(tree.getStage(), 'intact', 'Requisito A: Estágio inicial deve ser "intact"');
  assert.strictEqual(tree.canReceiveAction('chop'), true, 'Requisito A: Árvore intacta deve aceitar ação chop');
  console.log('✓ Requisito A passou: Árvore intacta existe normalmente');
}

// ============================================================================
// REQUISITO B: Machado corta árvore válida
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 10 * TILE_SIZE + 6, worldY: 10 * TILE_SIZE - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'natural:tree:10:10',
    { worldX: 10 * TILE_SIZE, worldY: 10 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    10,
    10,
    0,
  );
  world.getObjectManager().addObject(tree);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  const result = itemUseSystem.useEquippedItem(player, world);

  assert(result !== null, 'Requisito B: useEquippedItem deve produzir resultado');
  assert.strictEqual(result.success, true, 'Requisito B: Corte com machado deve ter sucesso');
  assert.strictEqual(result.action, 'chop', 'Requisito B: Ação deve ser "chop"');
  assert.strictEqual(result.code, 'tree_chopped', 'Requisito B: Código deve ser "tree_chopped"');
  console.log('✓ Requisito B passou: Machado corta árvore válida');
}

// ============================================================================
// REQUISITO C: Corte remove completamente a árvore do WorldObjectManager
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 80 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const treeId = 'natural:tree:8:8';
  const tree = new NaturalTreeObject(
    treeId,
    { worldX: 100, worldY: 100 },
    28,
    38,
    Biome.FOREST,
    8,
    8,
    0,
  );
  world.getObjectManager().addObject(tree);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  // A árvore deve ter sido removida do WorldObjectManager
  assert.strictEqual(
    world.getObjectManager().getObjectById(treeId),
    null,
    'Requisito C: Árvore cortada não deve mais existir no WorldObjectManager',
  );

  const areaObjs = world.getObjectManager().getObjectsInArea(90, 90, 50, 50);
  assert.strictEqual(
    areaObjs.some((o) => o.id === treeId),
    false,
    'Requisito C: getObjectsInArea não deve conter a árvore cortada',
  );
  console.log('✓ Requisito C passou: Corte remove completamente a árvore do WorldObjectManager');
}

// ============================================================================
// REQUISITO D: Depois do corte, não existe colisão da árvore
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 200, worldY: 180 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'natural:tree:12:12',
    { worldX: 200, worldY: 200 },
    28,
    38,
    Biome.FOREST,
    12,
    12,
    0,
  );
  world.getObjectManager().addObject(tree);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  // Objetos na área da árvore não existem mais
  const objectsInTreeArea = world
    .getObjectManager()
    .getObjectsInArea(200, 200, 28, 38);
  assert.strictEqual(
    objectsInTreeArea.length,
    0,
    'Requisito D: Não deve haver nenhum objeto na área da árvore destruída',
  );

  // O jogador pode ocupar livremente o espaço
  const collision = new CollisionSystem(world);
  // Carrega os tiles sob a posição para validação no CollisionSystem
  world.getTile(Math.floor(200 / TILE_SIZE), Math.floor(200 / TILE_SIZE));
  const canOccupy = collision.canOccupyArea(200, 200, player.size, player.size);
  assert.strictEqual(canOccupy, true, 'Requisito D: Não deve haver colisão após a árvore ser destruída');
  console.log('✓ Requisito D passou: Depois do corte, não existe colisão da árvore');
}

// ============================================================================
// REQUISITO E: Depois do corte, árvore não pode mais ser alvo de interação
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 80 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'natural:tree:5:5',
    { worldX: 100, worldY: 100 },
    28,
    38,
    Biome.FOREST,
    5,
    5,
    0,
  );
  world.getObjectManager().addObject(tree);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);
  itemUseSystem.resetCooldown();

  assert.strictEqual(tree.canInteract(), false, 'Requisito E: Árvore destruída não pode interagir');
  assert.strictEqual(tree.canReceiveAction('chop'), false, 'Requisito E: Árvore destruída não recebe chop');

  // Segundo corte na mesma posição não deve encontrar alvo
  const secondUse = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(secondUse.success, false, 'Requisito E: Segundo corte deve falhar');
  assert.strictEqual(secondUse.code, 'no_target', 'Requisito E: Nenhum alvo deve ser encontrado');
  console.log('✓ Requisito E passou: Depois do corte, árvore não pode mais ser alvo de interação');
}

// ============================================================================
// REQUISITO F: O drop de madeira continua sendo criado
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 150, worldY: 130 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'natural:tree:15:15',
    { worldX: 150, worldY: 150 },
    28,
    38,
    Biome.FOREST,
    15,
    15,
    0,
  );
  world.getObjectManager().addObject(tree);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  const expectedDropId = 'drop:wood:chop:15:15';
  const drop = world.getObjectManager().getObjectById(expectedDropId) as ItemDropObject;
  assert(drop !== null, 'Requisito F: Drop de madeira deve ser criado');
  assert.strictEqual(drop.itemId, 'wood', 'Requisito F: Item deve ser "wood"');
  assert.strictEqual(drop.quantity, 3, 'Requisito F: Quantidade deve ser 3');
  console.log('✓ Requisito F passou: O drop de madeira continua sendo criado');
}

// ============================================================================
// REQUISITO G: O drop mantém seu TTL correto
// ============================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 150, worldY: 130 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'natural:tree:15:15',
    { worldX: 150, worldY: 150 },
    28,
    38,
    Biome.FOREST,
    15,
    15,
    0,
  );
  world.getObjectManager().addObject(tree);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  const dropId = 'drop:wood:chop:15:15';
  const tempSys = world.getTemporaryObjectSystem();
  assert.strictEqual(tempSys.isTracking(dropId), true, 'Requisito G: Drop deve ser rastreado no TemporaryObjectSystem');
  const ttl = tempSys.getRemainingTtl(dropId);
  assert(ttl !== null && ttl > 0 && ttl <= DEFAULT_ITEM_DROP_TTL, 'Requisito G: TTL deve estar no intervalo correto');
  console.log('✓ Requisito G passou: O drop mantém seu TTL correto');
}

// ============================================================================
// REQUISITO H: Ao descarregar o chunk, a informação de destruição permanece registrada
// ============================================================================
{
  const world = new World(12345);
  const chunkManager = world.getChunkManager();
  const chunk = chunkManager.getOrCreateChunk(2, 2);

  const treeId = 'natural:tree:35:35';
  const tree = new NaturalTreeObject(
    treeId,
    { worldX: 35 * TILE_SIZE, worldY: 35 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    35,
    35,
    0,
  );
  world.getObjectManager().addObject(tree);

  // Player corta a árvore
  const player = new Player({ worldX: 35 * TILE_SIZE, worldY: 35 * TILE_SIZE - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  // Descarrega o chunk
  chunkManager.unloadChunk(2, 2);

  // O registro de destruição deve continuar contendo a árvore
  const registry = world.getDestroyedNaturalObjectRegistry();
  assert.strictEqual(registry.isDestroyed(treeId), true, 'Requisito H: Registro deve manter ID após descarga');
  assert.strictEqual(registry.isDestroyedAt('tree', 35, 35), true, 'Requisito H: Registro deve manter coordenadas');
  console.log('✓ Requisito H passou: Ao descarregar o chunk, a informação de destruição permanece registrada');
}

// ============================================================================
// REQUISITO I: Ao recarregar o chunk, a árvore destruída NÃO reaparece
// ============================================================================
{
  const world = new World(12345);
  const chunkManager = world.getChunkManager();

  // Carrega chunk inicial (0, 0)
  const initialChunk = chunkManager.getOrCreateChunk(0, 0);
  const naturalObjs = initialChunk.getNaturalObjects();

  // Encontra uma árvore gerada proceduralmente no chunk (0, 0)
  const proceduralTree = naturalObjs.find((o) => o.type === 'tree') as NaturalTreeObject | undefined;
  assert(proceduralTree !== undefined, 'Deve haver pelo menos uma árvore gerada no chunk');

  const treeId = proceduralTree.id;
  const tileX = proceduralTree.sourceTileX;
  const tileY = proceduralTree.sourceTileY;

  // A árvore deve estar presente no WorldObjectManager
  assert(world.getObjectManager().getObjectById(treeId) !== null, 'Árvore procedural deve existir inicialmente');

  // Posiciona o player em frente à árvore e corta
  const player = new Player({
    worldX: proceduralTree.position.worldX,
    worldY: proceduralTree.position.worldY - 20,
  });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  const chop = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(chop.success, true, 'Árvore deve ser cortada');

  // Verifica que sumiu do WorldObjectManager
  assert.strictEqual(world.getObjectManager().getObjectById(treeId), null, 'Árvore cortada deve sumir');

  // Descarrega o chunk (0, 0)
  chunkManager.unloadChunk(0, 0);
  assert.strictEqual(chunkManager.hasChunk(0, 0), false, 'Chunk deve ter sido descarregado');

  // Recarrega o chunk (0, 0) via getOrCreateChunk
  const reloadedChunk = chunkManager.getOrCreateChunk(0, 0);
  assert(reloadedChunk !== null, 'Chunk recarregado com sucesso');

  // A árvore destruída NÃO deve reaparecer no WorldObjectManager!
  assert.strictEqual(
    world.getObjectManager().getObjectById(treeId),
    null,
    'Requisito I: Árvore destruída NÃO deve reaparecer após recarregamento do chunk!',
  );
  console.log('✓ Requisito I passou: Ao recarregar o chunk, a árvore destruída NÃO reaparece');
}

// ============================================================================
// REQUISITO J: O comportamento funciona em coordenadas negativas
// ============================================================================
{
  const world = new World(99999);
  const chunkManager = world.getChunkManager();

  let tree: NaturalTreeObject | undefined;
  let negChunkX = -1;
  let negChunkY = -1;

  for (let x = -1; x >= -8 && !tree; x--) {
    for (let y = -1; y >= -8 && !tree; y--) {
      const c = chunkManager.getOrCreateChunk(x, y);
      const t = c.getNaturalObjects().find((o) => o.type === 'tree') as NaturalTreeObject | undefined;
      if (t) {
        tree = t;
        negChunkX = x;
        negChunkY = y;
      }
    }
  }

  assert(tree !== undefined, 'Deve haver árvore em coordenadas negativas');
  const treeId = tree.id;
  assert(tree.sourceTileX < 0 || tree.sourceTileY < 0, 'As coordenadas de tile devem ser negativas');

  // Corta a árvore
  const player = new Player({
    worldX: tree.position.worldX,
    worldY: tree.position.worldY - 20,
  });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  const chop = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(chop.success, true, 'Corte em coordenadas negativas deve ter sucesso');

  // Descarrega e recarrega o chunk negativo
  chunkManager.unloadChunk(negChunkX, negChunkY);
  chunkManager.getOrCreateChunk(negChunkX, negChunkY);

  assert.strictEqual(
    world.getObjectManager().getObjectById(treeId),
    null,
    'Requisito J: Árvore em coordenadas negativas NÃO deve reaparecer após reload',
  );
  console.log('✓ Requisito J passou: O comportamento funciona em coordenadas negativas');
}

// ============================================================================
// REQUISITO K: O comportamento funciona próximo a fronteiras de chunks
// ============================================================================
{
  const world = new World(12345);
  const chunkManager = world.getChunkManager();

  // Carrega chunk (0, 0) e chunk (1, 0)
  chunkManager.getOrCreateChunk(0, 0);
  chunkManager.getOrCreateChunk(1, 0);

  // Árvore na borda direita de chunk 0 (tileX: 15)
  const borderTree0 = new NaturalTreeObject(
    'natural:tree:15:5',
    { worldX: 15 * TILE_SIZE, worldY: 5 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    15,
    5,
    0,
  );
  // Árvore na borda esquerda de chunk 1 (tileX: 16)
  const borderTree1 = new NaturalTreeObject(
    'natural:tree:16:5',
    { worldX: 16 * TILE_SIZE, worldY: 5 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    16,
    5,
    0,
  );

  world.getObjectManager().addObject(borderTree0);
  world.getObjectManager().addObject(borderTree1);

  // Player corta borderTree0
  const player = new Player({ worldX: 15 * TILE_SIZE, worldY: 5 * TILE_SIZE - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  // borderTree0 destruída, borderTree1 intacta
  assert.strictEqual(world.getObjectManager().getObjectById(borderTree0.id), null, 'borderTree0 deve ser destruída');
  assert(world.getObjectManager().getObjectById(borderTree1.id) !== null, 'borderTree1 deve permanecer intacta');

  // Descarrega ambos os chunks e recarrega
  chunkManager.unloadChunk(0, 0);
  chunkManager.unloadChunk(1, 0);
  chunkManager.getOrCreateChunk(0, 0);
  chunkManager.getOrCreateChunk(1, 0);

  assert.strictEqual(
    world.getObjectManager().getObjectById(borderTree0.id),
    null,
    'Requisito K: borderTree0 não deve reaparecer na borda',
  );
  console.log('✓ Requisito K passou: O comportamento funciona próximo a fronteiras de chunks');
}

// ============================================================================
// REQUISITO L: Duas árvores diferentes podem ser destruídas independentemente
// ============================================================================
{
  const world = new World(12345);
  const treeA = new NaturalTreeObject(
    'natural:tree:2:2',
    { worldX: 2 * TILE_SIZE, worldY: 2 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    2,
    2,
    0,
  );
  const treeB = new NaturalTreeObject(
    'natural:tree:8:8',
    { worldX: 8 * TILE_SIZE, worldY: 8 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    8,
    8,
    0,
  );
  world.getObjectManager().addObject(treeA);
  world.getObjectManager().addObject(treeB);

  const player = new Player({ worldX: 2 * TILE_SIZE, worldY: 2 * TILE_SIZE - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  // Árvore A destruída, Árvore B intacta
  assert.strictEqual(world.getObjectManager().getObjectById(treeA.id), null, 'Árvore A deve ser destruída');
  assert(world.getObjectManager().getObjectById(treeB.id) !== null, 'Árvore B deve continuar intacta');

  // Move player até a árvore B e corta
  player.position = { worldX: 8 * TILE_SIZE, worldY: 8 * TILE_SIZE - 20 };
  itemUseSystem.resetCooldown();
  itemUseSystem.useEquippedItem(player, world);

  // Ambas agora destruídas
  assert.strictEqual(world.getObjectManager().getObjectById(treeA.id), null, 'Árvore A continua destruída');
  assert.strictEqual(world.getObjectManager().getObjectById(treeB.id), null, 'Árvore B agora destruída');
  console.log('✓ Requisito L passou: Duas árvores diferentes podem ser destruídas independentemente');
}

// ============================================================================
// REQUISITO M: Destruir uma árvore não destrói árvores vizinhas
// ============================================================================
{
  const world = new World(12345);
  const treeMain = new NaturalTreeObject(
    'natural:tree:10:10',
    { worldX: 10 * TILE_SIZE, worldY: 10 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    10,
    10,
    0,
  );
  const treeNeighbor = new NaturalTreeObject(
    'natural:tree:11:10',
    { worldX: 11 * TILE_SIZE, worldY: 10 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    11,
    10,
    0,
  );
  world.getObjectManager().addObject(treeMain);
  world.getObjectManager().addObject(treeNeighbor);

  const player = new Player({ worldX: 10 * TILE_SIZE, worldY: 10 * TILE_SIZE - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(world.getObjectManager().getObjectById(treeMain.id), null, 'treeMain destruída');
  const neighborFound = world.getObjectManager().getObjectById(treeNeighbor.id);
  assert(neighborFound !== null, 'Requisito M: treeNeighbor deve permanecer intacta');
  assert.strictEqual(treeNeighbor.isDestroyed, false, 'treeNeighbor não deve estar destruída');
  console.log('✓ Requisito M passou: Destruir uma árvore não destrói árvores vizinhas');
}

// ============================================================================
// REQUISITO N: Consultar o registro de destruição não materializa chunks
// ============================================================================
{
  const world = new World(12345);
  const chunkManager = world.getChunkManager();

  const countBefore = chunkManager.getLoadedChunkCount();

  // Consulta vários IDs e coordenadas
  world.isNaturalObjectDestroyed('natural:tree:100:100');
  world.isNaturalObjectDestroyed('natural:tree:-50:-80');
  world.getDestroyedNaturalObjectRegistry().isDestroyedAt('tree', 999, 999);
  world.getDestroyedNaturalObjectRegistry().isDestroyedAt('rock', -1000, 500);

  const countAfter = chunkManager.getLoadedChunkCount();
  assert.strictEqual(
    countAfter,
    countBefore,
    'Requisito N: Consultas de destruição NUNCA devem materializar ou alocar chunks!',
  );
  console.log('✓ Requisito N passou: Consultar o registro de destruição não materializa chunks');
}

// ============================================================================
// REQUISITO O: A solução não depende do Renderer
// ============================================================================
{
  // Todos os testes acima foram executados estritamente em ambiente headless/Node.js sem Canvas ou Renderer
  const registry = new DestroyedNaturalObjectRegistry();
  registry.registerDestroyed('natural:tree:1:1');
  assert.strictEqual(registry.isDestroyed('natural:tree:1:1'), true);
  console.log('✓ Requisito O passou: A solução não depende do Renderer');
}

// ============================================================================
// REQUISITO P: A solução não depende de sprites
// ============================================================================
{
  const world = new World(777);
  const tree = new NaturalTreeObject(
    'natural:tree:4:4',
    { worldX: 4 * TILE_SIZE, worldY: 4 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    4,
    4,
    0,
  );
  world.getObjectManager().addObject(tree);

  // A árvore opera e pode ser cortada mesmo sem assets ou spritesheets
  const player = new Player({ worldX: 4 * TILE_SIZE, worldY: 4 * TILE_SIZE - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  const chop = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(chop.success, true, 'Requisito P: Operação pura sem sprites');
  console.log('✓ Requisito P passou: A solução não depende de sprites');
}

// ============================================================================
// REQUISITO Q: A solução não altera a hitbox física do jogador
// ============================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  const initialSize = player.size;
  const initialFootBaseY = player.getFootBaseY();

  const world = new World(12345);
  const tree = new NaturalTreeObject(
    'natural:tree:3:3',
    { worldX: 100, worldY: 110 },
    28,
    38,
    Biome.FOREST,
    3,
    3,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(player.size, initialSize, 'Requisito Q: player.size inalterado');
  assert.strictEqual(player.getFootBaseY(), initialFootBaseY, 'Requisito Q: footBaseY inalterado');
  console.log('✓ Requisito Q passou: A solução não altera a hitbox física do jogador');
}

// ============================================================================
// REQUISITO R: A solução continua determinística
// ============================================================================
{
  const worldA = new World(12345);
  const worldB = new World(12345);

  const chunkA = worldA.getChunkManager().getOrCreateChunk(0, 0);
  const chunkB = worldB.getChunkManager().getOrCreateChunk(0, 0);

  const treeA = chunkA.getNaturalObjects().find((o) => o.type === 'tree') as NaturalTreeObject;
  const treeB = chunkB.getNaturalObjects().find((o) => o.type === 'tree') as NaturalTreeObject;

  assert(treeA !== undefined && treeB !== undefined, 'Deve encontrar árvores procedurais');
  assert.strictEqual(treeA.id, treeB.id, 'Requisito R: IDs de árvores procedurais devem ser idênticos');
  assert.strictEqual(treeA.position.worldX, treeB.position.worldX, 'Requisito R: worldX idêntico');
  assert.strictEqual(treeA.position.worldY, treeB.position.worldY, 'Requisito R: worldY idêntico');

  // Corta em worldA
  const playerA = new Player({ worldX: treeA.position.worldX, worldY: treeA.position.worldY - 20 });
  playerA.direction = PlayerDirection.DOWN;
  playerA.inventory.addItemStack(createItemStack('axe', 1));
  playerA.hotbar.setSelectedSlot(0);

  const itemUseSystemA = new ItemUseSystem(48, 0.4);
  const resultA = itemUseSystemA.useEquippedItem(playerA, worldA);

  // Corta em worldB
  const playerB = new Player({ worldX: treeB.position.worldX, worldY: treeB.position.worldY - 20 });
  playerB.direction = PlayerDirection.DOWN;
  playerB.inventory.addItemStack(createItemStack('axe', 1));
  playerB.hotbar.setSelectedSlot(0);

  const itemUseSystemB = new ItemUseSystem(48, 0.4);
  const resultB = itemUseSystemB.useEquippedItem(playerB, worldB);

  assert.strictEqual(resultA.code, resultB.code, 'Requisito R: Mesma ação e código');
  assert.strictEqual(
    worldA.getDestroyedNaturalObjectRegistry().isDestroyed(treeA.id),
    worldB.getDestroyedNaturalObjectRegistry().isDestroyed(treeB.id),
    'Requisito R: Estado de destruição idêntico em ambos os mundos',
  );
  console.log('✓ Requisito R passou: A solução continua determinística');
}

// ============================================================================
// REQUISITO S: Recarregar o mesmo chunk repetidamente não recria a árvore destruída
// ============================================================================
{
  const world = new World(12345);
  const chunkManager = world.getChunkManager();
  const chunk = chunkManager.getOrCreateChunk(0, 0);

  const tree = chunk.getNaturalObjects().find((o) => o.type === 'tree') as NaturalTreeObject;
  const treeId = tree.id;

  const player = new Player({ worldX: tree.position.worldX, worldY: tree.position.worldY - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  assert.strictEqual(world.getObjectManager().getObjectById(treeId), null, 'Árvore cortada');

  // Recarregar o chunk 5 vezes consecutivas
  for (let i = 1; i <= 5; i++) {
    chunkManager.unloadChunk(0, 0);
    assert.strictEqual(chunkManager.hasChunk(0, 0), false, `Chunk descarregado na iteração ${i}`);
    chunkManager.getOrCreateChunk(0, 0);
    assert.strictEqual(
      world.getObjectManager().getObjectById(treeId),
      null,
      `Requisito S: Árvore destruída NUNCA deve reaparecer na iteração ${i}!`,
    );
  }
  console.log('✓ Requisito S passou: Recarregar o mesmo chunk repetidamente não recria a árvore destruída');
}

// ============================================================================
// REQUISITO T: Não existe mais estado visual/lógico de "stump" sendo usado como substituto da árvore destruída
// ============================================================================
{
  const world = new World(12345);
  const tree = new NaturalTreeObject(
    'natural:tree:20:20',
    { worldX: 20 * TILE_SIZE, worldY: 20 * TILE_SIZE },
    28,
    38,
    Biome.FOREST,
    20,
    20,
    0,
  );
  world.getObjectManager().addObject(tree);

  const player = new Player({ worldX: 20 * TILE_SIZE, worldY: 20 * TILE_SIZE - 20 });
  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const itemUseSystem = new ItemUseSystem(48, 0.4);
  itemUseSystem.useEquippedItem(player, world);

  // O estágio deve ser 'destroyed', jamais 'stump'
  assert.strictEqual(
    tree.getStage(),
    'destroyed',
    'Requisito T: getStage() deve retornar "destroyed", NUNCA "stump"',
  );
  assert.notStrictEqual(tree.getStage(), 'stump', 'Requisito T: Estágio não pode ser stump');

  // No WorldObjectManager não deve existir nenhum objeto "stump"
  const allObjs = world.getObjectManager().getAllObjects();
  const hasStump = allObjs.some((o) => o.type === 'stump' || (o.state as any)?.stage === 'stump');
  assert.strictEqual(hasStump, false, 'Requisito T: Nenhum stump deve existir no WorldObjectManager');
  console.log('✓ Requisito T passou: Não existe mais estado visual/lógico de "stump" sendo usado como substituto');
}

console.log('===================================================================');
console.log('TODOS OS 20 TESTES (A até T) DE DESTRUIÇÃO DE ÁRVORES FORAM APROVADOS COM 100% DE SUCESSO!');
console.log('===================================================================');
