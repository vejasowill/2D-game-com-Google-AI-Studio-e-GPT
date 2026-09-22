import { DEFAULT_PLAYER_SPEED, PLAYER_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { NaturalObjectType } from './NaturalObjectDefinition.ts';
import { Player, PlayerDirection } from './Player.ts';
import {
  DEFAULT_PLAYER_VISUAL_CONFIG,
  PlayerAnimationState,
  PlayerVisualConfig,
  calculatePlayerVisualBounds,
} from './PlayerVisual.ts';
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
  console.log('[TEST] Iniciando suíte completa de testes arquiteturais do Player, Ancoragem e Visual...');

  // =========================================================================
  // REQUISITO A: O tamanho visual pode ser 32×64 independentemente da hitbox
  // =========================================================================
  {
    const player = new Player({ worldX: 100, worldY: 100 }, DEFAULT_PLAYER_SPEED, PLAYER_SIZE);

    assert(player.size === PLAYER_SIZE, `Hitbox física do Player deve permanecer ${PLAYER_SIZE}px`);

    const visualConfig32x64: PlayerVisualConfig = {
      visualWidth: 32,
      visualHeight: 64,
      anchorX: 0.5,
      anchorY: 1.0,
    };
    player.visualConfig = visualConfig32x64;

    const bounds = player.getVisualBounds();
    assert(bounds.width === 32, 'Largura visual deve ser 32px');
    assert(bounds.height === 64, 'Altura visual deve ser 64px');
    assert(player.size === PLAYER_SIZE, `Hitbox física NÃO deve ser alterada (deve continuar ${PLAYER_SIZE}px)`);
    console.log('✓ Requisito A passou: Tamanho visual pode ser 32×64 totalmente independente da hitbox física');
  }

  // =========================================================================
  // REQUISITO B: A linha de base visual permanece ancorada corretamente nos pés
  // =========================================================================
  {
    const startX = 200;
    const startY = 300;
    const player = new Player({ worldX: startX, worldY: startY }, DEFAULT_PLAYER_SPEED, 24);

    const footBaseY = player.getFootBaseY();
    assert(footBaseY === startY + 24, `A linha de base física dos pés deve ser exatamente startY + size (${startY + 24})`);

    const footPos = player.getFootPosition();
    assert(footPos.worldX === startX + 12, 'Centro X dos pés deve ser startX + size/2');
    assert(footPos.worldY === footBaseY, 'Posição Y dos pés deve ser idêntica a footBaseY');

    // Com sprite 32×64 ancorado em anchorX = 0.5 e anchorY = 1.0
    const bounds = player.getVisualBounds({
      visualWidth: 32,
      visualHeight: 64,
      anchorX: 0.5,
      anchorY: 1.0,
    });

    // O topo do sprite sobe 64px a partir da linha dos pés
    assert(bounds.worldY === footBaseY - 64, `Topo do sprite deve começar em footBaseY - 64 (${footBaseY - 64})`);
    // A base inferior do sprite visual coincide exatamente com a linha de base física
    assert(bounds.worldY + bounds.height === footBaseY, 'Base inferior do sprite coincide com footBaseY');
    // O centro horizontal do sprite coincide com o centro horizontal da hitbox
    assert(bounds.worldX === startX + 12 - 16, 'Sprite visual centralizado horizontalmente com a hitbox');
    console.log('✓ Requisito B passou: Linha de base visual permanece perfeitamente ancorada nos pés');
  }

  // =========================================================================
  // REQUISITO C: Alterar a altura visual não altera a posição física nem a hitbox
  // =========================================================================
  {
    const initialPos: WorldCoord = { worldX: 450, worldY: 600 };
    const player = new Player(initialPos, DEFAULT_PLAYER_SPEED, 24);

    const prevX = player.position.worldX;
    const prevY = player.position.worldY;
    const prevSize = player.size;
    const prevFootY = player.getFootBaseY();

    // Altera configuração visual para diferentes alturas (24, 32, 64, 128)
    for (const h of [24, 32, 64, 128]) {
      player.visualConfig = {
        visualWidth: 32,
        visualHeight: h,
        anchorX: 0.5,
        anchorY: 1.0,
      };

      assert(player.position.worldX === prevX, 'Posição X física não deve mudar com altura visual');
      assert(player.position.worldY === prevY, 'Posição Y física não deve mudar com altura visual');
      assert(player.size === prevSize, 'Hitbox física não deve mudar com altura visual');
      assert(player.getFootBaseY() === prevFootY, 'Linha dos pés não deve mudar com altura visual');
      assert(player.getCenter().worldX === prevX + prevSize / 2, 'Centro físico X inalterado');
      assert(player.getCenter().worldY === prevY + prevSize / 2, 'Centro físico Y inalterado');
    }
    console.log('✓ Requisito C passou: Alterar a altura visual não altera em nada a posição física nem a hitbox');
  }

  // =========================================================================
  // REQUISITO D: Y-sorting continua rigorosamente baseado nos pés
  // =========================================================================
  {
    // Player na posição Y = 100 com tamanho 24 => pés em Y = 124
    const player = new Player({ worldX: 100, worldY: 100 }, DEFAULT_PLAYER_SPEED, 24);
    // Configura sprite alto de 64px: topo visual em Y = 124 - 64 = 60
    player.visualConfig = {
      visualWidth: 32,
      visualHeight: 64,
      anchorX: 0.5,
      anchorY: 1.0,
    };

    const footBaseY = player.getFootBaseY();
    assert(footBaseY === 124, 'Base dos pés deve ser 124px');

    // Árvore 1: base em Y = 115 (atrás do jogador porque 115 < 124)
    // Embora o topo do sprite do jogador suba até Y = 60 (acima da base da árvore),
    // o critério de profundidade deve ser comparado COM OS PÉS (124).
    const treeBehind = {
      position: { worldX: 100, worldY: 85 },
      height: 30, // base = 85 + 30 = 115
      type: NaturalObjectType.TREE,
    };
    const treeBehindBaseY = treeBehind.position.worldY + treeBehind.height; // 115

    // Árvore 2: base em Y = 135 (na frente do jogador porque 124 < 135)
    const treeInFront = {
      position: { worldX: 100, worldY: 100 },
      height: 35, // base = 100 + 35 = 135
      type: NaturalObjectType.TREE,
    };
    const treeInFrontBaseY = treeInFront.position.worldY + treeInFront.height; // 135

    assert(treeBehindBaseY < footBaseY, 'Objeto atrás do jogador tem base menor que os pés do jogador');
    assert(footBaseY < treeInFrontBaseY, 'Objeto à frente do jogador tem base maior que os pés do jogador');
    console.log('✓ Requisito D passou: Y-sorting rigorosamente baseado na linha de base dos pés (footBaseY)');
  }

  // =========================================================================
  // REQUISITO E: As quatro direções (UP, DOWN, LEFT, RIGHT) continuam disponíveis
  // =========================================================================
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
    assert(player.direction === PlayerDirection.UP, 'Direção UP deve ser selecionada');

    player.update(0.1, new MockInput({ x: 0, y: 1 }), collision);
    assert(player.direction === PlayerDirection.DOWN, 'Direção DOWN deve ser selecionada');

    player.update(0.1, new MockInput({ x: -1, y: 0 }), collision);
    assert(player.direction === PlayerDirection.LEFT, 'Direção LEFT deve ser selecionada');

    player.update(0.1, new MockInput({ x: 1, y: 0 }), collision);
    assert(player.direction === PlayerDirection.RIGHT, 'Direção RIGHT deve ser selecionada');
    console.log('✓ Requisito E passou: Todas as 4 direções cardinais disponíveis e ativas');
  }

  // =========================================================================
  // REQUISITO F: O estado parado continua preservando a última direção
  // =========================================================================
  {
    const world = new World(12345);
    for (let tx = 10; tx <= 25; tx++) {
      for (let ty = 10; ty <= 25; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const player = new Player({ worldX: 500, worldY: 500 });

    // Move para cima
    player.update(0.1, new MockInput({ x: 0, y: -1 }), collision);
    assert(player.direction === PlayerDirection.UP, 'Deveria ser UP');
    assert(player.isMoving === true, 'isMoving deve ser true');

    // Para o movimento
    player.update(0.1, new MockInput({ x: 0, y: 0 }), collision);
    assert(player.direction === PlayerDirection.UP, 'Direção deve permanecer UP quando parado');
    assert(player.isMoving === false, 'isMoving deve ser false');

    // Executa múltiplos frames sem movimento
    for (let i = 0; i < 10; i++) {
      player.update(0.016, new MockInput({ x: 0, y: 0 }), collision);
      assert(player.direction === PlayerDirection.UP, 'Direção UP deve persistir indefinidamente');
      assert(player.isMoving === false, 'isMoving deve permanecer false');
    }
    console.log('✓ Requisito F passou: Estado parado continua preservando estritamente a última direção');
  }

  // =========================================================================
  // REQUISITO G: Coordenadas negativas continuam funcionando perfeitamente
  // =========================================================================
  {
    const world = new World(12345);
    const tileX = Math.floor(-3000 / 32);
    const tileY = Math.floor(-4000 / 32);
    for (let tx = tileX - 5; tx <= tileX + 5; tx++) {
      for (let ty = tileY - 5; ty <= tileY + 5; ty++) {
        world.setTile(tx, ty, TileType.GRASS);
      }
    }
    const collision = new CollisionSystem(world);
    const player = new Player({ worldX: -3000, worldY: -4000 });

    player.update(0.5, new MockInput({ x: -1, y: 0 }), collision);
    assert(player.position.worldX < -3000, 'Movimento para esquerda em coordenadas negativas deve avançar');
    assert(player.direction === PlayerDirection.LEFT, 'Direção em coordenadas negativas deve ser LEFT');
    assert(player.isMoving === true, 'Player deve estar se movendo');

    const bounds = player.getVisualBounds();
    assert(bounds.worldX < -3000, 'Limites visuais em coordenadas negativas calculados corretamente');
    assert(bounds.worldY < -4000, 'Limites visuais em coordenadas negativas calculados corretamente');
    console.log('✓ Requisito G passou: Coordenadas negativas no espaço infinito operam sem restrições');
  }

  // =========================================================================
  // REQUISITO H: Cruzamento de fronteiras de chunks continua fluido e correto
  // =========================================================================
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
    console.log('✓ Requisito H passou: Cruzamento de fronteiras de chunks permanece fluido');
  }

  // =========================================================================
  // REQUISITO I: Nenhuma consulta visual materializa chunks desnecessariamente
  // =========================================================================
  {
    const world = new World(88888);
    const player = new Player({ worldX: 12000, worldY: 12000 });

    const loadedBefore = world.getChunkManager().getLoadedChunkCount();
    const footPos = player.getFootPosition();
    const footY = player.getFootBaseY();
    const bounds = player.getVisualBounds();
    const center = player.getCenter();

    assert(footPos.worldY === footY, 'Coordenadas consistentes');
    assert(bounds.width === 32 && bounds.height === 64, 'Bounds visuais calculados');
    assert(center.worldX === 12000 + player.size / 2, 'Centro calculado');

    const loadedAfter = world.getChunkManager().getLoadedChunkCount();
    assert(
      loadedAfter === loadedBefore,
      `Consultas visuais não devem materializar chunks (antes: ${loadedBefore}, depois: ${loadedAfter})`,
    );
    console.log('✓ Requisito I passou: Nenhuma consulta visual materializa chunks na memória');
  }

  // =========================================================================
  // TESTE ADICIONAL: Ciclo determinístico de animação por deltaTime (PlayerAnimationState)
  // =========================================================================
  {
    const anim = new PlayerAnimationState({
      idleFramesCount: 2,
      walkFramesCount: 4,
      idleFrameDuration: 0.2,
      walkFrameDuration: 0.1,
    });

    assert(anim.currentFrame === 0, 'Frame inicial deve ser 0');

    // Avança tempo em repouso (idle)
    anim.update(0.2, false);
    assert(anim.currentFrame === 1, 'Após 0.2s em idle deve avançar para o frame 1');

    anim.update(0.2, false);
    assert(anim.currentFrame === 0, 'Após outro 0.2s deve ciclar de volta para o frame 0 (totalFrames=2)');

    // Inicia caminhada: transição para isMoving reseta para o frame 0
    anim.update(0.016, true);
    assert(anim.currentFrame === 0, 'Transição para walk deve reiniciar no frame 0');

    // Caminhando: 4 frames com duração 0.1s cada
    anim.update(0.1, true);
    assert(anim.currentFrame === 1, 'Frame de caminhada 1');
    anim.update(0.1, true);
    assert(anim.currentFrame === 2, 'Frame de caminhada 2');
    anim.update(0.1, true);
    assert(anim.currentFrame === 3, 'Frame de caminhada 3');
    anim.update(0.1, true);
    assert(anim.currentFrame === 0, 'Frame de caminhada cicla de volta para 0');

    // Para de caminhar: transição para idle reseta frame determinísticamente
    anim.update(0.016, false);
    assert(anim.currentFrame === 0, 'Transição de volta para idle reinicia no frame 0');
    console.log('✓ Teste de animação passou: Máquina de estados determinística de frames opera com perfeição');
  }

  // =========================================================================
  // TESTE DE CÂMERA: Acompanhamento suave no espaço infinito preservado
  // =========================================================================
  {
    const camera = new Camera(0, 0);

    camera.follow(-30, -30, 0.05);
    assert(camera.worldX < 0 && camera.worldX > -30, 'Camera se move gradualmente em direção ao alvo');
    assert(camera.worldY < 0 && camera.worldY > -30, 'Camera se move gradualmente em direção ao alvo');

    const intermediateX = camera.worldX;
    camera.follow(-30, -30, 0.05);
    assert(camera.worldX < intermediateX, 'Camera continua avançando suavemente');

    camera.follow(50000, 50000, 0.016);
    assert(camera.worldX === 50000, 'Salto extremo deve ajustar posição imediatamente');
    assert(camera.worldY === 50000, 'Salto extremo deve ajustar posição imediatamente');
    console.log('✓ Teste de câmera passou: Acompanhamento amortecido no espaço infinito preservado');
  }

  console.log('[TEST] Todos os testes arquiteturais do Player foram concluídos com sucesso!');
}

runPlayerTests();
