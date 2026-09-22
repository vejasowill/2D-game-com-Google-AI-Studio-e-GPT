import { Biome } from './Biome.ts';
import { BiomeResolver, BIOME_THRESHOLDS } from './BiomeResolver.ts';
import { CHUNK_SIZE } from './constants.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';
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
  // 4. Chunks em regiões espaciais diferentes produzem terrenos diferentes em geral
  // =========================================================================
  const chunk00 = genA.generateChunk({ chunkX: 0, chunkY: 0 });
  const chunkDistant = genA.generateChunk({ chunkX: -9, chunkY: -9 });

  let differs = false;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (chunk00.getTile(lx, ly)?.type !== chunkDistant.getTile(lx, ly)?.type) {
        differs = true;
        break;
      }
    }
    if (differs) break;
  }
  assert(differs, 'Teste 4: Chunks em regiões espaciais diferentes devem produzir terrenos diferentes em geral');
  console.log('✓ Teste 4 passou: Chunks em regiões espaciais diferentes produzem terrenos diferentes');

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

  // =========================================================================
  // Testes Ambientais: Temperatura, Umidade, Elevação e Biomas
  // =========================================================================

  // 11. Mesma seed + mesma coordenada -> mesma temperatura, umidade e elevação
  const envA = genA.getEnvironmentalDataAt(45, -80);
  const envB = genB.getEnvironmentalDataAt(45, -80);
  assert(envA.temperature === envB.temperature, 'Teste 11: Mesma seed deve produzir a mesma temperatura');
  assert(envA.humidity === envB.humidity, 'Teste 11: Mesma seed deve produzir a mesma umidade');
  assert(envA.elevation === envB.elevation, 'Teste 11: Mesma seed deve produzir a mesma elevação');
  console.log('✓ Teste 11 passou: Mesma seed + mesma coordenada -> mesmos dados ambientais');

  // 12. Seeds diferentes produzem campos ambientais distintos
  const envSeed1 = genSeed1.getEnvironmentalDataAt(100, 100);
  const envSeed2 = genSeed2.getEnvironmentalDataAt(100, 100);
  const fieldsDiffer = (
    envSeed1.temperature !== envSeed2.temperature ||
    envSeed1.humidity !== envSeed2.humidity ||
    envSeed1.elevation !== envSeed2.elevation
  );
  assert(fieldsDiffer, 'Teste 12: Seeds diferentes devem produzir campos ambientais diferentes');
  console.log('✓ Teste 12 passou: Seed diferente -> campos ambientais diferentes em geral');

  // 13. Coordenadas negativas continuam funcionando perfeitamente
  const envNeg = genA.getEnvironmentalDataAt(-1234, -5678);
  assert(typeof envNeg.temperature === 'number' && !Number.isNaN(envNeg.temperature), 'Temperatura negativa válida');
  assert(typeof envNeg.humidity === 'number' && !Number.isNaN(envNeg.humidity), 'Umidade negativa válida');
  assert(typeof envNeg.elevation === 'number' && !Number.isNaN(envNeg.elevation), 'Elevação negativa válida');
  console.log('✓ Teste 13 passou: Coordenadas negativas continuam funcionando');

  // 14. Os valores sempre permanecem estritamente no intervalo [0, 1)
  const samplePoints: [number, number][] = [
    [0, 0], [10, 10], [-50, 75], [9999, -9999], [-50000, -50000], [100000, 100000],
  ];
  for (const [x, y] of samplePoints) {
    const data = genA.getEnvironmentalDataAt(x, y);
    assert(data.temperature >= 0 && data.temperature < 1, `Temperatura fora de [0, 1) em (${x},${y}): ${data.temperature}`);
    assert(data.humidity >= 0 && data.humidity < 1, `Umidade fora de [0, 1) em (${x},${y}): ${data.humidity}`);
    assert(data.elevation >= 0 && data.elevation < 1, `Elevação fora de [0, 1) em (${x},${y}): ${data.elevation}`);
  }
  console.log('✓ Teste 14 passou: Os valores sempre permanecem no intervalo definido [0, 1)');

  // 15. Consultas são independentes da ordem de execução
  const genIndep = new WorldGenerator(8888);
  // Ordem 1: consulta (50, 50) depois (10, 10)
  const first50 = genIndep.getEnvironmentalDataAt(50, 50);
  const first10 = genIndep.getEnvironmentalDataAt(10, 10);
  // Ordem 2: consulta (10, 10) depois (50, 50) em novo gerador com mesma seed
  const genIndep2 = new WorldGenerator(8888);
  const second10 = genIndep2.getEnvironmentalDataAt(10, 10);
  const second50 = genIndep2.getEnvironmentalDataAt(50, 50);
  assert(first50.temperature === second50.temperature && first50.elevation === second50.elevation, 'Ordem não afeta (50,50)');
  assert(first10.temperature === second10.temperature && first10.humidity === second10.humidity, 'Ordem não afeta (10,10)');
  console.log('✓ Teste 15 passou: Consultas são independentes da ordem de execução');

  // 16. Coerência espacial de Temperatura, Umidade e Elevação (variação gradual entre tiles vizinhos)
  for (let step = 0; step < 20; step++) {
    const x = step * 5;
    const y = step * 3;
    const d0 = genA.getEnvironmentalDataAt(x, y);
    const dNeighbor = genA.getEnvironmentalDataAt(x + 1, y);

    const diffTemp = Math.abs(d0.temperature - dNeighbor.temperature);
    const diffHum = Math.abs(d0.humidity - dNeighbor.humidity);
    const diffElev = Math.abs(d0.elevation - dNeighbor.elevation);

    // Como as grades são de 32, 48 e 36 tiles com smoothstep, a variação entre tiles vizinhos (dx=1) é < 0.15
    assert(diffTemp < 0.15, `Temperatura não suave entre vizinhos: salto de ${diffTemp}`);
    assert(diffHum < 0.15, `Umidade não suave entre vizinhos: salto de ${diffHum}`);
    assert(diffElev < 0.15, `Elevação não suave entre vizinhos: salto de ${diffElev}`);
  }
  console.log('✓ Teste 16 passou: Temperatura, Umidade e Elevação possuem coerência espacial (sem ruído desconexo)');

  // 17. BiomeResolver é determinístico e cada combinação produz um Biome válido
  const allBiomes = new Set([Biome.OCEAN, Biome.PLAINS, Biome.FOREST, Biome.DESERT, Biome.MOUNTAIN]);
  // Testar regras explícitas
  const oceanBiome = BiomeResolver.resolveBiome({ elevation: 0.1, temperature: 0.5, humidity: 0.5 });
  assert(oceanBiome === Biome.OCEAN, 'Elevação baixa deve resultar em OCEAN');
  const mountainBiome = BiomeResolver.resolveBiome({ elevation: 0.85, temperature: 0.5, humidity: 0.5 });
  assert(mountainBiome === Biome.MOUNTAIN, 'Elevação alta deve resultar em MOUNTAIN');
  const desertBiome = BiomeResolver.resolveBiome({ elevation: 0.5, temperature: 0.8, humidity: 0.2 });
  assert(desertBiome === Biome.DESERT, 'Alta temperatura + baixa umidade deve resultar em DESERT');
  const forestBiome = BiomeResolver.resolveBiome({ elevation: 0.5, temperature: 0.5, humidity: 0.8 });
  assert(forestBiome === Biome.FOREST, 'Alta umidade deve resultar em FOREST');
  const plainsBiome = BiomeResolver.resolveBiome({ elevation: 0.5, temperature: 0.5, humidity: 0.45 });
  assert(plainsBiome === Biome.PLAINS, 'Condições intermediárias devem resultar em PLAINS');
  console.log('✓ Teste 17 passou: BiomeResolver é determinístico e atende às regras climáticas');

  // 18. Diversidade de Biomas gerados na exploração do mapa
  const observedBiomes = new Set<Biome>();
  for (let y = -100; y <= 100; y += 10) {
    for (let x = -100; x <= 100; x += 10) {
      const b = genA.getBiomeAt(x, y);
      assert(allBiomes.has(b), `Bioma retornado deve ser válido: ${b}`);
      observedBiomes.add(b);
    }
  }
  assert(observedBiomes.size >= 3, `O mapa deve gerar variedade de biomas (encontrados: ${observedBiomes.size})`);
  console.log(`✓ Teste 18 passou: Cada combinação produz um Biome válido (biomas encontrados: ${Array.from(observedBiomes).join(', ')})`);

  // 19. Consultas ambientais e de bioma NÃO criam chunks
  const worldForBiomeTest = new World(42);
  const managerForBiome = worldForBiomeTest.getChunkManager();
  assert(managerForBiome.getLoadedChunkCount() === 0, 'World virgem começa com 0 chunks');

  worldForBiomeTest.getEnvironmentalDataAt(500, 500);
  worldForBiomeTest.getBiomeAt(500, 500);
  worldForBiomeTest.getEnvironmentalDataAt(-999, -999);
  worldForBiomeTest.getBiomeAt(-999, -999);

  assert(
    managerForBiome.getLoadedChunkCount() === 0,
    `getEnvironmentalDataAt e getBiomeAt NUNCA devem criar chunks (obtido: ${managerForBiome.getLoadedChunkCount()})`,
  );
  console.log('✓ Teste 19 passou: getBiomeAt e getEnvironmentalDataAt não criam chunks');

  // 20. O terreno existente continua produzindo apenas TileTypes suportados (GRASS e WATER)
  const terrainChunk = genA.generateChunk({ chunkX: 5, chunkY: -5 });
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tt = terrainChunk.getTile(lx, ly)?.type;
      assert(tt === TileType.GRASS || tt === TileType.WATER, 'TileType deve ser estritamente GRASS ou WATER');
    }
  }
  console.log('✓ Teste 20 passou: Terreno continua produzindo apenas TileTypes suportados via BiomeResolver');

  // 21. Teste de Integração Completo:
  // WorldGenerator(seed) -> getEnvironmentalDataAt(x,y) -> getBiomeAt(x,y) -> getTileTypeAt(x,y)
  const sampleCoordX = 256;
  const sampleCoordY = -128;
  const sampleEnv = genA.getEnvironmentalDataAt(sampleCoordX, sampleCoordY);
  const sampleBiome = genA.getBiomeAt(sampleCoordX, sampleCoordY);
  const sampleTileType = genA.getTileTypeAt(sampleCoordX, sampleCoordY);

  const directResolvedBiome = BiomeResolver.resolveBiome(sampleEnv);
  assert(sampleBiome === directResolvedBiome, 'getBiomeAt deve corresponder à resolução de getEnvironmentalDataAt');
  const expectedTileType = BiomeResolver.biomeToTileType(sampleBiome);
  assert(sampleTileType === expectedTileType, 'getTileTypeAt deve corresponder a biomeToTileType');
  console.log('✓ Teste 21 passou: Pipeline de integração (Coord -> EnvData -> Biome -> TileType) verificado sem chunks');

  // 22. Coordenadas globais muito distantes (100.000 e -100.000)
  const farPos = genA.getEnvironmentalDataAt(100000, 100000);
  const farPos2 = genB.getEnvironmentalDataAt(100000, 100000);
  assert(farPos.temperature === farPos2.temperature, 'Coordenadas muito distantes (100000, 100000) devem ser determinísticas');
  assert(farPos.elevation === farPos2.elevation, 'Elevação em coordenada distante consistente');

  const farNeg = genA.getEnvironmentalDataAt(-100000, -100000);
  const farNeg2 = genB.getEnvironmentalDataAt(-100000, -100000);
  assert(farNeg.temperature === farNeg2.temperature, 'Coordenadas muito distantes (-100000, -100000) devem ser determinísticas');
  assert(farNeg.humidity === farNeg2.humidity, 'Umidade em coordenada distante negativa consistente');
  console.log('✓ Teste 22 passou: Coordenadas globais extremas (+100.000 e -100.000) permanecem determinísticas');

  // 23. Independência ortogonal entre Temperatura e Umidade
  // Garantir que umidade não é cópia nem espelho inverso da temperatura
  let notIdentical = false;
  let notInverted = false;
  for (let i = 0; i < 50; i++) {
    const ed = genA.getEnvironmentalDataAt(i * 13, i * 17);
    if (Math.abs(ed.temperature - ed.humidity) > 0.05) notIdentical = true;
    if (Math.abs((1 - ed.temperature) - ed.humidity) > 0.05) notInverted = true;
  }
  assert(notIdentical, 'Temperatura e umidade devem ser campos espacialmente distintos');
  assert(notInverted, 'Umidade não deve ser mera inversão aritmética da temperatura');
  console.log('✓ Teste 23 passou: Campos de temperatura e umidade são ortogonais e desacoplados');

  console.log('[TEST] Todos os testes do WorldGenerator foram concluídos com sucesso!');
}

runWorldGeneratorTests();
