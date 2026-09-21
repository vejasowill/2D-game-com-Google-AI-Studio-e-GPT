import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { ChunkStreamingSystem } from './ChunkStreamingSystem.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { Player } from './Player.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runCollisionTests(): void {
  console.log('[TEST] Iniciando testes do CollisionSystem...');

  const world = new World();
  const collision = new CollisionSystem(world);

  // Teste 1: Área totalmente sobre GRASS é caminhável
  const spawnTile = world.findNearestWalkableTile();
  // Assegurar carregamento do chunk do spawn (como o StreamingSystem faz)
  world.getTile(spawnTile.tileX, spawnTile.tileY);
  const spawnWorld = world.tileToWorld(spawnTile);
  const centerWalkable = collision.canOccupyArea(
    spawnWorld.worldX + (TILE_SIZE - PLAYER_SIZE) / 2,
    spawnWorld.worldY + (TILE_SIZE - PLAYER_SIZE) / 2,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(centerWalkable === true, 'Área central totalmente sobre GRASS deve ser caminhável');
  console.log('✓ Teste 1 passou: Área totalmente sobre GRASS é caminhável');

  // Teste 2: Coordenadas em espaço ilimitado (positivas e negativas) com GRASS permitem ocupação
  world.setTile(-10, -10, TileType.GRASS);
  world.setTile(100, 100, TileType.GRASS);
  const negativeGrassWalkable = collision.canOccupyArea(-10 * TILE_SIZE, -10 * TILE_SIZE, PLAYER_SIZE, PLAYER_SIZE);
  assert(negativeGrassWalkable === true, 'Coordenada negativa sobre GRASS deve permitir ocupação');
  const distantGrassWalkable = collision.canOccupyArea(100 * TILE_SIZE, 100 * TILE_SIZE, PLAYER_SIZE, PLAYER_SIZE);
  assert(distantGrassWalkable === true, 'Coordenada distante sobre GRASS deve permitir ocupação');
  console.log('✓ Teste 2 passou: Coordenadas livres em espaço ilimitado (negativas e distantes) permitem ocupação');

  // Teste 3: Coordenadas sobre terreno não caminhável (WATER) continuam bloqueadas
  world.setTile(-5, -5, TileType.WATER);
  const negativeWaterBlocked = collision.canOccupyArea(-5 * TILE_SIZE, -5 * TILE_SIZE, PLAYER_SIZE, PLAYER_SIZE);
  assert(negativeWaterBlocked === false, 'Tile de WATER em coordenada negativa deve bloquear ocupação');
  console.log('✓ Teste 3 passou: Terreno não caminhável (WATER) bloqueia ocupação independentemente do quadrante');

  // Teste 4: Consulta de tiles tocados funciona corretamente na origem, quadrantes negativos e múltiplos tiles
  // Origem: (0, 0)
  const originTiles = collision.getTilesInArea(0, 0, PLAYER_SIZE, PLAYER_SIZE);
  assert(originTiles.length === 1, 'Origem (0, 0) com tamanho 24 deve tocar exatamente 1 tile');
  assert(
    originTiles[0].tileX === 0 && originTiles[0].tileY === 0,
    'Origem deve tocar exatamente o tile (0, 0)',
  );

  // Quadrante negativo
  const negTiles = collision.getTilesInArea(-TILE_SIZE, -TILE_SIZE, PLAYER_SIZE, PLAYER_SIZE);
  assert(negTiles.length === 1, 'Coordenada (-32, -32) com tamanho 24 deve tocar exatamente o tile (-1, -1)');
  assert(negTiles[0].tileX === -1 && negTiles[0].tileY === -1, 'Tile negativo tocado deve ser (-1, -1)');

  // Cruzamento de fronteira entre tiles na horizontal
  const crossingHoriz = collision.getTilesInArea(20, 0, PLAYER_SIZE, PLAYER_SIZE);
  assert(
    crossingHoriz.length === 2,
    'Área entre 20 e 44 deve tocar exatamente 2 tiles horizontais (0 e 1)',
  );
  assert(
    crossingHoriz[0].tileX === 0 && crossingHoriz[1].tileX === 1,
    'Tiles horizontais tocados devem ser 0 e 1',
  );

  // Cruzamento de fronteira em ambos os eixos (4 tiles tocados)
  const crossingBoth = collision.getTilesInArea(20, 20, PLAYER_SIZE, PLAYER_SIZE);
  assert(
    crossingBoth.length === 4,
    'Área cruzando ambos os eixos deve tocar exatamente 4 tiles',
  );
  console.log('✓ Teste 4 passou: Consulta geométrica de tiles tocados funciona com precisão em todo o espaço');

  // Teste 5: Resolução de colisão e deslizamento por eixo contra obstáculo de WATER
  world.setTile(5, 5, TileType.WATER);
  world.setTile(4, 5, TileType.GRASS);
  world.setTile(4, 4, TileType.GRASS);
  const slideStartX = 5 * TILE_SIZE - PLAYER_SIZE;
  const slideStartY = 5 * TILE_SIZE;
  const player = new Player({ worldX: slideStartX, worldY: slideStartY }, DEFAULT_PLAYER_SPEED, PLAYER_SIZE);
  // Movimento na diagonal para direita (+x, bloqueado pela água) e cima (-y, livre)
  collision.movePlayer(player, { x: 1, y: -1 }, 0.1);
  assert(player.position.worldX === slideStartX, 'Player não deve atravessar o obstáculo no eixo X');
  assert(
    player.position.worldY < slideStartY,
    'Player deve deslizar no eixo Y livremente mesmo com o eixo X bloqueado',
  );
  console.log('✓ Teste 5 passou: Resolução por eixo permite deslizamento suave contra obstáculos');

  // =========================================================================
  // Testes específicos de WATER (validação de terreno não caminhável)
  // =========================================================================

  // Localiza dinamicamente um tile de água gerado com vizinho oeste caminhável (GRASS)
  let waterTileX = -1;
  let waterTileY = -1;
  for (let y = 0; y < 20; y++) {
    for (let x = 1; x < 20; x++) {
      if (
        world.getTile(x, y)?.type === TileType.WATER &&
        world.getTile(x - 1, y)?.type === TileType.GRASS
      ) {
        waterTileX = x;
        waterTileY = y;
        break;
      }
    }
    if (waterTileX !== -1) break;
  }
  assert(waterTileX !== -1, 'Mundo procedural deve conter ao menos um tile de WATER adjacente a GRASS');

  // Teste 6: Uma área totalmente sobre WATER deve retornar false em canOccupyArea()
  const waterTileWorld = world.tileToWorld({ tileX: waterTileX, tileY: waterTileY });
  const waterOccupied = collision.canOccupyArea(
    waterTileWorld.worldX,
    waterTileWorld.worldY,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(waterOccupied === false, 'Área totalmente sobre WATER deve retornar false em canOccupyArea()');
  console.log('✓ Teste 6 passou: Área totalmente sobre WATER retorna false');

  // Teste 7: Uma área totalmente sobre GRASS deve continuar retornando true
  const grassTileWorld = world.tileToWorld({ tileX: waterTileX - 1, tileY: waterTileY });
  const grassOccupied = collision.canOccupyArea(
    grassTileWorld.worldX,
    grassTileWorld.worldY,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(grassOccupied === true, 'Área totalmente sobre GRASS deve continuar retornando true');
  console.log('✓ Teste 7 passou: Área totalmente sobre GRASS continua retornando true');

  // Teste 8: Uma área parcialmente sobre GRASS e WATER deve retornar false
  const waterLeftEdgeX = waterTileX * TILE_SIZE;
  const partialWaterOccupied = collision.canOccupyArea(
    waterLeftEdgeX - PLAYER_SIZE / 2,
    waterTileY * TILE_SIZE,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(
    partialWaterOccupied === false,
    'Área parcialmente sobre GRASS e WATER deve retornar false',
  );
  console.log('✓ Teste 8 passou: Área parcialmente sobre GRASS e WATER retorna false');

  // Teste 9: O Player deve conseguir aproximar-se da água, mas não atravessá-la
  const startX = waterLeftEdgeX - PLAYER_SIZE - 40;
  const approachPlayer = new Player(
    { worldX: startX, worldY: waterTileY * TILE_SIZE },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );
  // Movimenta em direção à água (direita) com tempo suficiente para atingir o obstáculo
  collision.movePlayer(approachPlayer, { x: 1, y: 0 }, 0.5);
  assert(
    approachPlayer.position.worldX > startX,
    'Player deve conseguir aproximar-se da água',
  );
  assert(
    approachPlayer.position.worldX + approachPlayer.size <= waterLeftEdgeX,
    'Player não deve penetrar nem atravessar a água',
  );
  console.log('✓ Teste 9 passou: Player aproxima-se da água sem atravessá-la');

  // Teste 10: Testar movimento contra a borda da água em pelo menos um eixo
  const edgePlayer = new Player(
    { worldX: waterLeftEdgeX - PLAYER_SIZE, worldY: waterTileY * TILE_SIZE },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );
  // Tenta avançar diretamente contra a água
  collision.movePlayer(edgePlayer, { x: 1, y: 0 }, 0.2);
  assert(
    edgePlayer.position.worldX === waterLeftEdgeX - PLAYER_SIZE,
    'Player deve ser completamente bloqueado contra a borda da água',
  );
  console.log('✓ Teste 10 passou: Movimento direto contra a borda da água é bloqueado');

  // Teste 11: Testar movimento diagonal contra a água para garantir que o Player deslize pelo eixo livre
  const initialY = waterTileY * TILE_SIZE;
  const slidePlayer = new Player(
    { worldX: waterLeftEdgeX - PLAYER_SIZE, worldY: initialY },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );
  // Movimenta na diagonal: empurrando contra a água (X positivo) e descendo (Y positivo)
  collision.movePlayer(slidePlayer, { x: 1, y: 1 }, 0.1);
  assert(
    slidePlayer.position.worldX === waterLeftEdgeX - PLAYER_SIZE,
    'Eixo X deve permanecer bloqueado contra a água',
  );
  assert(
    slidePlayer.position.worldY > initialY,
    'Player deve deslizar no eixo Y livre para baixo',
  );
  console.log('✓ Teste 11 passou: Movimento diagonal contra a água desliza pelo eixo livre');

  // =========================================================================
  // Testes Arquiteturais da Integração Streaming × Colisão:
  // =========================================================================

  // Teste 12: CollisionSystem NÃO gera chunks ao consultar área não carregada
  const unmappedWorld = new World();
  const unmappedCollision = new CollisionSystem(unmappedWorld);
  const unmappedChunkManager = unmappedWorld.getChunkManager();
  assert(unmappedChunkManager.getLoadedChunkCount() === 0, 'World novo deve possuir 0 chunks carregados');

  const unmappedResult = unmappedCollision.canOccupyArea(5000, 5000, PLAYER_SIZE, PLAYER_SIZE);
  assert(
    unmappedResult === false,
    'canOccupyArea em área não carregada deve retornar false (impassável)',
  );
  assert(
    unmappedChunkManager.getLoadedChunkCount() === 0,
    'CollisionSystem NUNCA deve gerar chunks em unmapped area (contagem deve permanecer 0)',
  );
  assert(
    !unmappedChunkManager.hasChunk(9, 9),
    'Chunk não deve ser gerado pelo CollisionSystem',
  );
  console.log('✓ Teste 12 passou: CollisionSystem não gera chunks ao consultar área não carregada');

  // Teste 13: Chunks necessários ao movimento do Player são carregados pelo Streaming
  const streamWorld = new World();
  const streamManager = streamWorld.getChunkManager();
  const streamSystem = new ChunkStreamingSystem(streamWorld);
  const streamCollision = new CollisionSystem(streamWorld);

  // Player iniciando no chunk (0,0)
  const initialPos = { worldX: 200, worldY: 200 };
  streamSystem.forceUpdate(initialPos);
  assert(streamManager.hasChunk(0, 0), 'Chunk (0,0) deve ser carregado pelo Streaming');
  assert(streamManager.hasChunk(1, 0), 'Chunk adjacente (1,0) deve ser carregado pelo Streaming');
  console.log('✓ Teste 13 passou: Chunks necessários ao movimento do Player são carregados pelo Streaming');

  // Teste 14: O Player consegue atravessar uma fronteira de chunk sem ficar preso artificialmente
  // Colocar caminho garantido de grama entre chunk 0 e 1 (fronteira em x=512)
  for (let ty = 0; ty <= 5; ty++) {
    for (let tx = 14; tx <= 18; tx++) {
      streamWorld.setTile(tx, ty, TileType.GRASS);
    }
  }
  const crossPlayer = new Player({ worldX: 505, worldY: 64 }, DEFAULT_PLAYER_SPEED, PLAYER_SIZE);
  // Simular passo do loop: streaming -> player move -> streaming
  streamSystem.update(crossPlayer.position);
  crossPlayer.update(0.1, { getMovementDirection: () => ({ x: 1, y: 0 }) }, streamCollision);
  streamSystem.update(crossPlayer.position);
  assert(
    crossPlayer.position.worldX > 512,
    `Player deve atravessar a fronteira do chunk para x > 512 sem ficar preso (pos: ${crossPlayer.position.worldX})`,
  );
  console.log('✓ Teste 14 passou: O Player consegue atravessar uma fronteira de chunk sem ficar preso artificialmente');

  // Teste 15: O Player NÃO consegue atravessar terreno WATER apenas porque o chunk estava sendo carregado
  // Colocar água imediatamente após a fronteira
  streamWorld.setTile(18, 2, TileType.WATER);
  const waterTargetWorldX = 18 * TILE_SIZE; // 576px
  const waterBlockedPlayer = new Player(
    { worldX: waterTargetWorldX - PLAYER_SIZE, worldY: 2 * TILE_SIZE },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );
  // Streaming prepara a área
  streamSystem.update(waterBlockedPlayer.position);
  // Movimento em direção à água
  waterBlockedPlayer.update(0.2, { getMovementDirection: () => ({ x: 1, y: 0 }) }, streamCollision);
  assert(
    waterBlockedPlayer.position.worldX + waterBlockedPlayer.size <= waterTargetWorldX,
    'Player não deve penetrar em terreno de WATER mesmo na fronteira de chunks',
  );
  console.log('✓ Teste 15 passou: O Player não consegue atravessar terreno WATER na fronteira');

  // Teste 16: Coordenadas negativas continuam funcionando no CollisionSystem com dados carregados
  streamWorld.setTile(-2, -2, TileType.GRASS);
  streamWorld.setTile(-2, -3, TileType.WATER);
  // Assegurar chunk carregado
  streamManager.getOrCreateChunk(-1, -1);
  const negGrassOccupied = streamCollision.canOccupyArea(
    -2 * TILE_SIZE,
    -2 * TILE_SIZE,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(negGrassOccupied === true, 'Coordenada negativa com GRASS carregado deve permitir ocupação');
  const negWaterOccupied = streamCollision.canOccupyArea(
    -2 * TILE_SIZE,
    -3 * TILE_SIZE,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(negWaterOccupied === false, 'Coordenada negativa com WATER carregado deve bloquear ocupação');
  console.log('✓ Teste 16 passou: Coordenadas negativas continuam funcionando');

  // Teste 17: Nenhum sistema além do ChunkStreamingSystem provoca criação de chunks durante gameplay normal
  const strictWorld = new World();
  const strictManager = strictWorld.getChunkManager();
  const strictCollision = new CollisionSystem(strictWorld);
  const strictPlayer = new Player({ worldX: 100, worldY: 100 });

  // Player se movimenta sem streaming em área não carregada
  strictCollision.movePlayer(strictPlayer, { x: 1, y: 0 }, 1.0);
  assert(
    strictManager.getLoadedChunkCount() === 0,
    'CollisionSystem e Player sozinhos NUNCA devem provocar criação de chunks',
  );
  console.log('✓ Teste 17 passou: Nenhum sistema além do ChunkStreamingSystem provoca criação de chunks');

  console.log('[TEST] Todos os testes do CollisionSystem foram concluídos com sucesso!');
}

// Execução direta via Node / tsx
runCollisionTests();

