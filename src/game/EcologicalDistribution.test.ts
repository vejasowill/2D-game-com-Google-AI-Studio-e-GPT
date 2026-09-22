import { Biome } from './Biome.ts';
import { CHUNK_SIZE, DEFAULT_WORLD_SEED, TILE_SIZE } from './constants.ts';
import { EcologicalDensityField } from './EcologicalDensityField.ts';
import { NaturalObjectType } from './NaturalObjectDefinition.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runEcologicalDistributionTests(): void {
  console.log('[TEST] Iniciando suíte de testes de Distribuição Ecológica dos Objetos Naturais...');

  // =========================================================================
  // A. DETERMINISMO ESTRITO POR SEED
  // Mundos com a mesma seed geram exatamente os mesmos valores de densidade e objetos.
  // =========================================================================
  const worldA = new World(DEFAULT_WORLD_SEED);
  const worldB = new World(DEFAULT_WORLD_SEED);

  for (let y = -20; y <= 20; y += 5) {
    for (let x = -20; x <= 20; x += 5) {
      const densA = worldA.getEcologicalDensityAt(x, y);
      const densB = worldB.getEcologicalDensityAt(x, y);
      assert(densA === densB, `Densidade em (${x},${y}) deve ser idêntica na mesma seed`);

      const objA = worldA.getNaturalObjectAt(x, y);
      const objB = worldB.getNaturalObjectAt(x, y);
      assert(
        (objA === null && objB === null) || (objA !== null && objB !== null && objA.id === objB.id),
        `getNaturalObjectAt em (${x},${y}) deve ser perfeitamente determinístico`,
      );
    }
  }
  console.log('✓ Teste A passou: Determinismo estrito por seed confirmado');

  // =========================================================================
  // B. INDEPENDÊNCIA DA ORDEM DE CARREGAMENTO (STREAMING)
  // =========================================================================
  const streamWorld1 = new World(DEFAULT_WORLD_SEED);
  const streamWorld2 = new World(DEFAULT_WORLD_SEED);

  // Ordem 1: Carrega chunk (2, 2) primeiro, depois (-2, -2)
  streamWorld1.getChunkManager().getChunk(2, 2);
  streamWorld1.getChunkManager().getChunk(-2, -2);

  // Ordem 2: Inversa
  streamWorld2.getChunkManager().getChunk(-2, -2);
  streamWorld2.getChunkManager().getChunk(2, 2);

  const objsW1 = streamWorld1.getObjectManager().getAllObjects();
  const objsW2 = streamWorld2.getObjectManager().getAllObjects();
  assert(
    objsW1.length === objsW2.length,
    `Quantidade de objetos gerados deve ser idêntica (${objsW1.length} vs ${objsW2.length})`,
  );
  for (const o1 of objsW1) {
    const o2 = streamWorld2.getObjectManager().getObjectById(o1.id);
    assert(o2 !== null, `Objeto ${o1.id} deve existir com carregamento em ordem inversa`);
    assert(o1.position.worldX === o2?.position.worldX && o1.position.worldY === o2?.position.worldY, 'Posições devem bater');
  }
  console.log('✓ Teste B passou: Independência da ordem de carregamento confirmada');

  // =========================================================================
  // C. COORDENADAS NEGATIVAS ARBITRÁRIAS
  // Suporte sem descontinuidades ou overflow em quadrantes negativos distantes.
  // =========================================================================
  const densityNeg = worldA.getEcologicalDensityAt(-54321, -98765);
  assert(densityNeg >= 0 && densityNeg < 1, `Densidade em coordenadas negativas deve estar em [0, 1). Obtido: ${densityNeg}`);
  console.log('✓ Teste C passou: Coordenadas negativas e distantes suportadas com sucesso');

  // =========================================================================
  // D. CONTINUIDADE ESPACIAL DA DENSIDADE (SEM RUÍDO BRANCO OU SALTOS ABRUPTOS)
  // A diferença entre tiles vizinhos (distância 1) deve ser muito pequena (< 0.08).
  // =========================================================================
  let maxNeighborDiff = 0;
  for (let y = -40; y <= 40; y += 4) {
    for (let x = -40; x <= 40; x += 4) {
      const dCenter = worldA.getEcologicalDensityAt(x, y);
      const dRight = worldA.getEcologicalDensityAt(x + 1, y);
      const dDown = worldA.getEcologicalDensityAt(x, y + 1);

      const diffH = Math.abs(dCenter - dRight);
      const diffV = Math.abs(dCenter - dDown);
      if (diffH > maxNeighborDiff) maxNeighborDiff = diffH;
      if (diffV > maxNeighborDiff) maxNeighborDiff = diffV;
    }
  }
  assert(
    maxNeighborDiff < 0.08,
    `A densidade ecológica deve ser suave e contínua. Salto máximo observado: ${maxNeighborDiff.toFixed(4)}`,
  );
  console.log(`✓ Teste D passou: Continuidade espacial estrita da densidade confirmada (salto máx entre vizinhos: ${maxNeighborDiff.toFixed(4)} < 0.08)`);

  // =========================================================================
  // E. EXISTÊNCIA DE MACRO-REGIÕES COM DENSIDADES VARIADAS DENTRO DO MESMO BIOMA (FOREST)
  // =========================================================================
  const worldGen = worldA.getWorldGenerator();
  const natGen = worldGen.getNaturalObjectGenerator();

  // Encontrar uma área de floresta contínua e verificar que a densidade ecológica e
  // a probabilidade efetiva de spawn de TREE variam organicamente.
  let minTreeChance = 1.0;
  let maxTreeChance = 0.0;
  let minDensity = 1.0;
  let maxDensity = 0.0;

  for (let y = -100; y <= 100; y += 2) {
    for (let x = -100; x <= 100; x += 2) {
      const biome = worldGen.getBiomeAt(x, y);
      if (biome === Biome.FOREST) {
        const dens = natGen.getDensityAt(x, y);
        const chance = natGen.getEffectiveSpawnChance(NaturalObjectType.TREE, x, y);

        if (dens < minDensity) minDensity = dens;
        if (dens > maxDensity) maxDensity = dens;
        if (chance < minTreeChance) minTreeChance = chance;
        if (chance > maxTreeChance) maxTreeChance = chance;
      }
    }
  }

  assert(minDensity < 0.30, `Deve haver clareiras com densidade baixa em floresta. Min: ${minDensity.toFixed(3)}`);
  assert(maxDensity > 0.70, `Deve haver bosques densos com densidade alta em floresta. Max: ${maxDensity.toFixed(3)}`);
  assert(
    maxTreeChance > minTreeChance * 3,
    `A chance de árvores deve variar significativamente entre clareiras e bosques densos (${minTreeChance.toFixed(3)} vs ${maxTreeChance.toFixed(3)})`,
  );
  console.log(
    `✓ Teste E passou: Variação orgânica em floresta confirmada (Densidade [${minDensity.toFixed(2)}, ${maxDensity.toFixed(2)}], Chance TREE [${minTreeChance.toFixed(2)}, ${maxTreeChance.toFixed(2)}])`,
  );

  // =========================================================================
  // F. AUSÊNCIA ABSOLUTA DE OBJETOS EM OCEAN
  // =========================================================================
  for (let y = -50; y <= 50; y += 5) {
    for (let x = -50; x <= 50; x += 5) {
      const biome = worldGen.getBiomeAt(x, y);
      if (biome === Biome.OCEAN) {
        const obj = worldA.getNaturalObjectAt(x, y);
        assert(obj === null, `Nunca deve haver objetos no bioma OCEAN (${x}, ${y})`);
      }
    }
  }
  console.log('✓ Teste F passou: Ausência de objetos em OCEAN confirmada');

  // =========================================================================
  // G. PRESERVAÇÃO DOS TIPOS CORRETOS POR BIOMA
  // =========================================================================
  for (let cy = -2; cy <= 2; cy++) {
    for (let cx = -2; cx <= 2; cx++) {
      worldA.getChunkManager().getChunk(cx, cy);
    }
  }
  const loadedObjs = worldA.getObjectManager().getAllObjects();
  for (const obj of loadedObjs) {
    const tileX = Math.floor((obj.position.worldX + obj.width / 2) / TILE_SIZE);
    const tileY = Math.floor((obj.position.worldY + obj.height) / TILE_SIZE);
    const b = worldGen.getBiomeAt(tileX, tileY);
    if (obj.type === NaturalObjectType.TREE) assert(b === Biome.FOREST, `TREE deve ser de FOREST`);
    if (obj.type === NaturalObjectType.CACTUS) assert(b === Biome.DESERT, `CACTUS deve ser de DESERT`);
    if (obj.type === NaturalObjectType.ROCK) assert(b === Biome.MOUNTAIN, `ROCK deve ser de MOUNTAIN`);
    if (obj.type === NaturalObjectType.WILDFLOWER) assert(b === Biome.PLAINS, `WILDFLOWER deve ser de PLAINS`);
  }
  console.log('✓ Teste G passou: Tipos de objetos preservam correlação estrita com seus biomas');

  // =========================================================================
  // H. PRESERVAÇÃO DE WALKABILITY DO TERRENO E NÃO COLISÃO FÍSICA
  // =========================================================================
  for (const obj of loadedObjs) {
    const tileX = Math.floor((obj.position.worldX + obj.width / 2) / TILE_SIZE);
    const tileY = Math.floor((obj.position.worldY + obj.height) / TILE_SIZE);
    const t = worldA.getTile(tileX, tileY);
    assert(t?.type === TileType.GRASS, `Tile sob objeto deve permanecer caminhável`);
  }
  console.log('✓ Teste H passou: Preservação integral do tipo de terreno e caminhabilidade');

  // =========================================================================
  // I. AUSÊNCIA DE MATERIALIZAÇÃO DE CHUNKS DURANTE CONSULTAS PURAS
  // =========================================================================
  const pureWorld = new World(99999);
  const pureCM = pureWorld.getChunkManager();
  assert(pureCM.getLoadedChunkCount() === 0, 'Inicialmente 0 chunks carregados');
  pureWorld.getEcologicalDensityAt(1234, 5678);
  pureWorld.getNaturalObjectAt(1234, 5678);
  assert(pureCM.getLoadedChunkCount() === 0, 'Consultas puras NUNCA materializam chunks');
  console.log('✓ Teste I passou: Nenhuma materialização de chunks em consultas puras');

  // =========================================================================
  // J. ESTABILIDADE E CANONICIDADE DOS IDs
  // =========================================================================
  for (const obj of loadedObjs) {
    const parts = obj.id.split(':');
    assert(parts[0] === 'natural', `Prefixo do ID deve ser 'natural'`);
    assert(parts[1] === obj.type, `Parte 1 deve ser o tipo de objeto`);
  }
  console.log('✓ Teste J passou: Formato e canonicidade de IDs preservados');

  // =========================================================================
  // K. PRESERVAÇÃO DO SPAWN LIMPO (0, 0)
  // =========================================================================
  const spawnObj = worldA.getNaturalObjectAt(0, 0);
  assert(spawnObj === null, 'Spawn (0,0) deve estar limpo sem objetos');
  console.log('✓ Teste K passou: Ponto de spawn (0,0) livre de objetos');

  // =========================================================================
  // L. REGENERAÇÃO IDÊNTICA APÓS UNLOAD/RELOAD
  // =========================================================================
  const reloadWorld = new World(DEFAULT_WORLD_SEED);
  const c = reloadWorld.getChunkManager().getChunk(1, 1);
  const initialObjs = [...c.getNaturalObjects()];
  reloadWorld.getChunkManager().unloadChunk(1, 1);
  const cReloaded = reloadWorld.getChunkManager().getChunk(1, 1);
  const reloadedObjs = cReloaded.getNaturalObjects();

  assert(
    initialObjs.length === reloadedObjs.length,
    `Mesma quantidade de objetos após recarga (${initialObjs.length} vs ${reloadedObjs.length})`,
  );
  for (let i = 0; i < initialObjs.length; i++) {
    assert(initialObjs[i].id === reloadedObjs[i].id, 'Mesmos IDs de objetos');
    assert(initialObjs[i].position.worldX === reloadedObjs[i].position.worldX, 'Mesmas posições worldX');
  }
  console.log('✓ Teste L passou: Regeneração idêntica após descarregar e recarregar chunk');

  // =========================================================================
  // 17. TESTE QUANTITATIVO DE DENSIDADE E NÃO HOMOGENEIDADE
  // Comparações de densidade local em sub-regiões de 10x10 tiles em uma floresta.
  // =========================================================================
  console.log('\n--- Amostragem Quantitativa da Distribuição de Floresta ---');

  // Encontrar uma macro-região florestal contínua
  let forestAnchorX = 0;
  let forestAnchorY = 0;
  let foundForest = false;

  for (let gy = -150; gy <= 150 && !foundForest; gy += 20) {
    for (let gx = -150; gx <= 150 && !foundForest; gx += 20) {
      let allForest = true;
      for (let dy = 0; dy < 30 && allForest; dy += 5) {
        for (let dx = 0; dx < 30 && allForest; dx += 5) {
          if (worldGen.getBiomeAt(gx + dx, gy + dy) !== Biome.FOREST) {
            allForest = false;
          }
        }
      }
      if (allForest) {
        forestAnchorX = gx;
        forestAnchorY = gy;
        foundForest = true;
      }
    }
  }

  assert(foundForest, 'Deve ser encontrada uma macroárea florestal contínua para medição quantitativa');

  // Medir densidade de árvores em sub-regiões 10x10 espaçadas ao longo da macroárea florestal
  const subRegionDensities: number[] = [];
  const sampleSteps = 5;

  for (let stepY = 0; stepY < sampleSteps; stepY++) {
    for (let stepX = 0; stepX < sampleSteps; stepX++) {
      // Espaçamento de 14 tiles entre centros de sub-regiões para cobrir zonas de clareiras e bosques
      const rx = forestAnchorX + stepX * 14;
      const ry = forestAnchorY + stepY * 14;

      let treeCount = 0;
      let validTiles = 0;

      for (let dy = 0; dy < 10; dy++) {
        for (let dx = 0; dx < 10; dx++) {
          const tx = rx + dx;
          const ty = ry + dy;
          if (worldGen.getBiomeAt(tx, ty) === Biome.FOREST && worldGen.getTileTypeAt(tx, ty) === TileType.GRASS) {
            validTiles++;
            const obj = natGen.getNaturalObjectAt(tx, ty);
            if (obj && obj.type === NaturalObjectType.TREE) {
              treeCount++;
            }
          }
        }
      }

      if (validTiles >= 80) {
        const localDensity = treeCount / validTiles;
        subRegionDensities.push(localDensity);
      }
    }
  }

  assert(subRegionDensities.length >= 10, 'Deve haver amostras florestais suficientes');

  const minObservedDensity = Math.min(...subRegionDensities);
  const maxObservedDensity = Math.max(...subRegionDensities);
  const avgObservedDensity =
    subRegionDensities.reduce((sum, d) => sum + d, 0) / subRegionDensities.length;

  // Desvio padrão para medir a não-homogeneidade espacial
  const variance =
    subRegionDensities.reduce((sum, d) => sum + Math.pow(d - avgObservedDensity, 2), 0) /
    subRegionDensities.length;
  const stdDev = Math.sqrt(variance);

  console.log(`[MÉTRICA QUANTITATIVA FLORESTA]`);
  console.log(`- Amostras de sub-regiões 10x10 : ${subRegionDensities.length}`);
  console.log(`- Densidade mínima de árvores  : ${(minObservedDensity * 100).toFixed(1)}%`);
  console.log(`- Densidade média de árvores   : ${(avgObservedDensity * 100).toFixed(1)}%`);
  console.log(`- Densidade máxima de árvores  : ${(maxObservedDensity * 100).toFixed(1)}%`);
  console.log(`- Razão máxima / mínima        : ${(maxObservedDensity / (minObservedDensity || 0.001)).toFixed(2)}x`);
  console.log(`- Desvio padrão da densidade   : ${(stdDev * 100).toFixed(2)}%`);

  // Validação quantitativa da variabilidade:
  // Em uma distribuição uniforme / homogênea, stdDev é próximo de zero e max/min diferem pouco.
  // Com o campo de densidade ecológica:
  // Há clareiras onde a densidade é substancialmente menor (ex: < 5-6%)
  // Há bosques densos onde a densidade é bem mais alta (ex: > 12-18%)
  assert(
    maxObservedDensity >= minObservedDensity * 2.0,
    `Deve haver variação espacial expressiva entre clareiras e bosques densos (máx: ${(maxObservedDensity * 100).toFixed(1)}%, mín: ${(minObservedDensity * 100).toFixed(1)}%)`,
  );
  assert(
    stdDev >= 0.025,
    `O desvio padrão da densidade deve comprovar heterogeneidade espacial orgânica (stdDev: ${(stdDev * 100).toFixed(2)}% >= 2.5%)`,
  );

  console.log('✓ Teste Quantitativo passou: A floresta possui variação orgânica comprovada entre clareiras e bosques densos!');
  console.log('[TEST] Todos os testes de Distribuição Ecológica foram concluídos com sucesso!\n');
}

runEcologicalDistributionTests();
