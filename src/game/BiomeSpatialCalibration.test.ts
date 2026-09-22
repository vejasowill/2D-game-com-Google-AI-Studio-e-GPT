import { Biome } from './Biome.ts';
import { BiomeResolver } from './BiomeResolver.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';
import { WorldGenerator } from './WorldGenerator.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[CALIBRATION TEST FAILED]: ${message}`);
  }
}

export function runBiomeSpatialCalibrationTests(): void {
  console.log('[TEST] Iniciando suíte de testes quantitativos de Calibração Espacial dos Biomas...');

  const seed = 12345;
  const gen = new WorldGenerator(seed);

  // =========================================================================
  // 1. Taxa de Transição entre Vizinhos (Métrica de Fragmentação Espacial)
  // =========================================================================
  // No sistema anterior (escala 8/48/36), a taxa de transição entre tiles adjacentes
  // era de ~10.8% (uma quebra a cada ~9 tiles).
  // No sistema calibrado com macro e mesoescala, a taxa deve ser < 3.5%,
  // garantindo grandes regiões homogêneas e contínuas.
  const SAMPLE_SIZE = 300;
  let horizontalTransitions = 0;
  let horizontalPairs = 0;
  let verticalTransitions = 0;
  let verticalPairs = 0;

  const biomeGrid: Biome[][] = [];
  for (let y = 0; y < SAMPLE_SIZE; y++) {
    biomeGrid[y] = [];
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      biomeGrid[y][x] = gen.getBiomeAt(x, y);
    }
  }

  for (let y = 0; y < SAMPLE_SIZE; y++) {
    for (let x = 0; x < SAMPLE_SIZE - 1; x++) {
      horizontalPairs++;
      if (biomeGrid[y][x] !== biomeGrid[y][x + 1]) {
        horizontalTransitions++;
      }
    }
  }

  for (let y = 0; y < SAMPLE_SIZE - 1; y++) {
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      verticalPairs++;
      if (biomeGrid[y][x] !== biomeGrid[y + 1][x]) {
        verticalTransitions++;
      }
    }
  }

  const hRate = (horizontalTransitions / horizontalPairs) * 100;
  const vRate = (verticalTransitions / verticalPairs) * 100;
  const avgTransitionRate = (hRate + vRate) / 2;

  console.log(`[MÉTRICA] Taxa de transição entre vizinhos: ${avgTransitionRate.toFixed(2)}% (H: ${hRate.toFixed(2)}%, V: ${vRate.toFixed(2)}%)`);
  assert(
    avgTransitionRate < 3.5,
    `Taxa de transição muito alta (${avgTransitionRate.toFixed(2)}%), indicando fragmentação excessiva`,
  );
  console.log('✓ Teste 1 passou: Taxa de transição drasticamente reduzida (sem fragmentação espúria)');

  // =========================================================================
  // 2. Comprimento Médio de Segmentos Contínuos (Run-Length por Bioma)
  // =========================================================================
  // No sistema anterior, as extensões médias de biomas eram de apenas 7 a 10 tiles.
  // No sistema calibrado, as regiões devem ter extensões médias substanciais (> 30 tiles).
  const runLengths: Record<Biome, number[]> = {
    [Biome.OCEAN]: [],
    [Biome.PLAINS]: [],
    [Biome.FOREST]: [],
    [Biome.DESERT]: [],
    [Biome.MOUNTAIN]: [],
  };

  for (let y = 0; y < SAMPLE_SIZE; y++) {
    let curBiome: Biome | null = null;
    let length = 0;
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      const b = biomeGrid[y][x];
      if (b === curBiome) {
        length++;
      } else {
        if (curBiome !== null) {
          runLengths[curBiome].push(length);
        }
        curBiome = b;
        length = 1;
      }
    }
    if (curBiome !== null) {
      runLengths[curBiome].push(length);
    }
  }

  for (const b of [Biome.OCEAN, Biome.PLAINS, Biome.FOREST, Biome.DESERT, Biome.MOUNTAIN]) {
    const runs = runLengths[b];
    if (runs.length > 0) {
      const avg = runs.reduce((acc, val) => acc + val, 0) / runs.length;
      console.log(`[MÉTRICA] Bioma ${b.padEnd(8)}: Extensão média contínua de ${avg.toFixed(1)} tiles (${runs.length} ocorrências)`);
      assert(
        avg >= 25,
        `Extensão média do bioma ${b} (${avg.toFixed(1)} tiles) é muito baixa, indicando fragmentação`,
      );
    }
  }
  console.log('✓ Teste 2 passou: Comprimento médio de regiões contínuas superior a 25-30 tiles para todos os biomas');

  // =========================================================================
  // 3. Diversidade e Equilíbrio Geográfico de todos os 5 Biomas
  // =========================================================================
  // Garantir que todos os 5 biomas ocorrem e que nenhum bioma domina mais de 45% do mapa
  const counts: Record<Biome, number> = {
    [Biome.OCEAN]: 0,
    [Biome.PLAINS]: 0,
    [Biome.FOREST]: 0,
    [Biome.DESERT]: 0,
    [Biome.MOUNTAIN]: 0,
  };
  let totalTiles = 0;

  for (let y = 0; y < SAMPLE_SIZE; y++) {
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      counts[biomeGrid[y][x]]++;
      totalTiles++;
    }
  }

  for (const b of [Biome.OCEAN, Biome.PLAINS, Biome.FOREST, Biome.DESERT, Biome.MOUNTAIN]) {
    const pct = (counts[b] / totalTiles) * 100;
    console.log(`[MÉTRICA] Proporção de ${b.padEnd(8)}: ${pct.toFixed(1)}%`);
    assert(pct > 0, `O bioma ${b} deve estar presente no mundo gerado`);
    assert(pct < 45, `O bioma ${b} (${pct.toFixed(1)}%) não deve dominar monopolisticamente o mapa`);
  }
  console.log('✓ Teste 3 passou: Todos os 5 biomas coexistem harmonicamente sem monopólio de um único bioma');

  // =========================================================================
  // 4. Continuidade Espacial e Ausência de Ruído Branco
  // =========================================================================
  // A diferença ambiental entre qualquer par de tiles vizinhos (dx=1, dy=0 ou dx=0, dy=1)
  // deve ser suave (< 0.05), comprovando ausência de ruído desconexo.
  for (let step = 0; step < 50; step++) {
    const tx = step * 17 - 100;
    const ty = step * 13 - 100;
    const env0 = gen.getEnvironmentalDataAt(tx, ty);
    const envX = gen.getEnvironmentalDataAt(tx + 1, ty);
    const envY = gen.getEnvironmentalDataAt(tx, ty + 1);

    const dTempX = Math.abs(env0.temperature - envX.temperature);
    const dHumX = Math.abs(env0.humidity - envX.humidity);
    const dElevX = Math.abs(env0.elevation - envX.elevation);

    const dTempY = Math.abs(env0.temperature - envY.temperature);
    const dHumY = Math.abs(env0.humidity - envY.humidity);
    const dElevY = Math.abs(env0.elevation - envY.elevation);

    assert(dTempX < 0.05 && dTempY < 0.05, `Salto térmico abrupto entre vizinhos: ${dTempX}, ${dTempY}`);
    assert(dHumX < 0.05 && dHumY < 0.05, `Salto de umidade abrupto entre vizinhos: ${dHumX}, ${dHumY}`);
    assert(dElevX < 0.05 && dElevY < 0.05, `Salto de elevação abrupto entre vizinhos: ${dElevX}, ${dElevY}`);
  }
  console.log('✓ Teste 4 passou: Campos ambientais são perfeitamente contínuos e sem ruído branco');

  // =========================================================================
  // 5. Coerência entre Fronteiras de Chunks
  // =========================================================================
  // Chunks adjacentes devem casar perfeitamente os biomas e dados ambientais nos tiles limítrofes
  const c0 = gen.generateChunk({ chunkX: 0, chunkY: 0 });
  const c1 = gen.generateChunk({ chunkX: 1, chunkY: 0 });

  for (let localY = 0; localY < 16; localY++) {
    // Tile 15 no chunk 0 equivale a globalTileX = 15
    // Tile 0 no chunk 1 equivale a globalTileX = 16
    const b15 = gen.getBiomeAt(15, localY);
    const b16 = gen.getBiomeAt(16, localY);
    const tileChunk0 = c0.getTile(15, localY);
    const tileChunk1 = c1.getTile(0, localY);

    assert(
      tileChunk0?.type === BiomeResolver.biomeToTileType(b15),
      `Tile do chunk 0 em (15, ${localY}) deve corresponder ao bioma global`,
    );
    assert(
      tileChunk1?.type === BiomeResolver.biomeToTileType(b16),
      `Tile do chunk 1 em (0, ${localY}) deve corresponder ao bioma global`,
    );
  }
  console.log('✓ Teste 5 passou: Continuidade e integridade perfeitas nas fronteiras entre chunks');

  // =========================================================================
  // 6. Determinismo Multi-Seed em Coordenadas Positivas e Negativas
  // =========================================================================
  const testSeeds = [42, 99999, 54321];
  for (const s of testSeeds) {
    const g1 = new WorldGenerator(s);
    const g2 = new WorldGenerator(s);
    const coords = [
      { x: 0, y: 0 },
      { x: -500, y: -250 },
      { x: 1200, y: -800 },
      { x: -3000, y: 4000 },
    ];
    for (const c of coords) {
      const e1 = g1.getEnvironmentalDataAt(c.x, c.y);
      const e2 = g2.getEnvironmentalDataAt(c.x, c.y);
      assert(e1.temperature === e2.temperature, `Determinismo de temperatura falhou em seed ${s}`);
      assert(e1.humidity === e2.humidity, `Determinismo de umidade falhou em seed ${s}`);
      assert(e1.elevation === e2.elevation, `Determinismo de elevação falhou em seed ${s}`);
      assert(g1.getBiomeAt(c.x, c.y) === g2.getBiomeAt(c.x, c.y), `Determinismo de bioma falhou em seed ${s}`);
    }
  }
  console.log('✓ Teste 6 passou: Determinismo 100% estrito em coordenadas positivas e negativas');

  // =========================================================================
  // 7. Consultas não provocam materialização de Chunks no World
  // =========================================================================
  const world = new World(seed);
  const chunkManager = world.getChunkManager();
  assert(chunkManager.getLoadedChunkCount() === 0, 'World virgem deve iniciar com 0 chunks');

  for (let i = -100; i <= 100; i += 20) {
    world.getEnvironmentalDataAt(i, i);
    world.getBiomeAt(i, i);
  }
  assert(
    chunkManager.getLoadedChunkCount() === 0,
    `getBiomeAt não deve instanciar chunks na memória (contagem: ${chunkManager.getLoadedChunkCount()})`,
  );
  console.log('✓ Teste 7 passou: Consultas ambientais e de bioma são puras e não materializam chunks');

  console.log('[TEST] Todos os testes quantitativos de Calibração Espacial foram concluídos com sucesso!');
}

runBiomeSpatialCalibrationTests();
