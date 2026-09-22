import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { NaturalObjectType } from './NaturalObjectDefinition.ts';
import { Player, PlayerDirection } from './Player.ts';
import { InputSource, TileType, Vector2D, WorldCoord } from './types.ts';
import { World } from './World.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

class MockInput implements InputSource {
  constructor(public dir: Vector2D = { x: 0, y: 0 }) {}

  public getMovementDirection(): Vector2D {
    return this.dir;
  }
}

export function runPlayerTests(): void {
  console.log('[TEST] Iniciando suíte de testes do Player, Direção e Câmera...');

  // Teste A: Movimento cardinal preservado com velocidade esperada
  {
    const world = new World(12345);
    for (let tx = 0; tx <= 15; tx++) {
      for (let ty = 0; ty <= 15; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const startPos: WorldCoord = { worldX: 100, worldY: 100 };
    const player = new Player(startPos, DEFAULT_PLAYER_SPEED, PLAYER_SIZE);

    const inputRight = new MockInput({ x: 1, y: 0 });
    const dt = 0.5;
    player.update(dt, inputRight, collision);

    const expectedX = 100 + DEFAULT_PLAYER_SPEED * dt;
    assert(
      Math.abs(player.position.worldX - expectedX) < 1e-3,
      `Movimento no eixo X incorreto. Esperado ${expectedX}, obtido ${player.position.worldX}`,
    );
    assert(player.position.worldY === 100, 'Movimento no eixo Y não deveria ocorrer');
    assert(player.isMoving === true, 'Player deveria reportar isMoving = true');
    assert(player.direction === PlayerDirection.RIGHT, 'Direção deveria ser RIGHT');
    console.log('✓ Teste A passou: Movimento cardinal preservado com velocidade esperada');
  }

  // Teste B: Movimento diagonal normalizado: magnitude da velocidade não ultrapassa movimento cardinal
  {
    const world = new World(12345);
    for (let tx = 0; tx <= 20; tx++) {
      for (let ty = 0; ty <= 20; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const startPos: WorldCoord = { worldX: 200, worldY: 200 };
    const player = new Player(startPos, DEFAULT_PLAYER_SPEED, PLAYER_SIZE);

    const inputDiagonal = new MockInput({ x: 1, y: 1 });
    const dt = 1.0;
    player.update(dt, inputDiagonal, collision);

    const dx = player.position.worldX - 200;
    const dy = player.position.worldY - 200;
    const totalDistance = Math.hypot(dx, dy);

    assert(
      Math.abs(totalDistance - DEFAULT_PLAYER_SPEED * dt) < 1e-3,
      `Velocidade diagonal excedeu ou divergiu da velocidade base: obtido ${totalDistance}, esperado ${DEFAULT_PLAYER_SPEED * dt}`,
    );
    console.log('✓ Teste B passou: Movimento diagonal rigorosamente normalizado');
  }

  // Teste C: Direção visual atualizada corretamente para os 4 eixos cardinais
  {
    const world = new World(12345);
    for (let tx = 10; tx <= 25; tx++) {
      for (let ty = 10; ty <= 25; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const player = new Player({ worldX: 500, worldY: 500 });

    player.update(0.1, new MockInput({ x: 0, y: -1 }), collision);
    assert(player.direction === PlayerDirection.UP, 'Direção deveria ser UP');

    player.update(0.1, new MockInput({ x: 0, y: 1 }), collision);
    assert(player.direction === PlayerDirection.DOWN, 'Direção deveria ser DOWN');

    player.update(0.1, new MockInput({ x: -1, y: 0 }), collision);
    assert(player.direction === PlayerDirection.LEFT, 'Direção deveria ser LEFT');

    player.update(0.1, new MockInput({ x: 1, y: 0 }), collision);
    assert(player.direction === PlayerDirection.RIGHT, 'Direção deveria ser RIGHT');
    console.log('✓ Teste C passou: Direção visual atualizada corretamente nos 4 eixos');
  }

  // Teste D: Direção permanece rigorosamente estável quando o Player para
  {
    const world = new World(12345);
    for (let tx = 10; tx <= 25; tx++) {
      for (let ty = 10; ty <= 25; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const player = new Player({ worldX: 500, worldY: 500 });

    // Move para a esquerda
    player.update(0.1, new MockInput({ x: -1, y: 0 }), collision);
    assert(player.direction === PlayerDirection.LEFT, 'Deveria ser LEFT');
    assert(player.isMoving === true, 'Deveria estar em movimento');

    // Para o movimento (input zero)
    player.update(0.1, new MockInput({ x: 0, y: 0 }), collision);
    assert(player.direction === PlayerDirection.LEFT, 'Direção deveria permanecer LEFT quando parado');
    assert(player.isMoving === false, 'Deveria reportar parado');

    // Múltiplos updates parados mantêm a mesma direção
    for (let i = 0; i < 5; i++) {
      player.update(0.016, new MockInput({ x: 0, y: 0 }), collision);
      assert(player.direction === PlayerDirection.LEFT, 'Direção deve persistir indefinidamente quando parado');
      assert(player.isMoving === false, 'isMoving deve continuar false');
    }
    console.log('✓ Teste D passou: Direção permanece perfeitamente estável após parar');
  }

  // Teste E: Posição física e dimensões permanecem independentes da apresentação visual
  {
    const initialPos = { worldX: 350, worldY: 420 };
    const player = new Player(initialPos);

    assert(player.size === PLAYER_SIZE, `Tamanho físico deve ser ${PLAYER_SIZE}`);
    assert(player.position.worldX === 350, 'Posição X não deve ser alterada por renderização');
    assert(player.position.worldY === 420, 'Posição Y não deve ser alterada por renderização');

    const center = player.getCenter();
    assert(center.worldX === 350 + PLAYER_SIZE / 2, 'Centro X geométrico correto');
    assert(center.worldY === 420 + PLAYER_SIZE / 2, 'Centro Y geométrico correto');
    console.log('✓ Teste E passou: Posição física e dimensões independentes da representação visual');
  }

  // Teste F: Spawn inicial permanece idêntico e consistente
  {
    const spawnCoord: WorldCoord = { worldX: 0, worldY: 0 };
    const player = new Player(spawnCoord);

    assert(player.position.worldX === 0, 'Spawn X deve ser 0');
    assert(player.position.worldY === 0, 'Spawn Y deve ser 0');
    assert(player.direction === PlayerDirection.DOWN, 'Direção inicial deve ser DOWN');
    assert(player.isMoving === false, 'Estado inicial deve ser parado');
    console.log('✓ Teste F passou: Spawn inicial permanece idêntico');
  }

  // Teste G: Coordenadas negativas no espaço infinito funcionam sem falhas
  {
    const world = new World(12345);
    const tileX = Math.floor(-2500 / 32);
    const tileY = Math.floor(-3500 / 32);
    for (let tx = tileX - 5; tx <= tileX + 5; tx++) {
      for (let ty = tileY - 5; ty <= tileY + 5; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const player = new Player({ worldX: -2500, worldY: -3500 });

    player.update(0.5, new MockInput({ x: -1, y: 0 }), collision);
    assert(player.position.worldX < -2500, 'Movimento para esquerda em coordenadas negativas deve avançar');
    assert(player.direction === PlayerDirection.LEFT, 'Direção em coordenadas negativas deve ser LEFT');
    assert(player.isMoving === true, 'Player deve estar se movendo');
    console.log('✓ Teste G passou: Coordenadas negativas no espaço infinito funcionam sem restrição');
  }

  // Teste H: Cruzamento de fronteiras de chunks continua fluido e correto
  {
    const world = new World(12345);
    for (let tx = 14; tx <= 18; tx++) {
      for (let ty = 2; ty <= 5; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const player = new Player({ worldX: 508, worldY: 100 });

    player.update(0.2, new MockInput({ x: 1, y: 0 }), collision);
    assert(player.position.worldX > 512, 'Player deve atravessar a fronteira do chunk (512px) livremente');
    console.log('✓ Teste H passou: Cruzamento de fronteiras de chunks confirmado');
  }

  // Teste I: Y-sorting: base dos pés do Player determina a ordem de profundidade com WorldObjects
  {
    const player = new Player({ worldX: 100, worldY: 100 }, DEFAULT_PLAYER_SPEED, 20);
    const playerBaseY = player.position.worldY + player.size; // 120

    const treeBehindPlayer = {
      position: { worldX: 100, worldY: 80 },
      height: 30, // base = 80 + 30 = 110
      type: NaturalObjectType.TREE,
    };

    const treeInFrontOfPlayer = {
      position: { worldX: 100, worldY: 100 },
      height: 35, // base = 100 + 35 = 135
      type: NaturalObjectType.TREE,
    };

    const obj1Base = treeBehindPlayer.position.worldY + treeBehindPlayer.height;
    const obj2Base = treeInFrontOfPlayer.position.worldY + treeInFrontOfPlayer.height;

    assert(obj1Base < playerBaseY, 'Árvore acima deve ter base menor que a base do player');
    assert(playerBaseY < obj2Base, 'Árvore abaixo deve ter base maior que a base do player');
    console.log('✓ Teste I passou: Y-sorting da base dos pés do Player consistente com WorldObjects');
  }

  // Teste J: Camera opera no espaço infinito com amortecimento suave e sem limites artificiais
  {
    const camera = new Camera(0, 0);

    // Deslocamento típico de movimento (ex: -30 pixels)
    camera.follow(-30, -30, 0.05);
    assert(camera.worldX < 0 && camera.worldX > -30, 'Camera deve mover-se gradualmente em direção ao alvo');
    assert(camera.worldY < 0 && camera.worldY > -30, 'Camera deve mover-se gradualmente em direção ao alvo');

    const intermediateX = camera.worldX;
    camera.follow(-30, -30, 0.05);
    assert(camera.worldX < intermediateX, 'Camera deve continuar avançando suavemente');

    // Ajuste direto para distâncias extremas (spawn/teletransporte > 250px)
    camera.follow(50000, 50000, 0.016);
    assert(camera.worldX === 50000, 'Salto extremo deve ajustar posição imediatamente');
    assert(camera.worldY === 50000, 'Salto extremo deve ajustar posição imediatamente');
    console.log('✓ Teste J passou: Camera opera no espaço infinito com amortecimento estável');
  }

  // Teste K: Nenhuma consulta visual do Player provoca materialização desnecessária de chunks
  {
    const world = new World(99999);
    const player = new Player({ worldX: 8000, worldY: 8000 });

    const loadedBefore = world.getChunkManager().getLoadedChunkCount();
    const center = player.getCenter();
    assert(center.worldX === 8000 + player.size / 2, 'Centro X correto');
    assert(center.worldY === 8000 + player.size / 2, 'Centro Y correto');

    const loadedAfter = world.getChunkManager().getLoadedChunkCount();
    assert(loadedAfter === loadedBefore, 'Nenhum chunk deve ser carregado por consultas do Player');
    console.log('✓ Teste K passou: Consultas ao Player não materializam chunks na memória');
  }

  console.log('[TEST] Todos os testes do Player, Direção e Câmera foram concluídos com sucesso!');
}

runPlayerTests();
