import { DEFAULT_PLAYER_SPEED, DEFAULT_WORLD_SEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { Player } from './Player.ts';
import { TileRegistry } from './TileRegistry.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runWorldTests(): void {
  console.log('[TEST] Iniciando suíte de testes do World (Espaço Global Ilimitado)...');

  const world1 = new World(DEFAULT_WORLD_SEED);
  const world2 = new World(DEFAULT_WORLD_SEED);
  const worldOtherSeed = new World(99999);

  // =========================================================================
  // A) World funciona na origem: getTile(0,0) retorna um tile válido.
  // =========================================================================
  const originTile = world1.getTile(0, 0);
  assert(originTile !== null, 'getTile(0, 0) não deve ser nulo');
  assert(
    originTile?.type === TileType.GRASS || originTile?.type === TileType.WATER,
    'getTile(0, 0) deve ser um TileType suportado',
  );
  console.log('✓ Teste A passou: World funciona na origem (0,0)');

  // =========================================================================
  // B) World funciona em coordenadas positivas distantes: getTile(100,100)
  // =========================================================================
  const farPositiveTile = world1.getTile(100, 100);
  assert(farPositiveTile !== null, 'getTile(100, 100) não deve ser nulo');
  const veryFarPositiveTile = world1.getTile(10000, 5000);
  assert(veryFarPositiveTile !== null, 'getTile(10000, 5000) não deve ser nulo');
  console.log('✓ Teste B passou: World funciona em coordenadas positivas distantes');

  // =========================================================================
  // C) World funciona em coordenadas negativas: getTile(-1,0), (0,-1), (-100,-100)
  // =========================================================================
  const negX = world1.getTile(-1, 0);
  const negY = world1.getTile(0, -1);
  const farNeg = world1.getTile(-100, -100);
  const veryFarNeg = world1.getTile(-5000, -10000);
  assert(negX !== null, 'getTile(-1, 0) não deve ser nulo');
  assert(negY !== null, 'getTile(0, -1) não deve ser nulo');
  assert(farNeg !== null, 'getTile(-100, -100) não deve ser nulo');
  assert(veryFarNeg !== null, 'getTile(-5000, -10000) não deve ser nulo');
  console.log('✓ Teste C passou: World funciona em coordenadas negativas arbitrárias');

  // =========================================================================
  // D) Determinismo: Duas instâncias de World com a mesma seed produzem o mesmo TileType
  // =========================================================================
  const testCoords = [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: -16, y: -16 },
    { x: 100, y: 100 },
    { x: -100, y: -200 },
    { x: 500, y: -300 },
    { x: -1000, y: 1000 },
  ];
  for (const c of testCoords) {
    const t1 = world1.getTile(c.x, c.y);
    const t2 = world2.getTile(c.x, c.y);
    assert(
      t1?.type === t2?.type,
      `Determinismo falhou em (${c.x}, ${c.y}): ${t1?.type} !== ${t2?.type}`,
    );
  }
  console.log('✓ Teste D passou: Mesma seed gera mundos idênticos em coordenadas distantes e negativas');

  // =========================================================================
  // E) Continuidade entre chunks nas fronteiras (15,16; 31,32; -1,0; -16,-15; -17,-16)
  // =========================================================================
  const boundaryPairs = [
    { a: { x: 15, y: 5 }, b: { x: 16, y: 5 } },
    { a: { x: 31, y: 10 }, b: { x: 32, y: 10 } },
    { a: { x: -1, y: 0 }, b: { x: 0, y: 0 } },
    { a: { x: -16, y: -2 }, b: { x: -15, y: -2 } },
    { a: { x: -17, y: -2 }, b: { x: -16, y: -2 } },
  ];
  for (const pair of boundaryPairs) {
    const tileA = world1.getTile(pair.a.x, pair.a.y);
    const tileB = world1.getTile(pair.b.x, pair.b.y);
    assert(tileA !== null, `Tile na fronteira A (${pair.a.x}, ${pair.a.y}) não pode ser nulo`);
    assert(tileB !== null, `Tile na fronteira B (${pair.b.x}, ${pair.b.y}) não pode ser nulo`);
  }
  console.log('✓ Teste E passou: Consulta contínua e sem falhas nas fronteiras de chunks');

  // =========================================================================
  // F) Spawn: getSafeSpawnWorldPosition() deve ser caminhável e determinístico
  // =========================================================================
  const spawn1 = world1.getSafeSpawnWorldPosition(PLAYER_SIZE);
  const spawn2 = world2.getSafeSpawnWorldPosition(PLAYER_SIZE);
  assert(
    spawn1.worldX === spawn2.worldX && spawn1.worldY === spawn2.worldY,
    'Spawn deve ser estritamente idêntico para a mesma seed',
  );
  // O tile do spawn deve ser caminhável
  const spawnTileCoord = world1.worldToTile(spawn1);
  const spawnTile = world1.getTile(spawnTileCoord.tileX, spawnTileCoord.tileY);
  assert(spawnTile !== null, 'Tile do spawn não deve ser nulo');
  const spawnTileDef = TileRegistry.get(spawnTile!.type);
  assert(spawnTileDef.walkable === true, 'Tile do spawn deve ser caminhável (GRASS)');
  console.log(`✓ Teste F passou: Spawn determinístico e seguro em (${spawn1.worldX}, ${spawn1.worldY})`);

  // =========================================================================
  // G) Movimento através da origem (x=0 e y=0) quando os tiles forem caminháveis
  // =========================================================================
  // Forçar faixa de tiles caminháveis ao redor da origem para isolar a física de movimento da geração
  world1.setTile(-1, 0, TileType.GRASS);
  world1.setTile(0, 0, TileType.GRASS);
  world1.setTile(1, 0, TileType.GRASS);
  world1.setTile(0, -1, TileType.GRASS);
  world1.setTile(0, 1, TileType.GRASS);

  const collision = new CollisionSystem(world1);
  const player = new Player(
    { worldX: 10, worldY: 4 },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );

  // Mover para a esquerda atravessando x=0 até coordenadas negativas
  collision.movePlayer(player, { x: -1, y: 0 }, 0.2); // move ~32 pixels para esquerda
  assert(
    player.position.worldX < 0,
    `Player deve conseguir atravessar x=0 para coordenadas negativas (posição: ${player.position.worldX})`,
  );

  // Mover para cima atravessando y=0 para coordenadas negativas
  player.position.worldX = 4;
  player.position.worldY = 10;
  collision.movePlayer(player, { x: 0, y: -1 }, 0.2);
  assert(
    player.position.worldY < 0,
    `Player deve conseguir atravessar y=0 para coordenadas negativas (posição: ${player.position.worldY})`,
  );
  console.log('✓ Teste G passou: Player atravessa x=0 e y=0 livremente sem bloqueio de borda');

  // =========================================================================
  // H) Movimento através de fronteiras de chunks (ex: chunk 0 para chunk 1, x=512)
  // =========================================================================
  // CHUNK_SIZE = 16 tiles * 32px = 512px
  const boundaryTileX = 16;
  world1.setTile(boundaryTileX - 1, 0, TileType.GRASS);
  world1.setTile(boundaryTileX, 0, TileType.GRASS);
  world1.setTile(boundaryTileX + 1, 0, TileType.GRASS);

  const chunkCrossPlayer = new Player(
    { worldX: boundaryTileX * TILE_SIZE - PLAYER_SIZE - 5, worldY: 4 },
    DEFAULT_PLAYER_SPEED,
    PLAYER_SIZE,
  );
  const initialWorldX = chunkCrossPlayer.position.worldX;
  collision.movePlayer(chunkCrossPlayer, { x: 1, y: 0 }, 0.2);
  assert(
    chunkCrossPlayer.position.worldX > initialWorldX,
    'Player deve se mover através da fronteira de chunks',
  );
  assert(
    chunkCrossPlayer.position.worldX >= boundaryTileX * TILE_SIZE - PLAYER_SIZE,
    'Player deve ultrapassar a fronteira do chunk (x=512px) sem bloqueio',
  );
  console.log('✓ Teste H passou: Player atravessa fronteira entre chunks sem qualquer bloqueio artificial');

  // =========================================================================
  // I) Não existem mais limites artificiais 20×15
  // =========================================================================
  // O antigo mapa limitava x a 0..19 e y a 0..14.
  // Testar acesso e caminhabilidade em x=25, y=20, x=-5, y=-5
  assert(world1.isValidTileCoord(25, 20), 'Coordenada (25, 20) deve ser válida');
  assert(world1.isValidTileCoord(-5, -5), 'Coordenada (-5, -5) deve ser válida');
  assert(world1.getTile(25, 20) !== null, 'Tile em (25, 20) deve ser gerado e retornado');
  assert(world1.getTile(-5, -5) !== null, 'Tile em (-5, -5) deve ser gerado e retornado');

  // CollisionSystem permite ocupação em coordenadas além do antigo 20x15
  world1.setTile(25, 20, TileType.GRASS);
  const beyondOldMapWalkable = collision.canOccupyArea(
    25 * TILE_SIZE,
    20 * TILE_SIZE,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(
    beyondOldMapWalkable === true,
    'Área em (25*TILE_SIZE, 20*TILE_SIZE) além do antigo 20x15 deve ser perfeitamente caminhável',
  );

  world1.setTile(-5, -5, TileType.GRASS);
  const negativeWalkable = collision.canOccupyArea(
    -5 * TILE_SIZE,
    -5 * TILE_SIZE,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  assert(
    negativeWalkable === true,
    'Área em coordenadas negativas (-5*TILE_SIZE, -5*TILE_SIZE) deve ser perfeitamente caminhável',
  );
  console.log('✓ Teste I passou: Limites artificiais 20x15 completamente removidos de World e CollisionSystem');

  // =========================================================================
  // J) O cálculo de spawn inicial não materializa chunks desnecessários
  // =========================================================================
  const freshWorld = new World(DEFAULT_WORLD_SEED);
  const freshChunkManager = freshWorld.getChunkManager();
  assert(freshChunkManager.getLoadedChunkCount() === 0, 'Instância virgem de World deve ter 0 chunks carregados');

  const safePos = freshWorld.getSafeSpawnWorldPosition(PLAYER_SIZE);
  assert(typeof safePos.worldX === 'number' && typeof safePos.worldY === 'number', 'Spawn position deve ser calculada');
  assert(
    freshChunkManager.getLoadedChunkCount() === 0,
    `getSafeSpawnWorldPosition NUNCA deve instanciar chunks na memória (contagem esperada: 0, obtido: ${freshChunkManager.getLoadedChunkCount()})`,
  );

  // Testar também com várias seeds diferentes para garantir ausência de explosão de chunks
  for (const s of [1, 42, 99999, 1234567, 88888]) {
    const multiWorld = new World(s);
    multiWorld.getSafeSpawnWorldPosition(PLAYER_SIZE);
    assert(
      multiWorld.getChunkManager().getLoadedChunkCount() === 0,
      `Seed ${s}: getSafeSpawnWorldPosition não deve alocar chunks`,
    );
  }
  console.log('✓ Teste J passou: Cálculo de spawn não materializa chunks na memória (0 chunks carregados)');

  console.log('[TEST] Todos os testes do World (A-J) foram concluídos com sucesso!');
}

runWorldTests();
