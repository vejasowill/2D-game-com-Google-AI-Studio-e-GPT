import { CHUNK_SIZE } from './constants.ts';
import { TileType } from './types.ts';
import {
  deterministicHash2D,
  normalizeHash,
  WorldGenerator,
} from './WorldGenerator.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

export function runWorldGeneratorTests(): void {
  console.log('[TEST] Iniciando suíte de testes do WorldGenerator...');

  // =========================================================================
  // Testes unitários da função hash determinística
  // =========================================================================
  const h1 = deterministicHash2D(12345, 10, 20);
  const h2 = deterministicHash2D(12345, 10, 20);
  assert(h1 === h2, 'Hash deve ser 100% determinístico para os mesmos parâmetros');

  const hNeg1 = deterministicHash2D(12345, -5, -12);
  const hNeg2 = deterministicHash2D(12345, -5, -12);
  assert(hNeg1 === hNeg2, 'Hash deve ser determinístico com coordenadas negativas');

  const norm = normalizeHash(h1);
  assert(norm >= 0 && norm < 1, 'normalizeHash deve retornar um valor no intervalo [0, 1)');

  // =========================================================================
  // 1. Mesma seed + mesmo ChunkCoord = exatamente o mesmo Chunk
  // =========================================================================
  const genA = new WorldGenerator(42);
  const genB = new WorldGenerator(42);
  const chunkA1 = genA.generateChunk({ chunkX: 2, chunkY: 3 });
  const chunkB1 = genB.generateChunk({ chunkX: 2, chunkY: 3 });

  let identicalTiles = true;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (chunkA1.getTile(lx, ly)?.type !== chunkB1.getTile(lx, ly)?.type) {
        identicalTiles = false;
        break;
      }
    }
  }
  assert(identicalTiles, 'Teste 1: Mesma seed + mesmo ChunkCoord deve produzir exatamente o mesmo Chunk');
  console.log('✓ Teste 1 passou: Mesma seed + mesmo ChunkCoord = exatamente o mesmo Chunk');

  // =========================================================================
  // 2. Mesma seed + mesma coordenada de tile = mesmo TileType
  // =========================================================================
  const type1 = genA.getTileTypeAt(15, 27);
  const type2 = genB.getTileTypeAt(15, 27);
  assert(type1 === type2, 'Teste 2: Mesma seed + mesma coordenada de tile deve produzir o mesmo TileType');
  console.log('✓ Teste 2 passou: Mesma seed + mesma coordenada de tile = mesmo TileType');

  // =========================================================================
  // 3. Gerar Chunk (0,0) duas vezes na mesma instância produz resultados idênticos
  // =========================================================================
  const chunk00_first = genA.generateChunk({ chunkX: 0, chunkY: 0 });
  const chunk00_second = genA.generateChunk({ chunkX: 0, chunkY: 0 });

  let identicalChunk00 = true;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (chunk00_first.getTile(lx, ly)?.type !== chunk00_second.getTile(lx, ly)?.type) {
        identicalChunk00 = false;
        break;
      }
    }
  }
  assert(identicalChunk00, 'Teste 3: Gerar Chunk (0,0) duas vezes produz resultados idênticos');
  console.log('✓ Teste 3 passou: Gerar Chunk (0,0) duas vezes produz resultados idênticos');

  // =========================================================================
  // 4. Gerar Chunk (0,0) e (1,0) produz resultados diferentes em geral
  // =========================================================================
  const chunk00 = genA.generateChunk({ chunkX: 0, chunkY: 0 });
  const chunk10 = genA.generateChunk({ chunkX: 1, chunkY: 0 });

  let differs = false;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (chunk00.getTile(lx, ly)?.type !== chunk10.getTile(lx, ly)?.type) {
        differs = true;
        break;
      }
    }
    if (differs) break;
  }
  assert(differs, 'Teste 4: Chunks em coordenadas espaciais diferentes devem produzir terrenos diferentes em geral');
  console.log('✓ Teste 4 passou: Gerar Chunk (0,0) e (1,0) produz resultados diferentes');

  // =========================================================================
  // 5. Alterar a seed deve produzir uma configuração de terreno diferente em geral
  // =========================================================================
  const genSeed1 = new WorldGenerator(1001);
  const genSeed2 = new WorldGenerator(9999);
  let seedDiffers = false;

  // Compara uma amostra de tiles para verificar que sementes diferentes geram saídas diferentes
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (genSeed1.getTileTypeAt(x, y) !== genSeed2.getTileTypeAt(x, y)) {
        seedDiffers = true;
        break;
      }
    }
    if (seedDiffers) break;
  }
  assert(seedDiffers, 'Teste 5: Sementes diferentes devem produzir configurações de terreno distintas');
  console.log('✓ Teste 5 passou: Alterar a seed produz uma configuração de terreno diferente');

  // =========================================================================
  // 6. Coordenadas negativas são determinísticas
  // =========================================================================
  const negChunk1 = genA.generateChunk({ chunkX: -2, chunkY: -3 });
  const negChunk2 = genA.generateChunk({ chunkX: -2, chunkY: -3 });

  let negIdentical = true;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (negChunk1.getTile(lx, ly)?.type !== negChunk2.getTile(lx, ly)?.type) {
        negIdentical = false;
        break;
      }
    }
  }
  assert(negIdentical, 'Teste 6: Chunks com coordenadas negativas devem ser 100% determinísticos');
  console.log('✓ Teste 6 passou: Coordenadas negativas são determinísticas');

  // =========================================================================
  // 7. A geração não depende da ordem em que os chunks são solicitados
  // =========================================================================
  const genOrderA = new WorldGenerator(54321);
  const genOrderB = new WorldGenerator(54321);

  // Ordem A: gera (0,0) depois (1,0)
  const a00 = genOrderA.generateChunk({ chunkX: 0, chunkY: 0 });
  const a10 = genOrderA.generateChunk({ chunkX: 1, chunkY: 0 });

  // Ordem B: gera (1,0) primeiro, depois (0,0)
  const b10 = genOrderB.generateChunk({ chunkX: 1, chunkY: 0 });
  const b00 = genOrderB.generateChunk({ chunkX: 0, chunkY: 0 });

  let orderConsistent = true;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (a00.getTile(lx, ly)?.type !== b00.getTile(lx, ly)?.type) {
        orderConsistent = false;
        break;
      }
      if (a10.getTile(lx, ly)?.type !== b10.getTile(lx, ly)?.type) {
        orderConsistent = false;
        break;
      }
    }
  }
  assert(orderConsistent, 'Teste 7: A geração não pode depender da ordem temporal de solicitação dos chunks');
  console.log('✓ Teste 7 passou: Geração é independente da ordem de requisição dos chunks');

  // =========================================================================
  // 8. Tiles na fronteira entre chunks utilizam coordenadas globais corretamente
  // =========================================================================
  // O tile local 15 no Chunk (0, 0) corresponde ao global 15.
  // O tile local 0 no Chunk (1, 0) corresponde ao global 16.
  // Ambos devem ter exatamente o mesmo tipo retornado por getTileTypeAt(15, y) e getTileTypeAt(16, y).
  const c0 = genA.generateChunk({ chunkX: 0, chunkY: 0 });
  const c1 = genA.generateChunk({ chunkX: 1, chunkY: 0 });

  for (let y = 0; y < CHUNK_SIZE; y++) {
    const tileGlobal15Expected = genA.getTileTypeAt(15, y);
    const tileGlobal16Expected = genA.getTileTypeAt(16, y);

    assert(
      c0.getTile(15, y)?.type === tileGlobal15Expected,
      `Fronteira c0 local (15, ${y}) deve equivaler ao global (15, ${y})`,
    );
    assert(
      c1.getTile(0, y)?.type === tileGlobal16Expected,
      `Fronteira c1 local (0, ${y}) deve equivaler ao global (16, ${y})`,
    );
  }
  console.log('✓ Teste 8 passou: Tiles na fronteira entre chunks utilizam coordenadas globais corretamente');

  // =========================================================================
  // 9. O mesmo tile global deve receber o mesmo TileType independentemente do Chunk pelo qual foi acessado
  // =========================================================================
  const globalTileCoordX = 16;
  const globalTileCoordY = 8;
  const directType = genA.getTileTypeAt(globalTileCoordX, globalTileCoordY);
  const chunkTileType = c1.getTile(0, 8)?.type; // Chunk (1,0) com localX = 0 => globalX = 16

  assert(
    directType === chunkTileType,
    'Teste 9: O mesmo tile global deve ter o mesmo tipo via getTileTypeAt e dentro do Chunk',
  );
  console.log('✓ Teste 9 passou: Mesmo tile global recebe o mesmo TileType independentemente da via de acesso');

  // =========================================================================
  // 10. A geração produz apenas TileTypes atualmente suportados: GRASS ou WATER
  // =========================================================================
  const testChunk = genA.generateChunk({ chunkX: -1, chunkY: 2 });
  let hasOnlySupportedTypes = true;
  let hasGrass = false;
  let hasWater = false;

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const t = testChunk.getTile(lx, ly)?.type;
      if (t !== TileType.GRASS && t !== TileType.WATER) {
        hasOnlySupportedTypes = false;
        break;
      }
      if (t === TileType.GRASS) hasGrass = true;
      if (t === TileType.WATER) hasWater = true;
    }
  }

  assert(hasOnlySupportedTypes, 'Teste 10: Devem ser gerados apenas TileTypes suportados (GRASS e WATER)');
  console.log('✓ Teste 10 passou: Apenas TileTypes suportados (GRASS ou WATER) são produzidos');

  console.log('[TEST] Todos os testes do WorldGenerator foram concluídos com sucesso!');
}

runWorldGeneratorTests();
