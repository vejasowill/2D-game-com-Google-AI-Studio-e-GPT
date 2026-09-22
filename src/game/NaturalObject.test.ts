import { Biome } from './Biome.ts';
import { CHUNK_SIZE, DEFAULT_WORLD_SEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { NaturalObjectType } from './NaturalObjectDefinition.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runNaturalObjectTests(): void {
  console.log('[TEST] Iniciando suíte de testes de Materialização Procedural de Objetos Naturais...');

  // =========================================================================
  // 1. DETERMINISMO ESTRITO POR SEED
  // Duas instâncias de World com a mesma seed geram exatamente os mesmos objetos.
  // =========================================================================
  const world1 = new World(DEFAULT_WORLD_SEED);
  const world2 = new World(DEFAULT_WORLD_SEED);

  // Carregar chunk inicial (0, 0) em ambos
  world1.getChunkManager().getChunk(0, 0);
  world2.getChunkManager().getChunk(0, 0);

  const objs1 = world1.getObjectManager().getAllObjects();
  const objs2 = world2.getObjectManager().getAllObjects();

  assert(objs1.length > 0, 'Chunk (0,0) deve gerar objetos naturais na seed padrão');
  assert(
    objs1.length === objs2.length,
    `Ambos os mundos devem conter a mesma quantidade de objetos. w1: ${objs1.length}, w2: ${objs2.length}`,
  );

  for (let i = 0; i < objs1.length; i++) {
    const o1 = objs1[i];
    const o2 = world2.getObjectManager().getObjectById(o1.id);
    assert(o2 !== null, `Objeto id ${o1.id} deve existir identicamente em world2`);
    assert(o1.type === o2?.type, `Tipos devem ser idênticos para ${o1.id}`);
    assert(
      o1.position.worldX === o2?.position.worldX && o1.position.worldY === o2?.position.worldY,
      `Posições no mundo devem ser perfeitamente idênticas para ${o1.id}`,
    );
    assert(
      o1.width === o2?.width && o1.height === o2?.height,
      `Dimensões devem ser perfeitamente idênticas para ${o1.id}`,
    );
  }
  console.log('✓ Teste 1 passou: Determinismo estrito por seed confirmado');

  // =========================================================================
  // 2. INDEPENDÊNCIA DA ORDEM DE CARREGAMENTO (STREAMING)
  // Carregar chunks em ordens invertidas produz exatamente os mesmos objetos por chunk.
  // =========================================================================
  const orderWorldA = new World(DEFAULT_WORLD_SEED);
  const orderWorldB = new World(DEFAULT_WORLD_SEED);

  // Ordem A: (1, 1), (-1, -1), (0, 1)
  orderWorldA.getChunkManager().getChunk(1, 1);
  orderWorldA.getChunkManager().getChunk(-1, -1);
  orderWorldA.getChunkManager().getChunk(0, 1);

  // Ordem B inversa: (0, 1), (-1, -1), (1, 1)
  orderWorldB.getChunkManager().getChunk(0, 1);
  orderWorldB.getChunkManager().getChunk(-1, -1);
  orderWorldB.getChunkManager().getChunk(1, 1);

  const listA = orderWorldA.getObjectManager().getAllObjects();
  const listB = orderWorldB.getObjectManager().getAllObjects();
  assert(
    listA.length === listB.length,
    `Quantidade total de objetos deve ser idêntica independente da ordem de carregamento (${listA.length} vs ${listB.length})`,
  );

  for (const objA of listA) {
    const objB = orderWorldB.getObjectManager().getObjectById(objA.id);
    assert(objB !== null, `Objeto ${objA.id} deve existir no mundo com ordem invertida`);
    assert(
      objA.position.worldX === objB?.position.worldX && objA.position.worldY === objB?.position.worldY,
      `Posição deve coincidir perfeitamente para ${objA.id}`,
    );
  }
  console.log('✓ Teste 2 passou: Independência estrita da ordem de carregamento confirmada');

  // =========================================================================
  // 3. CICLO DE VIDA DO STREAMING: DESCARREGAMENTO E RECARREGAMENTO SEM VAZAMENTOS
  // =========================================================================
  const streamingWorld = new World(DEFAULT_WORLD_SEED);
  const streamingManager = streamingWorld.getChunkManager();
  const objManager = streamingWorld.getObjectManager();

  const c00 = streamingManager.getChunk(0, 0);
  const c01 = streamingManager.getChunk(0, 1);
  const countWith2Chunks = objManager.getObjectCount();
  assert(countWith2Chunks > 0, 'Deve haver objetos registrados com 2 chunks carregados');

  const c01ObjCount = c01.getNaturalObjects().length;

  // Descarregar chunk (0, 1)
  const unloaded = streamingManager.unloadChunk(0, 1);
  assert(unloaded === true, 'Chunk (0, 1) deve ser descarregado com sucesso');
  assert(
    objManager.getObjectCount() === countWith2Chunks - c01ObjCount,
    `Objetos do chunk (0, 1) devem ser completamente removidos do WorldObjectManager. Esperado: ${countWith2Chunks - c01ObjCount}, obtido: ${objManager.getObjectCount()}`,
  );

  // Recarregar chunk (0, 1)
  streamingManager.getChunk(0, 1);
  assert(
    objManager.getObjectCount() === countWith2Chunks,
    `Recarregar o chunk deve restaurar a contagem exata sem duplicações (${objManager.getObjectCount()} vs ${countWith2Chunks})`,
  );

  // Descarregar todos os chunks
  streamingManager.unloadChunk(0, 0);
  streamingManager.unloadChunk(0, 1);
  assert(
    objManager.getObjectCount() === 0,
    `Após descarregar todos os chunks, o WorldObjectManager deve ter 0 objetos (evitando memory leaks). Obtido: ${objManager.getObjectCount()}`,
  );
  console.log('✓ Teste 3 passou: Ciclo de vida de streaming, descarregamento e recarregamento sem memory leaks');

  // =========================================================================
  // 4. REGRAS ESTRITAS DE BIOMAS E TERRENO
  // Objetos naturais devem respeitar estritamente o bioma e nunca aparecer em WATER.
  // =========================================================================
  const testWorld = new World(DEFAULT_WORLD_SEED);
  const worldGen = testWorld.getWorldGenerator();

  // Testar 25 chunks (5x5) em torno da origem
  for (let cy = -2; cy <= 2; cy++) {
    for (let cx = -2; cx <= 2; cx++) {
      testWorld.getChunkManager().getChunk(cx, cy);
    }
  }

  const allSpawned = testWorld.getObjectManager().getAllObjects();
  assert(allSpawned.length > 0, 'Deve haver objetos gerados na região 5x5 de chunks');

  for (const obj of allSpawned) {
    // Determinar o tile central do objeto
    const tileX = Math.floor((obj.position.worldX + obj.width / 2) / TILE_SIZE);
    const tileY = Math.floor((obj.position.worldY + obj.height) / TILE_SIZE);

    const tile = testWorld.getTile(tileX, tileY);
    assert(tile !== null, `Tile sob o objeto ${obj.id} deve existir`);
    assert(tile?.type !== TileType.WATER, `Objeto natural ${obj.id} JAMAIS pode ser gerado sobre água (WATER)`);

    const biome = worldGen.getBiomeAt(tileX, tileY);
    assert(biome !== Biome.OCEAN, `Objeto natural ${obj.id} jamais pode ser gerado no bioma OCEAN`);

    if (obj.type === NaturalObjectType.TREE) {
      assert(
        biome === Biome.FOREST,
        `Árvore (${obj.id}) só pode existir em FOREST. Bioma encontrado: ${biome} em (${tileX}, ${tileY})`,
      );
    } else if (obj.type === NaturalObjectType.CACTUS) {
      assert(
        biome === Biome.DESERT,
        `Cacto (${obj.id}) só pode existir em DESERT. Bioma encontrado: ${biome} em (${tileX}, ${tileY})`,
      );
    } else if (obj.type === NaturalObjectType.ROCK) {
      assert(
        biome === Biome.MOUNTAIN,
        `Rocha (${obj.id}) só pode existir em MOUNTAIN. Bioma encontrado: ${biome} em (${tileX}, ${tileY})`,
      );
    } else if (obj.type === NaturalObjectType.WILDFLOWER) {
      assert(
        biome === Biome.PLAINS,
        `Flor silvestre (${obj.id}) só pode existir em PLAINS. Bioma encontrado: ${biome} em (${tileX}, ${tileY})`,
      );
    }
  }
  console.log(`✓ Teste 4 passou: Regras estritas de biomas verificadas para ${allSpawned.length} objetos`);

  // =========================================================================
  // 5. SEPARAÇÃO FÍSICA: TILETYPE PERMANECE INTACTO E CAMINHÁVEL
  // =========================================================================
  const sampleObj = allSpawned[0];
  const origTileX = Math.floor((sampleObj.position.worldX + sampleObj.width / 2) / TILE_SIZE);
  const origTileY = Math.floor((sampleObj.position.worldY + sampleObj.height) / TILE_SIZE);
  const underlyingTile = testWorld.getTile(origTileX, origTileY);
  assert(
    underlyingTile?.type === TileType.GRASS,
    'O TileType sob o objeto natural deve permanecer inalterado (GRASS)',
  );
  console.log('✓ Teste 5 passou: Separação estrita entre TileType e WorldObject confirmada');

  // =========================================================================
  // 6. AUSÊNCIA DE MATERIALIZAÇÃO EM CONSULTAS AMBIENTAIS PURAS
  // getNaturalObjectAt() deve ser pura e não alocar chunks no ChunkManager.
  // =========================================================================
  const virginWorld = new World(DEFAULT_WORLD_SEED);
  const virginChunkManager = virginWorld.getChunkManager();
  assert(virginChunkManager.getLoadedChunkCount() === 0, 'Mundo virgem deve ter 0 chunks');

  // Consulta pura em coordenada arbitrária
  const pureObj = virginWorld.getNaturalObjectAt(5, 5);
  assert(
    virginChunkManager.getLoadedChunkCount() === 0,
    `getNaturalObjectAt NUNCA deve alocar chunks na memória (contagem: ${virginChunkManager.getLoadedChunkCount()})`,
  );
  console.log('✓ Teste 6 passou: Consulta pura getNaturalObjectAt não aloca chunks');

  console.log('[TEST] Todos os testes de Materialização Procedural de Objetos Naturais passaram!');
}

runNaturalObjectTests();
