import { CHUNK_SIZE, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { createItemStack } from './ItemStack.ts';
import { Player } from './Player.ts';
import { TileModificationRegistry } from './TileModificationRegistry.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { TileType } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runTileModificationTests(): void {
  console.log('--- Iniciando Testes do Sistema de Manipulação de Tiles ---');

  // =========================================================================
  // Requisito A: Tile procedural sem modificação retorna estado original
  // =========================================================================
  {
    const world = new World(12345);
    const proceduralTile = world.getWorldGenerator().getTileTypeAt(10, 10);
    const effectiveTile = world.getEffectiveTile(10, 10);

    assert(effectiveTile !== null, 'Requisito A: Tile efetivo não deve ser nulo');
    assert(
      effectiveTile?.type === proceduralTile,
      'Requisito A: Tile procedural sem modificação deve retornar o estado do gerador',
    );
    assert(
      !world.getTileModificationRegistry().hasModification(10, 10),
      'Requisito A: Não deve haver modificação registrada para tile virgem',
    );
    console.log('✓ Requisito A passou: Tile procedural sem modificação retorna estado original');
  }

  // =========================================================================
  // Requisito B: Remoção cria modificação
  // =========================================================================
  {
    const world = new World(12345);
    const result = world.removeTile(5, 5);

    assert(result.success, 'Requisito B: Operação removeTile deve retornar sucesso');
    assert(result.tileX === 5 && result.tileY === 5, 'Requisito B: Coordenadas do resultado devem coincidir');
    assert(result.newTile !== null, 'Requisito B: newTile deve ser preenchido');
    assert(
      world.getTileModificationRegistry().hasModification(5, 5),
      'Requisito B: Registro deve conter a modificação criada',
    );
    console.log('✓ Requisito B passou: Remoção cria modificação no registro');
  }

  // =========================================================================
  // Requisito C: Consulta posterior retorna tile modificado
  // =========================================================================
  {
    const world = new World(12345);
    const result = world.removeTile(8, 8, { replacementTileType: TileType.EMPTY });
    const effective = world.getEffectiveTile(8, 8);

    assert(effective !== null, 'Requisito C: Tile efetivo não deve ser nulo');
    assert(
      effective?.type === TileType.EMPTY,
      `Requisito C: Consulta posterior deve retornar TileType.EMPTY (${effective?.type})`,
    );
    assert(effective?.type === result.newTile?.type, 'Requisito C: Deve corresponder ao newTile retornado');
    console.log('✓ Requisito C passou: Consulta posterior retorna tile modificado');
  }

  // =========================================================================
  // Requisito D: Alteração não modifica o gerador procedural
  // =========================================================================
  {
    const world = new World(12345);
    const originalType = world.getWorldGenerator().getTileTypeAt(12, 14);

    world.removeTile(12, 14, { replacementTileType: TileType.EMPTY });

    const proceduralAfter = world.getWorldGenerator().getTileTypeAt(12, 14);
    assert(
      proceduralAfter === originalType,
      'Requisito D: O gerador procedural puro deve permanecer inalterado',
    );
    assert(
      world.getEffectiveTile(12, 14)?.type !== proceduralAfter,
      'Requisito D: O estado efetivo do mundo deve diferir do gerador puro',
    );
    console.log('✓ Requisito D passou: Alteração não modifica o gerador procedural');
  }

  // =========================================================================
  // Requisito E: Determinismo das chaves
  // =========================================================================
  {
    const key1 = TileModificationRegistry.createCoordKey(10, 20);
    const key2 = TileModificationRegistry.createCoordKey(10, 20);
    const keyNegative = TileModificationRegistry.createCoordKey(-15, -30);

    assert(key1 === '10,20', 'Requisito E: Formato da chave deve ser "10,20"');
    assert(key1 === key2, 'Requisito E: Mesmas coordenadas devem produzir chaves idênticas');
    assert(keyNegative === '-15,-30', 'Requisito E: Coordenadas negativas devem produzir "-15,-30"');
    console.log('✓ Requisito E passou: Chaves de coordenadas são estritamente determinísticas');
  }

  // =========================================================================
  // Requisito F: Coordenadas negativas
  // =========================================================================
  {
    const world = new World(12345);
    const negX = -25;
    const negY = -40;

    const result = world.removeTile(negX, negY, { replacementTileType: TileType.EMPTY });
    assert(result.success, 'Requisito F: Remoção em coordenadas negativas deve ser bem-sucedida');

    const effective = world.getEffectiveTile(negX, negY);
    assert(
      effective?.type === TileType.EMPTY,
      'Requisito F: Consulta em coordenadas negativas deve retornar o tile modificado',
    );
    console.log('✓ Requisito F passou: Suporte pleno a coordenadas negativas');
  }

  // =========================================================================
  // Requisito G: Coordenadas distantes
  // =========================================================================
  {
    const world = new World(12345);
    const farX = 500000;
    const farY = -800000;

    world.removeTile(farX, farY, { replacementTileType: TileType.EMPTY });
    const effective = world.getEffectiveTile(farX, farY);

    assert(
      effective?.type === TileType.EMPTY,
      'Requisito G: Coordenadas distantes devem manter a modificação sem erros de escala',
    );
    console.log('✓ Requisito G passou: Suporte pleno a grandes distâncias no mundo infinito');
  }

  // =========================================================================
  // Requisito H: Fronteira de chunk
  // =========================================================================
  {
    const world = new World(12345);
    // CHUNK_SIZE = 16. Fronteira: tileX = 15 (chunk 0) e tileX = 16 (chunk 1)
    const borderLeftX = CHUNK_SIZE - 1;
    const borderRightX = CHUNK_SIZE;

    world.removeTile(borderLeftX, 10, { replacementTileType: TileType.EMPTY });
    world.removeTile(borderRightX, 10, { replacementTileType: TileType.EMPTY });

    assert(
      world.getEffectiveTile(borderLeftX, 10)?.type === TileType.EMPTY,
      'Requisito H: Tile do lado esquerdo da fronteira deve estar modificado',
    );
    assert(
      world.getEffectiveTile(borderRightX, 10)?.type === TileType.EMPTY,
      'Requisito H: Tile do lado direito da fronteira deve estar modificado',
    );
    console.log('✓ Requisito H passou: Modificações preservadas em fronteiras de chunks');
  }

  // =========================================================================
  // Requisito I: Fronteira de chunk em coordenadas negativas
  // =========================================================================
  {
    const world = new World(12345);
    // Fronteira entre chunk -1 e chunk 0: tileX = -1 e tileX = 0
    // Fronteira entre chunk -2 e chunk -1: tileX = -17 e tileX = -16
    world.removeTile(-1, -1, { replacementTileType: TileType.EMPTY });
    world.removeTile(0, 0, { replacementTileType: TileType.EMPTY });
    world.removeTile(-17, -10, { replacementTileType: TileType.EMPTY });
    world.removeTile(-16, -10, { replacementTileType: TileType.EMPTY });

    assert(world.getEffectiveTile(-1, -1)?.type === TileType.EMPTY, 'Requisito I: Tile -1,-1 modificado');
    assert(world.getEffectiveTile(0, 0)?.type === TileType.EMPTY, 'Requisito I: Tile 0,0 modificado');
    assert(world.getEffectiveTile(-17, -10)?.type === TileType.EMPTY, 'Requisito I: Tile -17,-10 modificado');
    assert(world.getEffectiveTile(-16, -10)?.type === TileType.EMPTY, 'Requisito I: Tile -16,-10 modificado');
    console.log('✓ Requisito I passou: Fronteiras de chunks em coordenadas negativas');
  }

  // =========================================================================
  // Requisito J: Unload/reload preserva modificação
  // =========================================================================
  {
    const world = new World(12345);
    const chunkMgr = world.getChunkManager();

    // 1. Carregar explicitamente o chunk (0, 0)
    const chunk0 = chunkMgr.getChunk(0, 0);
    assert(chunk0 !== null, 'Requisito J: Chunk (0,0) deve ser gerado');

    // 2. Modificar um tile dentro do chunk (0, 0)
    const modResult = world.removeTile(3, 4, { replacementTileType: TileType.EMPTY });
    assert(modResult.success, 'Requisito J: Modificação deve ter sucesso');
    assert(chunk0.getTile(3, 4)?.type === TileType.EMPTY, 'Requisito J: Chunk atual deve refletir a modificação');

    // 3. Descarregar o chunk (0, 0)
    chunkMgr.unloadChunk(0, 0);
    assert(!chunkMgr.hasChunk(0, 0), 'Requisito J: Chunk (0,0) deve estar descarregado');

    // 4. Recarregar o chunk (0, 0)
    const reloadedChunk = chunkMgr.getChunk(0, 0);
    assert(reloadedChunk !== null, 'Requisito J: Chunk recarregado não deve ser nulo');
    assert(
      reloadedChunk.getTile(3, 4)?.type === TileType.EMPTY,
      'Requisito J: Chunk recarregado deve restaurar o tile modificado',
    );
    assert(
      world.getEffectiveTile(3, 4)?.type === TileType.EMPTY,
      'Requisito J: getEffectiveTile deve continuar retornando o tile modificado',
    );
    console.log('✓ Requisito J passou: Unload/reload de chunk preserva perfeitamente a modificação');
  }

  // =========================================================================
  // Requisito K: Múltiplas modificações independentes
  // =========================================================================
  {
    const world = new World(12345);
    world.removeTile(1, 1, { replacementTileType: TileType.EMPTY });
    world.removeTile(2, 2, { replacementTileType: TileType.EMPTY });
    world.removeTile(-5, 8, { replacementTileType: TileType.EMPTY });
    world.removeTile(100, 200, { replacementTileType: TileType.EMPTY });

    const registry = world.getTileModificationRegistry();
    assert(registry.getModificationCount() === 4, 'Requisito K: Deve haver 4 modificações registradas');
    assert(world.getEffectiveTile(1, 1)?.type === TileType.EMPTY, 'Requisito K: Tile 1,1');
    assert(world.getEffectiveTile(2, 2)?.type === TileType.EMPTY, 'Requisito K: Tile 2,2');
    assert(world.getEffectiveTile(-5, 8)?.type === TileType.EMPTY, 'Requisito K: Tile -5,8');
    assert(world.getEffectiveTile(100, 200)?.type === TileType.EMPTY, 'Requisito K: Tile 100,200');
    console.log('✓ Requisito K passou: Múltiplas modificações independentes');
  }

  // =========================================================================
  // Requisito L: Mesma coordenada não cria duplicação
  // =========================================================================
  {
    const world = new World(12345);
    const registry = world.getTileModificationRegistry();

    world.removeTile(7, 7, { replacementTileType: TileType.EMPTY });
    const countBefore = registry.getModificationCount();

    // Aplica novamente uma alteração na mesma coordenada
    world.applyTileModification(7, 7, TileType.GRASS);
    const countAfter = registry.getModificationCount();

    assert(countBefore === countAfter, 'Requisito L: O número total de modificações não deve aumentar');
    assert(world.getEffectiveTile(7, 7)?.type === TileType.GRASS, 'Requisito L: Deve assumir o estado mais recente');
    console.log('✓ Requisito L passou: Mesma coordenada não cria duplicação');
  }

  // =========================================================================
  // Requisito M: Consulta não materializa chunks desnecessariamente
  // =========================================================================
  {
    const world = new World(12345);
    assert(world.getLoadedChunkCount() === 0, 'Requisito M: Mundo virgem tem 0 chunks carregados');

    // getEffectiveTile em coordenada arbitrária distante
    const tile = world.getEffectiveTile(888, 999);
    assert(tile !== null, 'Requisito M: Tile procedural deve ser retornado');
    assert(
      world.getLoadedChunkCount() === 0,
      'Requisito M: getEffectiveTile NUNCA deve materializar chunks',
    );

    // Consulta de modificação no registry
    world.getTileModificationRegistry().hasModification(888, 999);
    assert(
      world.getLoadedChunkCount() === 0,
      'Requisito M: TileModificationRegistry NUNCA materializa chunks',
    );
    console.log('✓ Requisito M passou: Consulta O(1) pura sem materialização acidental de chunks');
  }

  // =========================================================================
  // Requisito N: Colisão usa o estado efetivo do tile
  // =========================================================================
  {
    const world = new World(12345);
    const collisionSystem = new CollisionSystem(world);

    // Assegura chunk carregado para teste de colisão
    world.getChunkManager().getChunk(0, 0);

    // Teste 1: Tile caminhável (GRASS) transformado em EMPTY (não caminhável)
    world.applyTileModification(2, 2, TileType.GRASS);
    assert(
      collisionSystem.canOccupyArea(
        2 * TILE_SIZE,
        2 * TILE_SIZE,
        PLAYER_SIZE,
        PLAYER_SIZE,
      ),
      'Requisito N: Tile GRASS deve permitir ocupação',
    );

    world.removeTile(2, 2, { replacementTileType: TileType.EMPTY });
    assert(
      !collisionSystem.canOccupyArea(
        2 * TILE_SIZE,
        2 * TILE_SIZE,
        PLAYER_SIZE,
        PLAYER_SIZE,
      ),
      'Requisito N: Tile removido para EMPTY deve bloquear passagem na colisão',
    );

    // Teste 2: Tile bloqueante (EMPTY) removido/preenchido para GRASS
    world.removeTile(2, 2, { replacementTileType: TileType.GRASS });
    assert(
      collisionSystem.canOccupyArea(
        2 * TILE_SIZE,
        2 * TILE_SIZE,
        PLAYER_SIZE,
        PLAYER_SIZE,
      ),
      'Requisito N: Tile revertido para GRASS deve voltar a permitir passagem na colisão',
    );
    console.log('✓ Requisito N passou: Sistema de colisão respeita fielmente o estado efetivo do tile');
  }

  // =========================================================================
  // Requisito O: Alteração não muda Player.size
  // =========================================================================
  {
    const world = new World(12345);
    const player = new Player({ worldX: 100, worldY: 100 });
    const sizeBefore = player.size;

    world.removeTile(3, 3, { replacementTileType: TileType.EMPTY });

    assert(
      player.size === sizeBefore,
      'Requisito O: As dimensões físicas do Player não devem ser alteradas pela mutação de terreno',
    );
    console.log('✓ Requisito O passou: Dimensões físicas do Player preservadas');
  }

  // =========================================================================
  // Requisito P: Alteração não muda velocidade
  // =========================================================================
  {
    const world = new World(12345);
    const player = new Player({ worldX: 100, worldY: 100 });
    const speedBefore = player.speed;

    world.removeTile(3, 3, { replacementTileType: TileType.EMPTY });

    assert(
      player.speed === speedBefore,
      'Requisito P: A velocidade do Player não deve sofrer alterações colaterais',
    );
    console.log('✓ Requisito P passou: Velocidade do Player inalterada');
  }

  // =========================================================================
  // Requisito Q: Alteração não depende do tamanho do sprite
  // =========================================================================
  {
    const world = new World(12345);
    const player = new Player({ worldX: 100, worldY: 100 });

    // Modificações de tile operam estritamente sobre a grade espacial discreta (TILE_SIZE = 32)
    const result = world.removeTile(4, 4);
    assert(result.success, 'Requisito Q: Operação espacial opera independentemente de sprites');
    assert(
      player.size === PLAYER_SIZE,
      'Requisito Q: A física do Player é desacoplada dos frames visuais de animação de sprites',
    );
    console.log('✓ Requisito Q passou: Manipulação desacoplada do tamanho visual de sprites');
  }

  // =========================================================================
  // Requisito R: Remoção pode produzir resultado/drop declarativo
  // =========================================================================
  {
    const world = new World(12345);
    const expectedDrop = createItemStack('wood', 3);

    const result = world.removeTile(6, 6, {
      replacementTileType: TileType.EMPTY,
      drops: [expectedDrop],
      skipWorldDropSpawn: true,
    });

    assert(result.success, 'Requisito R: Operação deve suceder');
    assert(result.drops !== undefined && result.drops.length === 1, 'Requisito R: Drops devem estar presentes');
    assert(result.drops![0].itemId === 'wood', 'Requisito R: Drop deve conter wood');
    assert(result.drops![0].quantity === 3, 'Requisito R: Quantidade deve ser 3');
    console.log('✓ Requisito R passou: Drops declarativos produzidos corretamente pelo resultado');
  }

  // =========================================================================
  // Requisito S: Operação rejeitada não modifica o mundo
  // =========================================================================
  {
    const world = new World(12345);
    const originalTile = world.getEffectiveTile(11, 11);

    // Caso 1: Rejeição por predicado
    const rejectedByPredicate = world.removeTile(11, 11, {
      canRemovePredicate: () => false,
    });
    assert(!rejectedByPredicate.success, 'Requisito S: Predicado deve rejeitar operação');
    assert(
      rejectedByPredicate.failureReason === 'REMOVAL_PREVENTED_BY_PREDICATE',
      'Requisito S: Motivo correto de falha',
    );
    assert(
      !world.getTileModificationRegistry().hasModification(11, 11),
      'Requisito S: Mundo não deve ser modificado após rejeição por predicado',
    );

    // Caso 2: Rejeição por alcance excessivo
    const rejectedByRange = world.removeTile(11, 11, {
      sourcePosition: { worldX: 0, worldY: 0 },
      maxRange: 10, // Menor que a distância do tile (11 * 16 = 176px)
    });
    assert(!rejectedByRange.success, 'Requisito S: Fora de alcance deve rejeitar');
    assert(rejectedByRange.failureReason === 'OUT_OF_RANGE', 'Requisito S: Motivo OUT_OF_RANGE');
    assert(
      !world.getTileModificationRegistry().hasModification(11, 11),
      'Requisito S: Mundo não deve ser modificado após rejeição por alcance',
    );
    assert(
      world.getEffectiveTile(11, 11)?.type === originalTile?.type,
      'Requisito S: Tile original permanece intacto',
    );
    console.log('✓ Requisito S passou: Operações rejeitadas não introduzem mutações no mundo');
  }

  // =========================================================================
  // Requisito T: Determinismo após múltiplos unload/reload
  // =========================================================================
  {
    const world = new World(99999);
    const chunkMgr = world.getChunkManager();

    // Aplica alterações em coordenadas variadas (positivas e negativas)
    world.removeTile(2, 3, { replacementTileType: TileType.EMPTY });
    world.removeTile(-5, -6, { replacementTileType: TileType.EMPTY });
    world.removeTile(20, 25, { replacementTileType: TileType.EMPTY });

    // Descarrega todos os chunks possíveis
    chunkMgr.unloadChunk(0, 0);
    chunkMgr.unloadChunk(-1, -1);
    chunkMgr.unloadChunk(1, 1);

    // Recarrega em ordem inversa
    const c1 = chunkMgr.getChunk(1, 1);
    const cNeg = chunkMgr.getChunk(-1, -1);
    const c0 = chunkMgr.getChunk(0, 0);

    assert(world.getEffectiveTile(20, 25)?.type === TileType.EMPTY, 'Requisito T: Tile 20,25 preservado');
    assert(world.getEffectiveTile(-5, -6)?.type === TileType.EMPTY, 'Requisito T: Tile -5,-6 preservado');
    assert(world.getEffectiveTile(2, 3)?.type === TileType.EMPTY, 'Requisito T: Tile 2,3 preservado');
    console.log('✓ Requisito T passou: Determinismo total após múltiplos ciclos de unload e reload');
  }

  // =========================================================================
  // Cenário de Integração (Seção 13):
  // PLAYER -> seleciona tile -> remove tile -> deixa de bloquear passagem -> chunk descarrega -> chunk recarrega -> tile continua removido
  // =========================================================================
  {
    const world = new World(54321);
    const collisionSystem = new CollisionSystem(world);
    const tileSelectionSystem = new TileSelectionSystem();
    const camera = new Camera(0, 0);
    const viewport = { width: 800, height: 600 };

    // 1. Carregar chunk inicial e colocar um obstáculo de terreno bloqueante em (2, 0)
    world.getChunkManager().getChunk(0, 0);
    world.applyTileModification(2, 0, TileType.EMPTY); // Tile bloqueante na frente do player

    const player = new Player({ worldX: 0, worldY: 0 });
    const targetTileCoord = { tileX: 2, tileY: 0 };

    // Verificar que o tile atualmente bloqueia passagem
    const targetWorldX = targetTileCoord.tileX * TILE_SIZE;
    const targetWorldY = targetTileCoord.tileY * TILE_SIZE;
    assert(
      !collisionSystem.canOccupyArea(targetWorldX, targetWorldY, PLAYER_SIZE, PLAYER_SIZE),
      'Cenário Integração: Tile inicial bloqueia passagem',
    );

    // 2. Simular seleção pelo Player via toque/mouse (ScreenCoord -> WorldCoord -> TileCoord)
    const targetWorldCenter = {
      worldX: targetTileCoord.tileX * TILE_SIZE + TILE_SIZE / 2,
      worldY: targetTileCoord.tileY * TILE_SIZE + TILE_SIZE / 2,
    };
    const targetScreen = camera.worldToScreen(targetWorldCenter, viewport);
    const resolvedTile = tileSelectionSystem.screenToTileCoord(targetScreen, viewport, camera, world);
    assert(
      resolvedTile.tileX === targetTileCoord.tileX && resolvedTile.tileY === targetTileCoord.tileY,
      'Cenário Integração: Conversão Tela -> Mundo -> Tile determinística',
    );
    tileSelectionSystem.selectTile(resolvedTile);
    assert(tileSelectionSystem.getSelectedTile()?.tileX === 2, 'Cenário Integração: Tile selecionado com sucesso');

    // 3. Player remove o tile selecionado (desbloqueia o caminho transformando em GRASS)
    const removeResult = world.removeTile(resolvedTile.tileX, resolvedTile.tileY, {
      sourcePosition: player.position,
      maxRange: 100, // Alcance suficiente
      replacementTileType: TileType.GRASS,
    });
    assert(removeResult.success, 'Cenário Integração: Remoção do tile executada com sucesso');

    // 4. Tile deixa de bloquear passagem
    assert(
      collisionSystem.canOccupyArea(targetWorldX, targetWorldY, PLAYER_SIZE, PLAYER_SIZE),
      'Cenário Integração: Tile modificado deixa de bloquear passagem!',
    );

    // 5. Chunk descarrega da memória
    world.getChunkManager().unloadChunk(0, 0);
    assert(!world.getChunkManager().hasChunk(0, 0), 'Cenário Integração: Chunk descarregado');

    // 6. Chunk recarrega
    const reloaded = world.getChunkManager().getChunk(0, 0);
    assert(reloaded !== null, 'Cenário Integração: Chunk recarregado');

    // 7. Tile continua removido/modificado e permitindo passagem
    assert(
      world.getEffectiveTile(2, 0)?.type === TileType.GRASS,
      'Cenário Integração: Tile continua modificado após reload',
    );
    assert(
      collisionSystem.canOccupyArea(targetWorldX, targetWorldY, PLAYER_SIZE, PLAYER_SIZE),
      'Cenário Integração: Área continua transitável após reload do chunk!',
    );
    console.log('✓ Cenário de Integração passou: Ciclo completo Player -> Seleção -> Remoção -> Desbloqueio -> Unload -> Reload');
  }

  console.log('=== Todos os testes do sistema de modificação de tiles passaram com sucesso! ===');
}

// Execução direta se invocado via runner de teste
runTileModificationTests();
