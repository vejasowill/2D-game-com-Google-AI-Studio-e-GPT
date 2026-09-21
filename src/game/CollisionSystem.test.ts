import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
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

  console.log('[TEST] Todos os testes do CollisionSystem foram concluídos com sucesso!');
}

// Execução direta via Node / tsx
runCollisionTests();

