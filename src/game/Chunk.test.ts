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
  // 10. World.getTile() continua funcionando exatamente como antes
  // =========================================================================
  const world = new World(20, 15);
  assert(
    world.getTile(0, 0)?.type === TileType.GRASS,
    'World.getTile(0, 0) deve retornar GRASS',
  );
  assert(
    world.getTile(19, 14)?.type === TileType.GRASS,
    'World.getTile(19, 14) deve retornar GRASS',
  );
  assert(
    world.getTile(-1, 0) === null,
    'World.getTile(-1, 0) fora dos limites deve retornar null',
  );
  assert(
    world.getTile(20, 0) === null,
    'World.getTile(20, 0) fora dos limites deve retornar null',
  );
  assert(
    world.getTile(0, 15) === null,
    'World.getTile(0, 15) fora dos limites deve retornar null',
  );
  console.log('✓ Teste 10 passou: World.getTile() encapsula os chunks e respeita limites espaciais');

  // =========================================================================
  // 11. Water continua existindo nas coordenadas atuais (X: 13..16, Y: 5..8)
  // =========================================================================
  // Note que X=13..15 ficam no Chunk (0,0) e X=16 fica no Chunk (1,0)
  for (let y = 5; y <= 8; y++) {
    for (let x = 13; x <= 16; x++) {
      const tile = world.getTile(x, y);
      assert(
        tile?.type === TileType.WATER,
        `Tile em (${x}, ${y}) deve ser WATER na lagoa de teste`,
      );
    }
  }
  // Vizinho adjacente à água deve ser grama
  assert(
    world.getTile(12, 6)?.type === TileType.GRASS,
    'Tile em (12, 6) a oeste da lagoa deve ser GRASS',
  );
  assert(
    world.getTile(17, 6)?.type === TileType.GRASS,
    'Tile em (17, 6) a leste da lagoa deve ser GRASS',
  );
  console.log('✓ Teste 11 passou: Lagoa de WATER preservada nas coordenadas originais através da fronteira de chunks');

  // =========================================================================
  // 12. CollisionSystem continua impedindo o Player de atravessar WATER
  // =========================================================================
  const collision = new CollisionSystem(world);
  const waterLeftEdgeX = 13 * TILE_SIZE;
  const player = new Player(
    { worldX: waterLeftEdgeX - PLAYER_SIZE, worldY: 6 * TILE_SIZE },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );

  // Tenta avançar diretamente contra a água (para a direita)
  collision.movePlayer(player, { x: 1, y: 0 }, 0.2);
  assert(
    player.position.worldX === waterLeftEdgeX - PLAYER_SIZE,
    'Player deve ser completamente bloqueado contra a borda da água armazenada no chunk',
  );

  console.log('✓ Teste 12 passou: CollisionSystem continua bloqueando atravessamento de WATER');

  console.log('[TEST] Todos os testes de Chunk e ChunkManager foram concluídos com sucesso!');
}

runChunkTests();
