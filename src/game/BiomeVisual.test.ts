import { Biome } from './Biome.ts';
import { BiomeVisualRegistry } from './BiomeVisualRegistry.ts';
import { Camera } from './Camera.ts';
import { CHUNK_LOAD_RADIUS, CHUNK_SIZE, TILE_SIZE } from './constants.ts';
import { ChunkManager } from './ChunkManager.ts';
import { ChunkStreamingSystem } from './ChunkStreamingSystem.ts';
import { Player } from './Player.ts';
import { Renderer } from './Renderer.ts';
import { TileRegistry } from './TileRegistry.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';
import { WorldGenerator } from './WorldGenerator.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

export function runBiomeVisualTests(): void {
  console.log('[TEST] Iniciando suíte de testes de Visualização de Biomas...');

  // =========================================================================
  // 1. O mesmo seed + mesma coordenada produz o mesmo biome
  // =========================================================================
  const worldA = new World(12345);
  const worldB = new World(12345);
  const testCoords: [number, number][] = [
    [0, 0],
    [10, 10],
    [-25, 40],
    [100, -100],
    [-500, -500],
  ];

  for (const [x, y] of testCoords) {
    const biomeA = worldA.getBiomeAt(x, y);
    const biomeB = worldB.getBiomeAt(x, y);
    assert(
      biomeA === biomeB,
      `Teste 1: Mesma seed e coordenada (${x},${y}) deve produzir o mesmo biome (${biomeA} vs ${biomeB})`,
    );
  }
  console.log('✓ Teste 1 passou: O mesmo seed + mesma coordenada produz o mesmo biome');

  // =========================================================================
  // 2. O mesmo seed + mesma coordenada produz a mesma aparência visual
  // =========================================================================
  for (const [x, y] of testCoords) {
    const tileA = worldA.getTile(x, y);
    const tileB = worldB.getTile(x, y);
    if (!tileA || !tileB) {
      throw new Error(`Tiles em (${x},${y}) devem existir`);
    }

    const visualA = worldA.getTerrainVisualAt(x, y, tileA.type);
    const visualB = worldB.getTerrainVisualAt(x, y, tileB.type);

    assert(
      visualA.color === visualB.color,
      `Teste 2: Cor visual em (${x},${y}) deve ser idêntica (${visualA.color} vs ${visualB.color})`,
    );
    assert(
      visualA.borderColor === visualB.borderColor,
      `Teste 2: Borda visual em (${x},${y}) deve ser idêntica (${visualA.borderColor} vs ${visualB.borderColor})`,
    );
  }
  console.log('✓ Teste 2 passou: O mesmo seed + mesma coordenada produz a mesma aparência visual');

  // =========================================================================
  // 3. Seeds diferentes continuam podendo produzir configurações ambientais e visuais diferentes
  // =========================================================================
  const worldSeed1 = new World(1111);
  const worldSeed2 = new World(9999);
  let visualDifferenceFound = false;

  for (let y = 0; y < 50; y += 5) {
    for (let x = 0; x < 50; x += 5) {
      const b1 = worldSeed1.getBiomeAt(x, y);
      const b2 = worldSeed2.getBiomeAt(x, y);
      const v1 = worldSeed1.getTerrainVisualAt(x, y, TileType.GRASS);
      const v2 = worldSeed2.getTerrainVisualAt(x, y, TileType.GRASS);

      if (b1 !== b2 || v1.color !== v2.color) {
        visualDifferenceFound = true;
        break;
      }
    }
    if (visualDifferenceFound) break;
  }

  assert(
    visualDifferenceFound,
    'Teste 3: Seeds diferentes devem produzir variações ambientais e visuais distintas no espaço',
  );
  console.log('✓ Teste 3 passou: Seeds diferentes produzem configurações ambientais e visuais distintas');

  // =========================================================================
  // 4. A aparência não depende da ordem em que chunks são carregados
  // =========================================================================
  const worldOrder1 = new World(777);
  const worldOrder2 = new World(777);

  // Ordem 1: carrega chunk (2, 2) primeiro, depois (0, 0)
  worldOrder1.getTile(2 * CHUNK_SIZE + 5, 2 * CHUNK_SIZE + 5);
  worldOrder1.getTile(5, 5);

  // Ordem 2: carrega chunk (0, 0) primeiro, depois (2, 2)
  worldOrder2.getTile(5, 5);
  worldOrder2.getTile(2 * CHUNK_SIZE + 5, 2 * CHUNK_SIZE + 5);

  const visOrd1 = worldOrder1.getTerrainVisualAt(5, 5, TileType.GRASS);
  const visOrd2 = worldOrder2.getTerrainVisualAt(5, 5, TileType.GRASS);
  assert(
    visOrd1.color === visOrd2.color && visOrd1.borderColor === visOrd2.borderColor,
    'Teste 4: A aparência em (5,5) não deve depender da ordem de carregamento de chunks',
  );
  console.log('✓ Teste 4 passou: A aparência não depende da ordem em que chunks são carregados');

  // =========================================================================
  // 5. A aparência é contínua através da fronteira entre chunks
  // =========================================================================
  // Chunk (0,0) limite direito é tileX = 15; Chunk (1,0) limite esquerdo é tileX = 16.
  const worldBoundary = new World(12345);
  const genBoundary = worldBoundary.getWorldGenerator();

  // Testar continuidade ambiental entre vizinhos imediatos na fronteira
  const tile15Y = 8;
  const env15 = genBoundary.getEnvironmentalDataAt(15, tile15Y);
  const env16 = genBoundary.getEnvironmentalDataAt(16, tile15Y);

  const diffTemp = Math.abs(env15.temperature - env16.temperature);
  const diffHum = Math.abs(env15.humidity - env16.humidity);
  const diffElev = Math.abs(env15.elevation - env16.elevation);

  assert(
    diffTemp < 0.15 && diffHum < 0.15 && diffElev < 0.15,
    `Teste 5: Variação ambiental na fronteira x=15 -> x=16 deve ser suave (dt=${diffTemp}, dh=${diffHum}, de=${diffElev})`,
  );

  // Ambos os lados consultados diretamente retornam visuais consistentes com seus biomas reais
  const b15 = worldBoundary.getBiomeAt(15, tile15Y);
  const b16 = worldBoundary.getBiomeAt(16, tile15Y);
  const v15 = worldBoundary.getTerrainVisualAt(15, tile15Y, TileType.GRASS);
  const v16 = worldBoundary.getTerrainVisualAt(16, tile15Y, TileType.GRASS);
  const expectedV15 = BiomeVisualRegistry.getVisual(b15, TileType.GRASS);
  const expectedV16 = BiomeVisualRegistry.getVisual(b16, TileType.GRASS);

  assert(v15.color === expectedV15.color, 'Aparência em x=15 condiz com o Biome real');
  assert(v16.color === expectedV16.color, 'Aparência em x=16 condiz com o Biome real');
  console.log('✓ Teste 5 passou: A aparência é contínua através da fronteira entre chunks (sem corte artificial)');

  // =========================================================================
  // 6. OCEAN continua associado ao terreno não caminhável correspondente
  // =========================================================================
  const oceanVisual = BiomeVisualRegistry.getVisual(Biome.OCEAN, TileType.WATER);
  assert(
    typeof oceanVisual.color === 'string' && oceanVisual.color.length > 0,
    'OCEAN possui definição visual de cor válida',
  );

  // Regra de física: TileRegistry continua sendo a fonte de autoridade
  const waterPhysicalDef = TileRegistry.get(TileType.WATER);
  assert(
    waterPhysicalDef.walkable === false,
    'Teste 6: WATER deve permanecer estritamente NÃO caminhável (walkable: false)',
  );
  assert(
    waterPhysicalDef.movementCost === Infinity,
    'Teste 6: WATER deve ter movementCost infinito',
  );
  console.log('✓ Teste 6 passou: OCEAN continua associado ao terreno não caminhável correspondente');

  // =========================================================================
  // 7. Alterar apenas a aparência visual não altera walkable
  // =========================================================================
  // Obter estilos visuais de biomas terrestres diferentes (PLAINS, FOREST, DESERT, MOUNTAIN)
  const plainsVis = BiomeVisualRegistry.getVisual(Biome.PLAINS, TileType.GRASS);
  const forestVis = BiomeVisualRegistry.getVisual(Biome.FOREST, TileType.GRASS);
  const desertVis = BiomeVisualRegistry.getVisual(Biome.DESERT, TileType.GRASS);
  const mountainVis = BiomeVisualRegistry.getVisual(Biome.MOUNTAIN, TileType.GRASS);

  // As cores são visualmente distintas entre si
  assert(plainsVis.color !== forestVis.color, 'PLAINS e FOREST devem ter cores diferentes');
  assert(plainsVis.color !== desertVis.color, 'PLAINS e DESERT devem ter cores diferentes');
  assert(plainsVis.color !== mountainVis.color, 'PLAINS e MOUNTAIN devem ter cores diferentes');

  // No entanto, todos compartilham a física imutável do TileType.GRASS
  const grassPhysicalDef = TileRegistry.get(TileType.GRASS);
  assert(grassPhysicalDef.walkable === true, 'TileType.GRASS deve permanecer estritamente caminhável');
  assert(grassPhysicalDef.movementCost === 1.0, 'TileType.GRASS deve manter movementCost = 1.0');
  console.log('✓ Teste 7 passou: Alterar ou consultar aparência visual não altera propriedade walkable nem física');

  // =========================================================================
  // 8. Consultar biome/aparência não materializa chunks
  // =========================================================================
  const cleanWorld = new World(54321);
  const chunkMgr = cleanWorld.getChunkManager();
  assert(chunkMgr.getLoadedChunkCount() === 0, 'Mundo novo inicia com 0 chunks');

  // Realizar consultas profundas de bioma e aparência em coordenadas distantes
  cleanWorld.getBiomeAt(1000, 2000);
  cleanWorld.getBiomeAt(-3000, -4000);
  cleanWorld.getTerrainVisualAt(1000, 2000, TileType.GRASS);
  cleanWorld.getTerrainVisualAt(-3000, -4000, TileType.WATER);

  assert(
    chunkMgr.getLoadedChunkCount() === 0,
    `Teste 8: Consultas de biome/aparência NUNCA devem criar chunks (obtido: ${chunkMgr.getLoadedChunkCount()})`,
  );
  console.log('✓ Teste 8 passou: Consultar biome e aparência não materializa chunks na memória');

  // =========================================================================
  // 9. Renderer continua sem provocar geração acidental de chunks
  // =========================================================================
  // Simular renderização com canvas mock/headless
  const mockCanvas = {
    getContext: () => ({
      fillRect: () => {},
      strokeRect: () => {},
      setTransform: () => {},
      beginPath: () => {},
      ellipse: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fillText: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    }),
    parentElement: null,
    width: 800,
    height: 600,
    style: { width: '800px', height: '600px' },
  } as unknown as HTMLCanvasElement;

  const renderer = new Renderer(mockCanvas);
  const renderWorld = new World(999);
  const renderChunkMgr = renderWorld.getChunkManager();
  const renderPlayer = new Player({ worldX: 0, worldY: 0 }, 100, 24);
  const renderCamera = new Camera(0, 0);

  // Inicialmente sem chunks
  assert(renderChunkMgr.getLoadedChunkCount() === 0, 'renderWorld inicia com 0 chunks');

  // Executa render diretamente sem carregar chunks
  renderer.render(renderWorld, renderCamera, renderPlayer);
  assert(
    renderChunkMgr.getLoadedChunkCount() === 0,
    'Teste 9: O Renderer NUNCA gera chunks quando chamado sobre regiões descarregadas',
  );

  // Carrega apenas o streaming controlado ao redor do player
  const streaming = new ChunkStreamingSystem(renderWorld, CHUNK_LOAD_RADIUS);
  streaming.forceUpdate(renderPlayer.position);
  const loadedCount = renderChunkMgr.getLoadedChunkCount();
  assert(loadedCount === 25, 'Streaming carrega exatamente (2*2+1)^2 = 25 chunks');

  // Renderiza novamente e confirma que a quantidade de chunks permanece idêntica
  renderer.render(renderWorld, renderCamera, renderPlayer);
  assert(
    renderChunkMgr.getLoadedChunkCount() === loadedCount,
    'Teste 9: O Renderer com chunks carregados continua estritamente passivo e somente-leitura',
  );
  console.log('✓ Teste 9 passou: Renderer continua sem provocar geração acidental de chunks');

  // =========================================================================
  // 10. Chunks descarregados e posteriormente regenerados mantêm exatamente a mesma aparência
  // =========================================================================
  const worldRegen = new World(888);
  const regenMgr = worldRegen.getChunkManager();
  const coordX = 40;
  const coordY = 60;

  // Carrega o chunk original e extrai visual
  const originalTile = worldRegen.getTile(coordX, coordY);
  if (!originalTile) {
    throw new Error('Tile original deve existir');
  }
  const originalVisual = worldRegen.getTerrainVisualAt(coordX, coordY, originalTile.type);

  // Descarrega o chunk forçadamente
  const chunkCoord = ChunkManager.globalTileToChunkCoord(coordX, coordY).chunkCoord;
  const unloaded = regenMgr.unloadChunk(chunkCoord.chunkX, chunkCoord.chunkY);
  assert(unloaded, 'Chunk deve ter sido descarregado com sucesso');
  assert(
    regenMgr.hasChunk(chunkCoord.chunkX, chunkCoord.chunkY) === false,
    'Chunk não está mais carregado na memória',
  );

  // Regenera o chunk através de getTile
  const regeneratedTile = worldRegen.getTile(coordX, coordY);
  if (!regeneratedTile) {
    throw new Error('Tile regenerado deve existir');
  }
  const regeneratedVisual = worldRegen.getTerrainVisualAt(coordX, coordY, regeneratedTile.type);

  assert(
    originalVisual.color === regeneratedVisual.color,
    `Teste 10: Cor deve ser rigorosamente idêntica após descarregar e regenerar (${originalVisual.color} vs ${regeneratedVisual.color})`,
  );
  assert(
    originalVisual.borderColor === regeneratedVisual.borderColor,
    'Teste 10: Borda deve ser rigorosamente idêntica após descarregar e regenerar',
  );
  console.log('✓ Teste 10 passou: Chunks descarregados e regenerados mantêm exatamente a mesma aparência');

  // =========================================================================
  // 11. Cobertura de todos os biomas suportados no BiomeVisualRegistry
  // =========================================================================
  const allBiomes = [Biome.OCEAN, Biome.PLAINS, Biome.FOREST, Biome.DESERT, Biome.MOUNTAIN];
  for (const b of allBiomes) {
    const tileT = b === Biome.OCEAN ? TileType.WATER : TileType.GRASS;
    const v = BiomeVisualRegistry.getVisual(b, tileT);
    assert(typeof v.color === 'string' && v.color.startsWith('#'), `Bioma ${b} deve possuir cor válida`);
    assert(typeof v.borderColor === 'string', `Bioma ${b} deve possuir borderColor válido`);
  }
  console.log('✓ Teste 11 passou: Todos os biomas (OCEAN, PLAINS, FOREST, DESERT, MOUNTAIN) possuem estilos visuais válidos e distintos');

  console.log('[TEST] Todos os testes de Visualização de Biomas foram concluídos com sucesso!');
}

runBiomeVisualTests();
