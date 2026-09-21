import { CHUNK_SIZE, DEFAULT_WORLD_SEED, TILE_SIZE } from './constants.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';
import { WorldObjectManager } from './WorldObjectManager.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runWorldObjectTests(): void {
  console.log('[TEST] Iniciando suíte de testes de WorldObject e WorldObjectManager...');

  const objectManager = new WorldObjectManager();

  // =========================================================================
  // 1. Criação de objeto em coordenadas positivas
  // =========================================================================
  const positiveObject: WorldObject = {
    id: 'obj_tree_positive_1',
    type: 'tree',
    position: { worldX: 250, worldY: 350 },
    width: 32,
    height: 32,
  };
  const addedPos = objectManager.addObject(positiveObject);
  assert(addedPos === true, 'Objeto em coordenadas positivas deve ser adicionado');
  assert(objectManager.getObjectCount() === 1, 'Deve conter 1 objeto');

  const retrievedPos = objectManager.getObjectById('obj_tree_positive_1');
  assert(retrievedPos !== null, 'Objeto deve ser recuperável por ID');
  assert(retrievedPos?.position.worldX === 250, 'Posição X deve ser 250');
  assert(retrievedPos?.position.worldY === 350, 'Posição Y deve ser 350');
  assert(retrievedPos?.type === 'tree', 'Tipo deve ser tree');
  console.log('✓ Teste 1 passou: Criação e recuperação de objeto em coordenadas positivas');

  // =========================================================================
  // 2. Criação de objeto em coordenadas negativas
  // =========================================================================
  const negativeObject: WorldObject = {
    id: 'obj_rock_negative_1',
    type: 'rock',
    position: { worldX: -150, worldY: -220 },
    width: 24,
    height: 24,
  };
  const addedNeg = objectManager.addObject(negativeObject);
  assert(addedNeg === true, 'Objeto em coordenadas negativas deve ser adicionado');
  assert(objectManager.getObjectCount() === 2, 'Deve conter 2 objetos');

  const retrievedNeg = objectManager.getObjectById('obj_rock_negative_1');
  assert(retrievedNeg !== null, 'Objeto negativo deve ser recuperável por ID');
  assert(retrievedNeg?.position.worldX === -150, 'Posição X negativa deve ser -150');
  assert(retrievedNeg?.position.worldY === -220, 'Posição Y negativa deve ser -220');
  assert(retrievedNeg?.type === 'rock', 'Tipo deve ser rock');
  console.log('✓ Teste 2 passou: Criação e recuperação de objeto em coordenadas negativas');

  // =========================================================================
  // 3. IDs únicos e estáveis (rejeição de IDs duplicados)
  // =========================================================================
  const duplicateIdObject: WorldObject = {
    id: 'obj_tree_positive_1', // Mesmo ID do teste 1
    type: 'chest',
    position: { worldX: 50, worldY: 50 },
    width: 16,
    height: 16,
  };
  const addedDup = objectManager.addObject(duplicateIdObject);
  assert(addedDup === false, 'Adição com ID duplicado deve ser rejeitada (retornar false)');
  assert(objectManager.getObjectCount() === 2, 'Contador de objetos não deve aumentar com ID duplicado');
  assert(objectManager.getObjectById('obj_tree_positive_1')?.type === 'tree', 'Objeto original deve ser preservado');
  console.log('✓ Teste 3 passou: IDs estáveis e garantia de unicidade');

  // =========================================================================
  // 4. Armazenamento, indexação espacial e recuperação por área
  // =========================================================================
  const areaObjects = objectManager.getObjectsInArea(200, 300, 100, 100);
  assert(areaObjects.length === 1, 'getObjectsInArea deve encontrar o objeto positivo na região');
  assert(areaObjects[0].id === 'obj_tree_positive_1', 'ID do objeto encontrado na área deve coincidir');

  const emptyArea = objectManager.getObjectsInArea(1000, 1000, 50, 50);
  assert(emptyArea.length === 0, 'Área vazia não deve retornar objetos');
  console.log('✓ Teste 4 passou: Consulta por área e particionamento espacial');

  // =========================================================================
  // 5. Remoção de objeto
  // =========================================================================
  const removed = objectManager.removeObject('obj_rock_negative_1');
  assert(removed === true, 'removeObject deve retornar true para objeto existente');
  assert(objectManager.getObjectCount() === 1, 'Contador de objetos deve ser 1 após remoção');
  assert(objectManager.getObjectById('obj_rock_negative_1') === null, 'Objeto removido não deve existir');
  assert(objectManager.hasObject('obj_rock_negative_1') === false, 'hasObject deve retornar false após remoção');

  const removeNonExistent = objectManager.removeObject('obj_non_existent');
  assert(removeNonExistent === false, 'removeObject deve retornar false para objeto inexistente');
  console.log('✓ Teste 5 passou: Remoção de objeto e limpeza de índices');

  // =========================================================================
  // 6. Objetos próximos ou atravessando fronteiras de chunks
  // Um chunk tem 16 tiles * 32px = 512px.
  // Fronteira entre chunk 0 e chunk 1 está em worldX = 512.
  // =========================================================================
  const boundaryObject: WorldObject = {
    id: 'obj_boundary_crossing',
    type: 'gate',
    position: { worldX: 500, worldY: 100 }, // Inicia em 500 e com largura 32 termina em 532 (atravessa 512)
    width: 32,
    height: 32,
  };
  objectManager.addObject(boundaryObject);

  // Deve ser indexado tanto no chunk (0, 0) quanto no chunk (1, 0)
  const chunk0Objects = objectManager.getObjectsInChunk(0, 0);
  const chunk1Objects = objectManager.getObjectsInChunk(1, 0);

  const foundInChunk0 = chunk0Objects.some((o) => o.id === 'obj_boundary_crossing');
  const foundInChunk1 = chunk1Objects.some((o) => o.id === 'obj_boundary_crossing');

  assert(foundInChunk0 === true, 'Objeto deve ser encontrado na célula de chunk 0');
  assert(foundInChunk1 === true, 'Objeto deve ser encontrado na célula de chunk 1 por atravessar a fronteira');
  console.log('✓ Teste 6 passou: Objeto atravessando fronteira de chunks indexado corretamente');

  // =========================================================================
  // 7. Fronteira negativa entre chunks (ex: chunk -1 e chunk 0, worldX = 0)
  // =========================================================================
  const negBoundaryObject: WorldObject = {
    id: 'obj_neg_boundary_crossing',
    type: 'bridge',
    position: { worldX: -16, worldY: 50 }, // Inicia em -16 (chunk -1) e vai até +16 (chunk 0)
    width: 32,
    height: 16,
  };
  objectManager.addObject(negBoundaryObject);

  const chunkNeg1Objects = objectManager.getObjectsInChunk(-1, 0);
  const chunk0NegObjects = objectManager.getObjectsInChunk(0, 0);

  assert(
    chunkNeg1Objects.some((o) => o.id === 'obj_neg_boundary_crossing'),
    'Objeto deve ser indexado no chunk (-1, 0)',
  );
  assert(
    chunk0NegObjects.some((o) => o.id === 'obj_neg_boundary_crossing'),
    'Objeto deve ser indexado no chunk (0, 0)',
  );
  console.log('✓ Teste 7 passou: Objeto atravessando a origem x=0 entre chunk -1 e 0 indexado com sucesso');

  // =========================================================================
  // 8. Garantir que WorldObjects NÃO alteram os Tiles subjacentes
  // =========================================================================
  const world = new World(DEFAULT_WORLD_SEED);
  const worldObjManager = world.getObjectManager();

  // Registrar um objeto bem em cima de um tile específico (ex: tile 5, 5)
  const tileX = 5;
  const tileY = 5;
  const originalTile = world.getTile(tileX, tileY);
  assert(originalTile !== null, 'Tile original deve existir');
  const originalType = originalTile!.type;

  // Adicionar um WorldObject sobre esse tile
  worldObjManager.addObject({
    id: 'obj_tree_over_tile',
    type: 'tree',
    position: { worldX: tileX * TILE_SIZE, worldY: tileY * TILE_SIZE },
    width: TILE_SIZE,
    height: TILE_SIZE,
  });

  // O tile deve continuar exatamente igual ao original (GRASS ou WATER)
  const tileAfterObject = world.getTile(tileX, tileY);
  assert(
    tileAfterObject?.type === originalType,
    `TileType não pode ser alterado por WorldObject (${tileAfterObject?.type} !== ${originalType})`,
  );
  assert(
    tileAfterObject?.type === TileType.GRASS || tileAfterObject?.type === TileType.WATER,
    'TileType continua sendo exclusivamente um tipo de terreno da grade',
  );
  console.log('✓ Teste 8 passou: WorldObjects não alteram a identidade do tile subjacente');

  // =========================================================================
  // 9. Garantir que descarregar/recarregar chunks não destrói os WorldObjects
  // =========================================================================
  const chunkManager = world.getChunkManager();
  // Carregar chunk (3, 3)
  chunkManager.getOrCreateChunk(3, 3);

  // Adicionar objeto associado espacialmente ao chunk (3, 3)
  worldObjManager.addObject({
    id: 'obj_chest_chunk33',
    type: 'chest',
    position: { worldX: 3 * CHUNK_SIZE * TILE_SIZE + 50, worldY: 3 * CHUNK_SIZE * TILE_SIZE + 50 },
    width: 20,
    height: 20,
  });
  assert(worldObjManager.hasObject('obj_chest_chunk33'), 'Objeto registrado com sucesso');

  // Descarregar o chunk (3, 3) do terreno
  const chunkUnloaded = chunkManager.unloadChunk(3, 3);
  assert(chunkUnloaded === true, 'Chunk (3,3) do terreno deve ser descarregado');
  assert(!chunkManager.hasChunk(3, 3), 'Chunk (3,3) não está mais em memória no ChunkManager');

  // O WorldObject continua preservado em sua autoridade independente (WorldObjectManager)
  assert(
    worldObjManager.hasObject('obj_chest_chunk33') === true,
    'WorldObject deve permanecer intacto mesmo se o Chunk do terreno for descarregado',
  );
  const retainedObj = worldObjManager.getObjectById('obj_chest_chunk33');
  assert(retainedObj !== null, 'Objeto mantido com integridade de dados');

  // Recarregar o chunk (3, 3) do terreno
  chunkManager.getOrCreateChunk(3, 3);
  assert(chunkManager.hasChunk(3, 3), 'Chunk (3,3) recarregado com sucesso');
  assert(worldObjManager.hasObject('obj_chest_chunk33'), 'Objeto continua acessível após recarregar chunk');
  console.log('✓ Teste 9 passou: Independência completa entre ciclo de vida dos tiles e WorldObjects');

  // =========================================================================
  // Testes de Movimentação do WorldObjectManager (moveObject e consistência do índice):
  // =========================================================================

  // Teste 10: Mover objeto dentro do mesmo chunk
  const moveObj1: WorldObject = {
    id: 'dynamic_npc_1',
    type: 'npc',
    position: { worldX: 100, worldY: 100 },
    width: 20,
    height: 20,
  };
  objectManager.addObject(moveObj1);
  const movedSameChunk = objectManager.moveObject('dynamic_npc_1', { worldX: 120, worldY: 130 });
  assert(movedSameChunk === true, 'moveObject deve retornar true para objeto existente');
  const retrievedAfterSameMove = objectManager.getObjectById('dynamic_npc_1');
  assert(retrievedAfterSameMove?.position.worldX === 120, 'Posição X deve ser 120');
  assert(retrievedAfterSameMove?.position.worldY === 130, 'Posição Y deve ser 130');
  const inSameChunk = objectManager.getObjectsInChunk(0, 0);
  assert(inSameChunk.some((o) => o.id === 'dynamic_npc_1'), 'Objeto continua indexado no chunk (0,0)');
  console.log('✓ Teste 10 passou: Mover objeto dentro do mesmo chunk');

  // Teste 11: Mover objeto para outro chunk
  // Chunk 0 é [0..511], Chunk 2 é [1024..1535]
  const movedToOtherChunk = objectManager.moveObject('dynamic_npc_1', { worldX: 1100, worldY: 1100 });
  assert(movedToOtherChunk === true, 'moveObject para outro chunk deve retornar true');
  console.log('✓ Teste 11 passou: Mover objeto para outro chunk');

  // Teste 12: Confirmar que a célula antiga não contém mais o objeto
  const oldChunkObjects = objectManager.getObjectsInChunk(0, 0);
  assert(
    !oldChunkObjects.some((o) => o.id === 'dynamic_npc_1'),
    'Célula antiga (0,0) NÃO deve mais conter o objeto movido para o chunk 2',
  );
  console.log('✓ Teste 12 passou: Confirmar que a célula antiga não contém mais o objeto');

  // Teste 13: Confirmar que a nova célula contém o objeto
  // 1100px / 512px = chunk 2
  const newChunkObjects = objectManager.getObjectsInChunk(2, 2);
  assert(
    newChunkObjects.some((o) => o.id === 'dynamic_npc_1'),
    'Nova célula de chunk (2,2) DEVE conter o objeto movido',
  );
  console.log('✓ Teste 13 passou: Confirmar que a nova célula contém o objeto');

  // Teste 14: Mover objeto atravessando dois ou mais chunks (objeto posicionado na fronteira)
  // Fronteira entre chunk 2 e chunk 3 está em 3 * 512 = 1536px
  objectManager.moveObject('dynamic_npc_1', { worldX: 1530, worldY: 1100 }); // Inicia em 1530 com width 20 -> vai até 1550 (atravessa 1536)
  const chunk2Touched = objectManager.getObjectsInChunk(2, 2);
  const chunk3Touched = objectManager.getObjectsInChunk(3, 2);
  assert(
    chunk2Touched.some((o) => o.id === 'dynamic_npc_1'),
    'Objeto na fronteira deve ser indexado no chunk 2',
  );
  assert(
    chunk3Touched.some((o) => o.id === 'dynamic_npc_1'),
    'Objeto na fronteira deve ser indexado no chunk 3',
  );
  console.log('✓ Teste 14 passou: Mover objeto atravessando dois ou mais chunks');

  // Teste 15: Mover objeto através da fronteira negativa (ex: para -50px no chunk -1)
  objectManager.moveObject('dynamic_npc_1', { worldX: -50, worldY: -50 });
  const negChunkObjects = objectManager.getObjectsInChunk(-1, -1);
  assert(
    negChunkObjects.some((o) => o.id === 'dynamic_npc_1'),
    'Objeto movido para coordenadas negativas deve ser indexado no chunk (-1,-1)',
  );
  const oldChunk2Objects = objectManager.getObjectsInChunk(2, 2);
  const oldChunk3Objects = objectManager.getObjectsInChunk(3, 2);
  assert(
    !oldChunk2Objects.some((o) => o.id === 'dynamic_npc_1') &&
    !oldChunk3Objects.some((o) => o.id === 'dynamic_npc_1'),
    'Chunks anteriores (2,2) e (3,2) não devem mais conter o objeto',
  );
  console.log('✓ Teste 15 passou: Mover objeto através da fronteira negativa');

  // Teste 16: Confirmar que getObjectsInArea() encontra o objeto na posição nova
  const areaAtNewPos = objectManager.getObjectsInArea(-60, -60, 40, 40);
  assert(
    areaAtNewPos.some((o) => o.id === 'dynamic_npc_1'),
    'getObjectsInArea deve encontrar o objeto na sua nova coordenada (-50, -50)',
  );
  const areaAtOldPos = objectManager.getObjectsInArea(1000, 1000, 200, 200);
  assert(
    !areaAtOldPos.some((o) => o.id === 'dynamic_npc_1'),
    'getObjectsInArea na posição antiga não deve encontrar o objeto',
  );
  console.log('✓ Teste 16 passou: Confirmar que getObjectsInArea() encontra o objeto na posição nova');

  // Teste 17: Confirmar que o objeto continua com o mesmo ID
  const movedObjCheck = objectManager.getObjectById('dynamic_npc_1');
  assert(movedObjCheck !== null, 'Objeto deve existir');
  assert(movedObjCheck?.id === 'dynamic_npc_1', 'ID do objeto deve ser estritamente preservado');
  assert(movedObjCheck?.type === 'npc', 'Tipo do objeto deve ser estritamente preservado');
  console.log('✓ Teste 17 passou: Confirmar que o objeto continua com o mesmo ID');

  // Teste 18: Remover objeto após movimentá-lo
  const removedAfterMove = objectManager.removeObject('dynamic_npc_1');
  assert(removedAfterMove === true, 'removeObject após moveObject deve retornar true');
  assert(objectManager.getObjectById('dynamic_npc_1') === null, 'Objeto removido não deve existir');
  const negChunkAfterRemove = objectManager.getObjectsInChunk(-1, -1);
  assert(
    !negChunkAfterRemove.some((o) => o.id === 'dynamic_npc_1'),
    'Índice espacial do chunk negativo deve estar limpo após remoção',
  );
  console.log('✓ Teste 18 passou: Remover objeto após movimentá-lo');

  // Teste 19: Mover objeto repetidamente sem acumular referências duplicadas
  const stressObj: WorldObject = {
    id: 'stress_npc',
    type: 'rabbit',
    position: { worldX: 10, worldY: 10 },
    width: 10,
    height: 10,
  };
  objectManager.addObject(stressObj);

  for (let i = 0; i < 50; i++) {
    // Alternar entre chunk (0,0) e chunk (1,0) repetidamente
    const targetX = (i % 2 === 0) ? 50 : 600;
    objectManager.moveObject('stress_npc', { worldX: targetX, worldY: 50 });
  }
  // Após 50 movimentos, o objeto está no chunk (1,0) (i=49 -> ímpar -> x=600)
  const stressChunk1 = objectManager.getObjectsInChunk(1, 0);
  const stressChunk0 = objectManager.getObjectsInChunk(0, 0);
  const occurrencesInChunk1 = stressChunk1.filter((o) => o.id === 'stress_npc').length;
  const occurrencesInChunk0 = stressChunk0.filter((o) => o.id === 'stress_npc').length;
  assert(occurrencesInChunk1 === 1, `Deve existir exatamente 1 ocorrência no chunk atual, obtido: ${occurrencesInChunk1}`);
  assert(occurrencesInChunk0 === 0, `Não deve existir ocorrência no chunk antigo, obtido: ${occurrencesInChunk0}`);
  objectManager.removeObject('stress_npc');
  console.log('✓ Teste 19 passou: Mover objeto repetidamente sem acumular referências duplicadas');

  console.log('[TEST] Todos os testes de WorldObject e WorldObjectManager foram concluídos com sucesso!');
}

runWorldObjectTests();
