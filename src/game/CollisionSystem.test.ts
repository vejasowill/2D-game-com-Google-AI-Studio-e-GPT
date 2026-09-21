import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runCollisionTests(): void {
  console.log('[TEST] Iniciando testes do CollisionSystem...');

  const world = new World(20, 15);
  const collision = new CollisionSystem(world);
  const bounds = world.getBounds();

  // Teste 1: Área totalmente sobre GRASS é caminhável
  const centerWalkable = collision.canOccupyArea(
    bounds.width / 2,
    bounds.height / 2,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(centerWalkable === true, 'Área central totalmente sobre GRASS deve ser caminhável');
  console.log('✓ Teste 1 passou: Área totalmente sobre GRASS é caminhável');

  // Teste 2: Coordenada fora do World não permite ocupação
  const outsideNegativeX = collision.canOccupyArea(-10, 50, PLAYER_SIZE, PLAYER_SIZE);
  assert(outsideNegativeX === false, 'Coordenada negativa em X não deve permitir ocupação');

  const outsideNegativeY = collision.canOccupyArea(50, -10, PLAYER_SIZE, PLAYER_SIZE);
  assert(outsideNegativeY === false, 'Coordenada negativa em Y não deve permitir ocupação');

  const outsideBeyondX = collision.canOccupyArea(
    bounds.width + 10,
    50,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(outsideBeyondX === false, 'Coordenada além do maxX não deve permitir ocupação');

  const outsideBeyondY = collision.canOccupyArea(
    50,
    bounds.height + 10,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(outsideBeyondY === false, 'Coordenada além do maxY não deve permitir ocupação');
  console.log('✓ Teste 2 passou: Coordenadas fora do World não permitem ocupação');

  // Teste 3: Área parcialmente fora dos limites não é considerada livre
  const partialLeft = collision.canOccupyArea(-1, 50, PLAYER_SIZE, PLAYER_SIZE);
  assert(partialLeft === false, 'Área parcialmente fora pela esquerda não deve ser livre');

  const partialRight = collision.canOccupyArea(
    bounds.width - PLAYER_SIZE + 1,
    50,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(partialRight === false, 'Área parcialmente fora pela direita não deve ser livre');

  const partialTop = collision.canOccupyArea(50, -1, PLAYER_SIZE, PLAYER_SIZE);
  assert(partialTop === false, 'Área parcialmente fora pelo topo não deve ser livre');

  const partialBottom = collision.canOccupyArea(
    50,
    bounds.height - PLAYER_SIZE + 1,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(partialBottom === false, 'Área parcialmente fora pelo fundo não deve ser livre');
  console.log('✓ Teste 3 passou: Áreas parcialmente fora dos limites não são consideradas livres');

  // Teste 4: Consulta de tiles tocados funciona corretamente nos limites do mapa
  // Canto superior esquerdo: (0, 0)
  const originTiles = collision.getTilesInArea(0, 0, PLAYER_SIZE, PLAYER_SIZE);
  assert(originTiles.length === 1, 'Origem (0, 0) com tamanho 24 deve tocar exatamente 1 tile');
  assert(
    originTiles[0].tileX === 0 && originTiles[0].tileY === 0,
    'Origem deve tocar exatamente o tile (0, 0)',
  );

  // Canto inferior direito: (bounds.width - PLAYER_SIZE, bounds.height - PLAYER_SIZE)
  const maxTiles = collision.getTilesInArea(
    bounds.width - PLAYER_SIZE,
    bounds.height - PLAYER_SIZE,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(maxTiles.length === 1, 'Canto inferior direito encostado deve tocar exatamente 1 tile');
  assert(
    maxTiles[0].tileX === world.width - 1 && maxTiles[0].tileY === world.height - 1,
    'Canto inferior direito deve tocar o último tile válido',
  );

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
  console.log('✓ Teste 4 passou: Consulta de tiles tocados nos limites do mapa funciona com precisão');

  // Teste 5: Resolução de colisão e deslizamento por eixo
  const player = new Player({ worldX: 0, worldY: 50 }, DEFAULT_PLAYER_SPEED, PLAYER_SIZE);
  // Movimento na diagonal para cima e esquerda: x negativo (bloqueado na borda), y negativo (livre)
  collision.movePlayer(player, { x: -1, y: -1 }, 0.1);
  assert(player.position.worldX === 0, 'Player não deve ultrapassar a borda esquerda (worldX=0)');
  assert(
    player.position.worldY < 50,
    'Player deve deslizar no eixo Y para cima mesmo com o eixo X bloqueado',
  );
  console.log('✓ Teste 5 passou: Resolução por eixo permite deslizamento suave');

  // =========================================================================
  // Testes específicos de WATER (validação de terreno não caminhável)
  // =========================================================================

  // Teste 6: Uma área totalmente sobre WATER deve retornar false em canOccupyArea()
  const waterTileWorld = world.tileToWorld({ tileX: 14, tileY: 6 });
  const waterOccupied = collision.canOccupyArea(
    waterTileWorld.worldX,
    waterTileWorld.worldY,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(waterOccupied === false, 'Área totalmente sobre WATER deve retornar false em canOccupyArea()');
  console.log('✓ Teste 6 passou: Área totalmente sobre WATER retorna false');

  // Teste 7: Uma área totalmente sobre GRASS deve continuar retornando true
  const grassTileWorld = world.tileToWorld({ tileX: 2, tileY: 2 });
  const grassOccupied = collision.canOccupyArea(
    grassTileWorld.worldX,
    grassTileWorld.worldY,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(grassOccupied === true, 'Área totalmente sobre GRASS deve continuar retornando true');
  console.log('✓ Teste 7 passou: Área totalmente sobre GRASS continua retornando true');

  // Teste 8: Uma área parcialmente sobre GRASS e WATER deve retornar false
  const waterLeftEdgeX = 13 * TILE_SIZE; // Tile 13 é o início da lagoa de teste em X
  const partialWaterOccupied = collision.canOccupyArea(
    waterLeftEdgeX - PLAYER_SIZE / 2,
    6 * TILE_SIZE,
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
    { worldX: startX, worldY: 6 * TILE_SIZE },
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
    { worldX: waterLeftEdgeX - PLAYER_SIZE, worldY: 6 * TILE_SIZE },
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
  const initialY = 6 * TILE_SIZE;
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
