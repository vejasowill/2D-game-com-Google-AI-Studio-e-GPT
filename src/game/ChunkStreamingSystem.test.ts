import {
  CHUNK_LOAD_RADIUS,
  CHUNK_SIZE,
  CHUNK_UNLOAD_RADIUS,
  DEFAULT_PLAYER_SPEED,
  DEFAULT_WORLD_SEED,
  PLAYER_SIZE,
  TILE_SIZE,
} from './constants.ts';
import { ChunkStreamingSystem } from './ChunkStreamingSystem.ts';
import { ChunkManager } from './ChunkManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { Player } from './Player.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runChunkStreamingTests(): void {
  console.log('[TEST] Iniciando suíte de testes de ChunkStreamingSystem...');

  const world = new World(DEFAULT_WORLD_SEED);
  const chunkManager = world.getChunkManager();
  const streaming = new ChunkStreamingSystem(world);

  // =========================================================================
  // 1. Player no chunk (0,0) carrega exatamente os chunks esperados dentro do raio
  // =========================================================================
  // Posição no centro do chunk (0,0): x = 8 * 32 = 256, y = 8 * 32 = 256
  const posChunk00 = { worldX: 256, worldY: 256 };
  const chunkCoord00 = streaming.getChunkCoordFromWorldPosition(posChunk00);
  assert(chunkCoord00.chunkX === 0 && chunkCoord00.chunkY === 0, 'Chunk do Player deve ser (0,0)');

  // Forçar atualização de streaming para (0,0)
  streaming.forceUpdate(posChunk00);

  // =========================================================================
  // 2. Com LOAD_RADIUS = 2, o conjunto de chunks carregados inclui (-2,-2) até (2,2)
  // Total de (2*2 + 1)^2 = 5 * 5 = 25 chunks
  // =========================================================================
  for (let dy = -CHUNK_LOAD_RADIUS; dy <= CHUNK_LOAD_RADIUS; dy++) {
    for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
      assert(
        chunkManager.hasChunk(dx, dy),
        `Chunk (${dx}, ${dy}) deveria estar carregado para o Player em (0,0)`,
      );
    }
  }
  const initialCount = chunkManager.getLoadedChunkCount();
  assert(
    initialCount === 25,
    `Quantidade esperada de chunks carregados ao redor de (0,0) com raio 2 é 25, obtido: ${initialCount}`,
  );
  console.log('✓ Teste 1 e 2 passaram: Player em (0,0) carrega exatamente os 25 chunks esperados (-2..2)');

  // =========================================================================
  // 3. Chunk fora do raio de carga não é carregado apenas pelo streaming
  // =========================================================================
  assert(
    !chunkManager.hasChunk(3, 0),
    'Chunk (3,0) fora do raio de carga (radius=2) NÃO deve estar carregado',
  );
  assert(
    !chunkManager.hasChunk(-3, 0),
    'Chunk (-3,0) fora do raio de carga NÃO deve estar carregado',
  );
  assert(
    !chunkManager.hasChunk(0, 3),
    'Chunk (0,3) fora do raio de carga NÃO deve estar carregado',
  );
  assert(
    !chunkManager.hasChunk(0, -3),
    'Chunk (0,-3) fora do raio de carga NÃO deve estar carregado',
  );
  console.log('✓ Teste 3 passou: Chunks fora do raio de carga não são carregados pelo streaming');

  // =========================================================================
  // 4. Ao mover o Player de chunk (0,0) para (1,0), os novos chunks são carregados
  // =========================================================================
  // Mover para o chunk (1,0): x = 16 * 32 + 10 = 522px, y = 256px
  const posChunk10 = { worldX: 522, worldY: 256 };
  const chunkCoord10 = streaming.getChunkCoordFromWorldPosition(posChunk10);
  assert(chunkCoord10.chunkX === 1 && chunkCoord10.chunkY === 0, 'Chunk do Player deve ser (1,0)');

  const didUpdate = streaming.update(posChunk10);
  assert(didUpdate, 'Transição para o chunk (1,0) deve disparar atualização de streaming');

  // Novos chunks necessários no raio 2 de (1,0): x vai de -1 a 3
  for (let dy = -CHUNK_LOAD_RADIUS; dy <= CHUNK_LOAD_RADIUS; dy++) {
    for (let dx = 1 - CHUNK_LOAD_RADIUS; dx <= 1 + CHUNK_LOAD_RADIUS; dx++) {
      assert(
        chunkManager.hasChunk(dx, dy),
        `Chunk (${dx}, ${dy}) deveria estar carregado após mover Player para (1,0)`,
      );
    }
  }
  // Exemplo: chunk (3, 0) agora deve estar carregado
  assert(chunkManager.hasChunk(3, 0), 'Chunk (3,0) deve ter sido carregado após Player ir para (1,0)');
  console.log('✓ Teste 4 passou: Novos chunks são carregados ao mover o Player de (0,0) para (1,0)');

  // =========================================================================
  // 5. Chunks muito distantes são descarregados
  // 6. Chunks dentro do UNLOAD_RADIUS não são descarregados prematuramente
  // =========================================================================
  // Quando o Player estava em (0,0), (-2,0) foi carregado.
  // Agora que o Player está em (1,0), a distância de (-2,0) é | -2 - 1 | = 3.
  // Como CHUNK_UNLOAD_RADIUS = 3, (-2, 0) ainda é <= 3 e deve permanecer em memória (histerese).
  assert(
    chunkManager.hasChunk(-2, 0),
    'Chunk (-2,0) está na margem de histerese (distância 3) e NÃO deve ser descarregado prematuramente',
  );

  // Mover o Player para (2,0):
  // Agora (-2,0) fica a distância | -2 - 2 | = 4 > UNLOAD_RADIUS (3).
  // Portanto (-2,0) DEVE ser descarregado!
  const posChunk20 = { worldX: 2 * CHUNK_SIZE * TILE_SIZE + 10, worldY: 256 };
  streaming.update(posChunk20);

  assert(
    !chunkManager.hasChunk(-2, 0),
    'Chunk (-2,0) a distância 4 (> UNLOAD_RADIUS 3) DEVE ser descarregado',
  );
  assert(
    !chunkManager.hasChunk(-2, 1),
    'Chunk (-2,1) a distância 4 DEVE ser descarregado',
  );
  console.log('✓ Testes 5 e 6 passaram: Descarregamento correto além do UNLOAD_RADIUS e preservação dentro dele');

  // =========================================================================
  // 7. A travessia entre coordenadas positivas e negativas funciona perfeitamente
  // =========================================================================
  // Mover direto para quadrante negativo (-2, -2)
  const posChunkNeg22 = {
    worldX: -2 * CHUNK_SIZE * TILE_SIZE + 20,
    worldY: -2 * CHUNK_SIZE * TILE_SIZE + 20,
  };
  streaming.update(posChunkNeg22);
  const negPlayerChunk = streaming.getChunkCoordFromWorldPosition(posChunkNeg22);
  assert(
    negPlayerChunk.chunkX === -2 && negPlayerChunk.chunkY === -2,
    'Player deve estar no chunk (-2,-2)',
  );

  // Chunks ao redor de (-2, -2) com raio 2 devem estar carregados: x e y de -4 a 0
  for (let dy = -4; dy <= 0; dy++) {
    for (let dx = -4; dx <= 0; dx++) {
      assert(
        chunkManager.hasChunk(dx, dy),
        `Chunk (${dx}, ${dy}) deve estar carregado ao redor de (-2,-2)`,
      );
    }
  }
  // Chunks positivos distantes, como (4, 0), devem estar descarregados
  assert(!chunkManager.hasChunk(4, 0), 'Chunk distante (4,0) deve estar descarregado');
  console.log('✓ Teste 7 passou: Streaming funciona em quadrantes negativos');

  // =========================================================================
  // 8. Streaming não altera a geração procedural
  // =========================================================================
  // Comparar tile gerado via streaming com tile gerado por um World isolado de mesma seed
  const referenceWorld = new World(DEFAULT_WORLD_SEED);
  const sampleTileCoord = { tileX: -30, tileY: -30 };
  const streamedTile = world.getLoadedTile(sampleTileCoord.tileX, sampleTileCoord.tileY);
  const referenceTile = referenceWorld.getTile(sampleTileCoord.tileX, sampleTileCoord.tileY);
  assert(streamedTile !== null, 'Tile em (-30,-30) deve estar carregado');
  assert(
    streamedTile?.type === referenceTile?.type,
    'Streaming deve produzir conteúdo procedural idêntico ao gerador puro de referência',
  );
  console.log('✓ Teste 8 passou: Streaming não altera a geração procedural');

  // =========================================================================
  // 9. Chunk descarregado e posteriormente regenerado possui exatamente os mesmos tiles
  // =========================================================================
  // 1. Carregar chunk (5,5)
  const testChunk = chunkManager.getOrCreateChunk(5, 5);
  // 2. Guardar cópia dos tiles
  const snapshotTiles: TileType[] = [];
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      snapshotTiles.push(testChunk.getTile(lx, ly)!.type);
    }
  }
  // 3. Descarregar chunk (5,5)
  const wasUnloaded = chunkManager.unloadChunk(5, 5);
  assert(wasUnloaded, 'unloadChunk(5,5) deve retornar true');
  assert(!chunkManager.hasChunk(5, 5), 'Chunk (5,5) deve ter sido removido');

  // 4. Regenerar / recarregar chunk (5,5)
  const reloadedChunk = chunkManager.getOrCreateChunk(5, 5);
  // 5. Verificar que cada tile é estritamente idêntico
  let idx = 0;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tile = reloadedChunk.getTile(lx, ly);
      assert(
        tile?.type === snapshotTiles[idx],
        `Tile em (${lx}, ${ly}) difere após recarregamento do chunk (5,5)`,
      );
      idx++;
    }
  }
  console.log('✓ Teste 9 passou: Determinismo estrito após unload e regeneração de chunk');

  // =========================================================================
  // 10. Atualizações de streaming não acontecem enquanto o Player permanece no mesmo chunk
  // =========================================================================
  const initialUpdate = streaming.update({ worldX: 100, worldY: 100 });
  // Mover alguns pixels dentro do mesmo chunk
  const smallStepUpdate1 = streaming.update({ worldX: 101, worldY: 100 });
  const smallStepUpdate2 = streaming.update({ worldX: 105, worldY: 110 });
  const smallStepUpdate3 = streaming.update({ worldX: 120, worldY: 120 });
  assert(!smallStepUpdate1, 'Mover 1px dentro do mesmo chunk NÃO deve reprocessar streaming');
  assert(!smallStepUpdate2, 'Mover alguns pixels no mesmo chunk NÃO deve reprocessar streaming');
  assert(!smallStepUpdate3, 'Mover no mesmo chunk NÃO deve reprocessar streaming');
  console.log('✓ Teste 10 passou: Streaming ignora movimentos dentro do mesmo chunk');

  // =========================================================================
  // 11. Renderer / getLoadedTile não gera chunks
  // =========================================================================
  // Escolher uma coordenada bem distante que com certeza não está carregada
  const ungeneratedTileX = 9999;
  const ungeneratedTileY = 9999;
  const { chunkCoord: ungeneratedChunkCoord } = ChunkManager.globalTileToChunkCoord(
    ungeneratedTileX,
    ungeneratedTileY,
  );
  assert(
    !chunkManager.hasChunk(ungeneratedChunkCoord.chunkX, ungeneratedChunkCoord.chunkY),
    'Chunk distante não deve estar carregado inicialmente',
  );

  const loadedTileResult = world.getLoadedTile(ungeneratedTileX, ungeneratedTileY);
  assert(
    loadedTileResult === null,
    'world.getLoadedTile em chunk descarregado DEVE retornar null',
  );
  assert(
    !chunkManager.hasChunk(ungeneratedChunkCoord.chunkX, ungeneratedChunkCoord.chunkY),
    'world.getLoadedTile NUNCA deve provocar geração ou carregamento de chunk',
  );
  console.log('✓ Teste 11 passou: world.getLoadedTile é estritamente somente-leitura e não gera chunks');

  // =========================================================================
  // 12. Player atravessando fronteiras entre chunks livremente
  // (0,0) -> (1,0), (-1,0), (0,1), (0,-1), (-1,-1)
  // =========================================================================
  const collision = new CollisionSystem(world);
  const testPlayer = new Player({ worldX: 10, worldY: 10 }, DEFAULT_PLAYER_SPEED, PLAYER_SIZE);

  // Garantir chão caminhável em volta da origem e das fronteiras
  for (let cy = -2; cy <= 2; cy++) {
    for (let cx = -2; cx <= 2; cx++) {
      chunkManager.getOrCreateChunk(cx, cy);
    }
  }
  // Colocar caminho garantido de grama
  for (let ty = -20; ty <= 20; ty++) {
    for (let tx = -20; tx <= 20; tx++) {
      world.setTile(tx, ty, TileType.GRASS);
    }
  }

  // Atravessar para (1,0): x de 10 até 520
  testPlayer.position = { worldX: 500, worldY: 50 };
  collision.movePlayer(testPlayer, { x: 1, y: 0 }, 0.2); // ~32px para a direita
  assert(
    testPlayer.position.worldX > 512,
    `Player deve atravessar a fronteira do chunk para (1,0) (pos: ${testPlayer.position.worldX})`,
  );

  // Atravessar para (-1,0): x de 10 até -20
  testPlayer.position = { worldX: 5, worldY: 50 };
  collision.movePlayer(testPlayer, { x: -1, y: 0 }, 0.2);
  assert(
    testPlayer.position.worldX < 0,
    `Player deve atravessar a fronteira do chunk para (-1,0) (pos: ${testPlayer.position.worldX})`,
  );

  // Atravessar para (0,1): y de 500 até 530
  testPlayer.position = { worldX: 50, worldY: 500 };
  collision.movePlayer(testPlayer, { x: 0, y: 1 }, 0.2);
  assert(
    testPlayer.position.worldY > 512,
    `Player deve atravessar a fronteira do chunk para (0,1) (pos: ${testPlayer.position.worldY})`,
  );

  // Atravessar para (0,-1): y de 5 até -20
  testPlayer.position = { worldX: 50, worldY: 5 };
  collision.movePlayer(testPlayer, { x: 0, y: -1 }, 0.2);
  assert(
    testPlayer.position.worldY < 0,
    `Player deve atravessar a fronteira do chunk para (0,-1) (pos: ${testPlayer.position.worldY})`,
  );

  // Atravessar diagonalmente para (-1,-1)
  testPlayer.position = { worldX: 5, worldY: 5 };
  collision.movePlayer(testPlayer, { x: -1, y: -1 }, 0.2);
  assert(
    testPlayer.position.worldX < 0 && testPlayer.position.worldY < 0,
    `Player deve atravessar diagonalmente para (-1,-1) (pos: ${testPlayer.position.worldX}, ${testPlayer.position.worldY})`,
  );
  console.log('✓ Teste 12 passou: Player atravessa fronteiras de chunks em todas as direções sem colisão artificial');

  // =========================================================================
  // 13. Teste de Memória / Quantidade de Chunks em travessia longa
  // Simular: (0,0) -> (1,0) -> (2,0) -> (3,0) -> (4,0) -> (5,0) -> (10,0) -> (20,0)
  // =========================================================================
  const memWorld = new World(DEFAULT_WORLD_SEED);
  const memChunkManager = memWorld.getChunkManager();
  const memStreaming = new ChunkStreamingSystem(memWorld, CHUNK_LOAD_RADIUS, CHUNK_UNLOAD_RADIUS);

  // Raio de carga = 2 (5x5 = 25 chunks), raio de descarga = 3 (7x7 = 49 chunks no máximo com histerese).
  const maxAcceptableChunks = 49;

  for (let cX = 0; cX <= 20; cX++) {
    const chunkWorldX = cX * CHUNK_SIZE * TILE_SIZE + 100;
    memStreaming.update({ worldX: chunkWorldX, worldY: 100 });

    const currentCount = memChunkManager.getLoadedChunkCount();
    assert(
      currentCount <= maxAcceptableChunks,
      `Memória estourou no chunk (${cX}, 0): ${currentCount} chunks carregados (máximo permitido: ${maxAcceptableChunks})`,
    );

    // O chunk do Player deve estar carregado
    assert(
      memChunkManager.hasChunk(cX, 0),
      `Chunk atual do Player (${cX}, 0) deve estar carregado`,
    );

    // Chunks antigos distantes devem ter sido descarregados
    if (cX >= 6) {
      assert(
        !memChunkManager.hasChunk(cX - 5, 0),
        `Chunk antigo (${cX - 5}, 0) deve ter sido descarregado da memória`,
      );
    }
  }

  const finalCount = memChunkManager.getLoadedChunkCount();
  assert(
    finalCount <= maxAcceptableChunks,
    `Ao final de uma longa viagem, a quantidade de chunks em memória deve permanecer estável (obtido: ${finalCount})`,
  );
  console.log(`✓ Teste 13 passou: Quantidade de chunks carregados limitada estavelmente (${finalCount} <= ${maxAcceptableChunks}) durante exploração contínua`);

  console.log('[TEST] Todos os testes de ChunkStreamingSystem foram concluídos com sucesso!');
}

runChunkStreamingTests();
