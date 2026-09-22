import { Chunk } from './Chunk.ts';
import { ChunkManager } from './ChunkManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { CHUNK_SIZE, DEFAULT_PLAYER_SPEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { Player } from './Player.ts';
import { TileRegistry } from './TileRegistry.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

export function runChunkTests(): void {
  console.log('[TEST] Iniciando suíte de testes de Chunk e ChunkManager...');

  // =========================================================================
  // 1. Chunk possui exatamente CHUNK_SIZE × CHUNK_SIZE células
  // =========================================================================
  const chunk00 = new Chunk(0, 0);
  assert(
    chunk00.getTileCount() === CHUNK_SIZE * CHUNK_SIZE,
    `Chunk deve possuir exatamente ${CHUNK_SIZE * CHUNK_SIZE} células (CHUNK_SIZE × CHUNK_SIZE)`,
  );
  console.log(`✓ Teste 1 passou: Chunk possui exatamente ${CHUNK_SIZE * CHUNK_SIZE} células`);

  // =========================================================================
  // 2. Tile global (0,0) pertence ao Chunk (0,0)
  // =========================================================================
  const conversion00 = ChunkManager.globalTileToChunkCoord(0, 0);
  assert(
    conversion00.chunkCoord.chunkX === 0 &&
      conversion00.chunkCoord.chunkY === 0 &&
      conversion00.localX === 0 &&
      conversion00.localY === 0,
    'Tile global (0,0) deve pertencer ao Chunk (0,0) com local (0,0)',
  );
  console.log('✓ Teste 2 passou: Tile global (0,0) pertence ao Chunk (0,0) local (0,0)');

  // =========================================================================
  // 3. Tile global (15,15) pertence ao Chunk (0,0)
  // =========================================================================
  const conversion1515 = ChunkManager.globalTileToChunkCoord(15, 15);
  assert(
    conversion1515.chunkCoord.chunkX === 0 &&
      conversion1515.chunkCoord.chunkY === 0 &&
      conversion1515.localX === 15 &&
      conversion1515.localY === 15,
    'Tile global (15,15) deve pertencer ao Chunk (0,0) com local (15,15)',
  );
  console.log('✓ Teste 3 passou: Tile global (15,15) pertence ao Chunk (0,0) local (15,15)');

  // =========================================================================
  // 4. Tile global (16,0) pertence ao Chunk (1,0)
  // =========================================================================
  const conversion160 = ChunkManager.globalTileToChunkCoord(16, 0);
  assert(
    conversion160.chunkCoord.chunkX === 1 &&
      conversion160.chunkCoord.chunkY === 0 &&
      conversion160.localX === 0 &&
      conversion160.localY === 0,
    'Tile global (16,0) deve pertencer ao Chunk (1,0) com local (0,0)',
  );
  console.log('✓ Teste 4 passou: Tile global (16,0) pertence ao Chunk (1,0) local (0,0)');

  // =========================================================================
  // 5. Tile global (-1,0) pertence ao Chunk (-1,0) e utiliza coordenada local 15
  // =========================================================================
  const conversionNeg10 = ChunkManager.globalTileToChunkCoord(-1, 0);
  assert(
    conversionNeg10.chunkCoord.chunkX === -1 &&
      conversionNeg10.chunkCoord.chunkY === 0 &&
      conversionNeg10.localX === 15 &&
      conversionNeg10.localY === 0,
    'Tile global (-1,0) deve pertencer ao Chunk (-1,0) com local (15,0)',
  );
  console.log('✓ Teste 5 passou: Tile global (-1,0) pertence ao Chunk (-1,0) local 15');

  // =========================================================================
  // 6. Tile global (-16,0) pertence ao Chunk (-1,0) e utiliza coordenada local 0
  // =========================================================================
  const conversionNeg160 = ChunkManager.globalTileToChunkCoord(-16, 0);
  assert(
    conversionNeg160.chunkCoord.chunkX === -1 &&
      conversionNeg160.chunkCoord.chunkY === 0 &&
      conversionNeg160.localX === 0 &&
      conversionNeg160.localY === 0,
    'Tile global (-16,0) deve pertencer ao Chunk (-1,0) com local (0,0)',
  );
  console.log('✓ Teste 6 passou: Tile global (-16,0) pertence ao Chunk (-1,0) local 0');

  // =========================================================================
  // 7. Tile global (-17,0) pertence ao Chunk (-2,0) e utiliza coordenada local 15
  // =========================================================================
  const conversionNeg170 = ChunkManager.globalTileToChunkCoord(-17, 0);
  assert(
    conversionNeg170.chunkCoord.chunkX === -2 &&
      conversionNeg170.chunkCoord.chunkY === 0 &&
      conversionNeg170.localX === 15 &&
      conversionNeg170.localY === 0,
    'Tile global (-17,0) deve pertencer ao Chunk (-2,0) com local (15,0)',
  );
  console.log('✓ Teste 7 passou: Tile global (-17,0) pertence ao Chunk (-2,0) local 15');

  // =========================================================================
  // 8. setTile() e getTile() funcionam corretamente atravessando a fronteira entre chunks
  // =========================================================================
  const manager = new ChunkManager();
  // Garante que os vizinhos comecem explicitamente como GRASS
  manager.setTile(14, 8, TileType.GRASS);
  manager.setTile(17, 8, TileType.GRASS);
  // Modifica o último tile do chunk (0,0) e o primeiro do chunk (1,0)
  manager.setTile(15, 8, TileType.WATER);
  manager.setTile(16, 8, TileType.WATER);

  assert(
    manager.getTile(15, 8)?.type === TileType.WATER,
    'getTile(15, 8) deve retornar WATER no limite direito do Chunk (0,0)',
  );
  assert(
    manager.getTile(16, 8)?.type === TileType.WATER,
    'getTile(16, 8) deve retornar WATER no limite esquerdo do Chunk (1,0)',
  );
  assert(
    manager.getTile(14, 8)?.type === TileType.GRASS,
    'getTile(14, 8) vizinho deve continuar sendo GRASS',
  );
  assert(
    manager.getTile(17, 8)?.type === TileType.GRASS,
    'getTile(17, 8) vizinho deve continuar sendo GRASS',
  );
  console.log('✓ Teste 8 passou: setTile() e getTile() funcionam através da fronteira entre chunks');

  // =========================================================================
  // 9. Chunks diferentes não compartilham acidentalmente o mesmo armazenamento de tiles
  // =========================================================================
  const chunkA = manager.getOrCreateChunk(0, 0);
  const chunkB = manager.getOrCreateChunk(1, 0);
  chunkA.setTile(2, 2, TileType.WATER);
  assert(
    chunkA.getTile(2, 2)?.type === TileType.WATER,
    'chunkA deve ter WATER na posição local (2,2)',
  );
  assert(
    chunkB.getTile(2, 2)?.type === TileType.GRASS,
    'chunkB deve permanecer GRASS na posição local (2,2) independente de chunkA',
  );
  console.log('✓ Teste 9 passou: Chunks diferentes possuem armazenamento de tiles isolado');

  // =========================================================================
  // 10. World.getTile() encapsula os chunks e suporta espaço global
  // =========================================================================
  const world = new World();
  assert(
    world.getTile(0, 0) !== null,
    'World.getTile(0, 0) deve retornar tile válido',
  );
  assert(
    world.getTile(19, 14) !== null,
    'World.getTile(19, 14) deve retornar tile válido',
  );
  assert(
    world.getTile(-1, 0) !== null,
    'World.getTile(-1, 0) em espaço global ilimitado deve retornar tile válido',
  );
  assert(
    world.getTile(20, 0) !== null,
    'World.getTile(20, 0) em espaço global ilimitado deve retornar tile válido',
  );
  assert(
    world.getTile(NaN, 0) === null,
    'World.getTile com coordenadas inválidas (NaN) deve retornar null',
  );
  console.log('✓ Teste 10 passou: World.getTile() encapsula os chunks no espaço global');

  // =========================================================================
  // 11. Geração procedural produz terrenos válidos no World através de Chunks
  // =========================================================================
  let proceduralWaterFound = false;
  let proceduralGrassFound = false;
  for (let y = -50; y < 50; y++) {
    for (let x = -50; x < 50; x++) {
      const tile = world.getTile(x, y);
      if (tile?.type === TileType.WATER) proceduralWaterFound = true;
      if (tile?.type === TileType.GRASS) proceduralGrassFound = true;
      if (proceduralWaterFound && proceduralGrassFound) break;
    }
    if (proceduralWaterFound && proceduralGrassFound) break;
  }
  assert(proceduralWaterFound, 'World deve conter WATER gerada proceduralmente');
  assert(proceduralGrassFound, 'World deve conter GRASS predominante gerada proceduralmente');
  console.log('✓ Teste 11 passou: Terrenos procedurais (GRASS e WATER) gerados com sucesso no World via Chunks');

  // =========================================================================
  // 12. CollisionSystem continua impedindo o Player de atravessar WATER procedural
  // =========================================================================
  // Localiza dinamicamente um tile de água gerado com vizinho oeste caminhável (GRASS)
  let testWaterX = -1;
  let testWaterY = -1;
  for (let y = -50; y < 50; y++) {
    for (let x = -50; x < 50; x++) {
      if (
        world.getTile(x, y)?.type === TileType.WATER &&
        world.getTile(x - 1, y)?.type === TileType.GRASS
      ) {
        testWaterX = x;
        testWaterY = y;
        break;
      }
    }
    if (testWaterX !== -1) break;
  }
  assert(testWaterX !== -1, 'Deve existir ao menos uma fronteira horizontal GRASS -> WATER na região amostrada');

  const collision = new CollisionSystem(world);
  const waterLeftEdgeX = testWaterX * TILE_SIZE;
  const player = new Player(
    { worldX: waterLeftEdgeX - PLAYER_SIZE, worldY: testWaterY * TILE_SIZE },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );

  // Tenta avançar diretamente contra a água (para a direita)
  collision.movePlayer(player, { x: 1, y: 0 }, 0.2);
  assert(
    player.position.worldX === waterLeftEdgeX - PLAYER_SIZE,
    'Player deve ser completamente bloqueado contra a borda da água procedural armazenada no chunk',
  );

  console.log('✓ Teste 12 passou: CollisionSystem continua bloqueando atravessamento de WATER procedural');

  console.log('[TEST] Todos os testes de Chunk e ChunkManager foram concluídos com sucesso!');
}

runChunkTests();

