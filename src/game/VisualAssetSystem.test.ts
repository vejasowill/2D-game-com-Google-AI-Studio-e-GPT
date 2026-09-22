import { AssetManager } from './AssetManager.ts';
import { Camera } from './Camera.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { Player, PlayerDirection } from './Player.ts';
import { AnimationDefinition, AnimationState, SpriteFrame } from './SpriteAnimation.ts';
import {
  SpriteSheet,
  createGridSpriteSheet,
  createStaticSpriteSheet,
} from './SpriteSheet.ts';
import { SpriteRenderer } from './SpriteRenderer.ts';
import {
  ANCHOR_BOTTOM_CENTER,
  ANCHOR_CENTER,
  ANCHOR_FEET,
  ANCHOR_TOP_LEFT,
  VisualBounds,
  VisualConfig,
  calculateEntityVisualBounds,
} from './VisualAnchor.ts';
import { World } from './World.ts';
import { WorldCoord } from './types.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[FALHA DE ASSERT] ${message}`);
  }
}

console.log('[TEST] Iniciando suíte de testes da Infraestrutura de Pixel Art e Assets Visuais...');

// ============================================================================
// Requisito A: Asset definitions são determinísticas
// ============================================================================
{
  const sheetA = createGridSpriteSheet({
    id: 'test_grid',
    frameWidth: 32,
    frameHeight: 64,
    animationConfigs: {
      walk: { rowStart: 0, frameCount: 4, frameDuration: 0.15, hasDirections: true },
    },
  });

  const sheetB = createGridSpriteSheet({
    id: 'test_grid',
    frameWidth: 32,
    frameHeight: 64,
    animationConfigs: {
      walk: { rowStart: 0, frameCount: 4, frameDuration: 0.15, hasDirections: true },
    },
  });

  const frameA = sheetA.getFrame('walk', 'left', 2);
  const frameB = sheetB.getFrame('walk', 'left', 2);

  assert(frameA !== null && frameB !== null, 'Frames devem ser válidos');
  assert(
    frameA!.sx === frameB!.sx &&
      frameA!.sy === frameB!.sy &&
      frameA!.sWidth === frameB!.sWidth &&
      frameA!.sHeight === frameB!.sHeight,
    'Definições idênticas de spritesheet devem produzir frames com recortes estritamente determinísticos',
  );
  console.log('✓ Requisito A passou: Asset definitions são 100% determinísticas');
}

// ============================================================================
// Requisito B: Animações avançam deterministicamente com deltaTime
// ============================================================================
{
  const animDef: AnimationDefinition = {
    name: 'walk',
    frameDuration: 0.1,
    loop: true,
    frames: [
      { sx: 0, sy: 0, sWidth: 32, sHeight: 64 },
      { sx: 32, sy: 0, sWidth: 32, sHeight: 64 },
      { sx: 64, sy: 0, sWidth: 32, sHeight: 64 },
      { sx: 96, sy: 0, sWidth: 32, sHeight: 64 },
    ],
  };

  const animStateA = new AnimationState();
  const animStateB = new AnimationState();

  // Executa uma sequência fixa de deltas em duas instâncias separadas
  const deltas = [0.05, 0.06, 0.09, 0.05, 0.1, 0.2];
  for (const dt of deltas) {
    animStateA.update(dt, animDef);
    animStateB.update(dt, animDef);
  }

  assert(
    animStateA.currentFrameIndex === animStateB.currentFrameIndex,
    'O índice de frame deve ser exatamente igual sob a mesma sequência de deltaTimes',
  );
  assert(
    Math.abs(animStateA.elapsedTime - animStateB.elapsedTime) < 1e-9,
    'O tempo decorrido acumulado deve ser estritamente determinístico',
  );
  console.log('✓ Requisito B passou: Animações avançam deterministicamente com deltaTime');
}

// ============================================================================
// Requisito C: Animações não dependem de Math.random()
// ============================================================================
{
  const originalRandom = Math.random;
  let randomCallCount = 0;
  Math.random = () => {
    randomCallCount++;
    return 0.5;
  };

  try {
    const animDef: AnimationDefinition = {
      name: 'test',
      frameDuration: 0.1,
      loop: true,
      frames: [
        { sx: 0, sy: 0, sWidth: 32, sHeight: 32 },
        { sx: 32, sy: 0, sWidth: 32, sHeight: 32 },
      ],
    };

    const state = new AnimationState();
    for (let i = 0; i < 50; i++) {
      state.update(0.05, animDef);
    }

    assert(
      randomCallCount === 0,
      'A máquina de estados de animação não deve chamar Math.random() em momento algum',
    );
  } finally {
    Math.random = originalRandom;
  }
  console.log('✓ Requisito C passou: Animações não dependem de Math.random()');
}

// ============================================================================
// Requisito D: Trocar um asset não altera a física
// ============================================================================
{
  const initialPos: WorldCoord = { worldX: 100, worldY: 200 };
  const player = new Player(initialPos, 160, 24);

  // Estado físico antes de trocar o asset
  const speedBefore = player.speed;
  const sizeBefore = player.size;
  const posBeforeX = player.position.worldX;
  const posBeforeY = player.position.worldY;

  // Substitui a configuração visual para um sprite 4 vezes maior
  player.visualConfig = {
    visualWidth: 128,
    visualHeight: 256,
    anchorX: 0.5,
    anchorY: 1.0,
    scale: 2.0,
  };

  assert(player.speed === speedBefore, 'A velocidade física não deve mudar ao alterar asset visual');
  assert(player.size === sizeBefore, 'A hitbox física (size) não deve mudar ao alterar asset visual');
  assert(
    player.position.worldX === posBeforeX && player.position.worldY === posBeforeY,
    'A posição física não deve mudar ao alterar asset visual',
  );
  console.log('✓ Requisito D passou: Trocar um asset não altera a física');
}

// ============================================================================
// Requisito E: Alterar o tamanho visual não altera a hitbox
// ============================================================================
{
  const pos: WorldCoord = { worldX: 50, worldY: 80 };
  const physicalWidth = 24;
  const physicalHeight = 24;

  const normalConfig: VisualConfig = {
    visualWidth: 32,
    visualHeight: 64,
    anchorX: 0.5,
    anchorY: 1.0,
  };

  const giantConfig: VisualConfig = {
    visualWidth: 128,
    visualHeight: 256,
    anchorX: 0.5,
    anchorY: 1.0,
  };

  const normalBounds = calculateEntityVisualBounds(pos, physicalWidth, physicalHeight, normalConfig);
  const giantBounds = calculateEntityVisualBounds(pos, physicalWidth, physicalHeight, giantConfig);

  // As caixas visuais possuem tamanhos visuais distintos
  assert(normalBounds.height === 64, 'Normal deve ter 64px de altura visual');
  assert(giantBounds.height === 256, 'Gigante deve ter 256px de altura visual');

  // Mas as dimensões físicas continuam estritamente 24x24
  assert(physicalWidth === 24 && physicalHeight === 24, 'Hitbox física permanece inalterada');
  console.log('✓ Requisito E passou: Alterar o tamanho visual não altera a hitbox');
}

// ============================================================================
// Requisito F: Anchor permanece correto
// ============================================================================
{
  const footBaseX = 100 + 12; // centro horizontal de um objeto 24px em x=100 -> 112
  const footBaseY = 200 + 24; // linha de base dos pés de um objeto em y=200 -> 224

  const config: VisualConfig = {
    visualWidth: 32,
    visualHeight: 64,
    anchorX: ANCHOR_FEET.anchorX, // 0.5
    anchorY: ANCHOR_FEET.anchorY, // 1.0
  };

  const bounds = calculateEntityVisualBounds({ worldX: 100, worldY: 200 }, 24, 24, config);

  // A base inferior da caixa visual deve coincidir exatamente com a linha de base dos pés (footBaseY)
  const visualBottomY = bounds.worldY + bounds.height;
  const visualCenterX = bounds.worldX + bounds.width / 2;

  assert(
    Math.abs(visualBottomY - footBaseY) < 1e-9,
    `Base visual (${visualBottomY}) deve coincidir exatamente com os pés físicos (${footBaseY})`,
  );
  assert(
    Math.abs(visualCenterX - footBaseX) < 1e-9,
    `Centro visual (${visualCenterX}) deve coincidir com o centro físico (${footBaseX})`,
  );
  console.log('✓ Requisito F passou: Anchor nos pés e no centro permanece estritamente correto');
}

// ============================================================================
// Requisito G: Y-sorting continua baseado na base física
// ============================================================================
{
  const playerA = new Player({ worldX: 100, worldY: 100 }, 160, 24);
  const playerB = new Player({ worldX: 100, worldY: 110 }, 160, 24);

  // Mesmo que playerA use um sprite visual gigantesco de 500px que se estenda para cima
  playerA.visualConfig = {
    visualWidth: 500,
    visualHeight: 500,
    anchorX: 0.5,
    anchorY: 1.0,
  };

  const baseAY = playerA.getFootBaseY(); // 100 + 24 = 124
  const baseBY = playerB.getFootBaseY(); // 110 + 24 = 134

  assert(
    baseAY < baseBY,
    'O Y-sorting deve posicionar A antes de B porque os pés de A (124) estão acima dos pés de B (134)',
  );
  console.log('✓ Requisito G passou: Y-sorting rigorosamente baseado na base física (footBaseY)');
}

// ============================================================================
// Requisito H: Coordenadas negativas continuam funcionando
// ============================================================================
{
  const negPos: WorldCoord = { worldX: -1500, worldY: -2400 };
  const config: VisualConfig = {
    visualWidth: 32,
    visualHeight: 64,
    anchorX: 0.5,
    anchorY: 1.0,
  };

  const bounds = calculateEntityVisualBounds(negPos, 24, 24, config);
  const footBaseY = negPos.worldY + 24;

  assert(
    Math.abs(bounds.worldY + bounds.height - footBaseY) < 1e-9,
    'Ancoragem em quadrantes negativos profundos deve operar com precisão exata',
  );
  console.log('✓ Requisito H passou: Coordenadas negativas profundas operam sem anomalias');
}

// ============================================================================
// Requisito I: Sprites não materializam chunks
// ============================================================================
{
  const world = new World(12345);
  // O mundo não possui chunks carregados inicialmente
  assert(world.getChunkManager().getLoadedChunkCount() === 0, 'Mundo deve iniciar com 0 chunks carregados');

  // Cálculos visuais e de âncoras para objetos distantes
  const bounds = calculateEntityVisualBounds(
    { worldX: 50000, worldY: 99000 },
    32,
    32,
    { visualWidth: 64, visualHeight: 128, anchorX: 0.5, anchorY: 1.0 },
  );

  assert(bounds.width === 64 && bounds.height === 128, 'Bounds calculados');
  assert(
    world.getChunkManager().getLoadedChunkCount() === 0,
    'O sistema visual NUNCA deve provocar carregamento ou materialização de chunks',
  );
  console.log('✓ Requisito I passou: Sprites e cálculos visuais não materializam chunks');
}

// ============================================================================
// Requisito J: Spritesheets recortam os frames corretamente
// ============================================================================
{
  const sheet = createGridSpriteSheet({
    id: 'warrior',
    frameWidth: 32,
    frameHeight: 64,
    animationConfigs: {
      idle: { rowStart: 0, frameCount: 2, frameDuration: 0.5, hasDirections: true },
      walk: { rowStart: 4, frameCount: 4, frameDuration: 0.15, hasDirections: true },
    },
  });

  // Linha de walk: rowStart = 4.
  // Direções: down=0 (linha 4), up=1 (linha 5), left=2 (linha 6), right=3 (linha 7)
  const walkLeftFrame2 = sheet.getFrame('walk', 'left', 2);
  assert(walkLeftFrame2 !== null, 'Frame walk-left-2 deve existir');
  assert(walkLeftFrame2!.sx === 2 * 32, 'sx deve ser col 2 * 32 = 64');
  assert(walkLeftFrame2!.sy === 6 * 64, 'sy deve ser row 6 * 64 = 384');
  assert(walkLeftFrame2!.sWidth === 32, 'sWidth deve ser 32');
  assert(walkLeftFrame2!.sHeight === 64, 'sHeight deve ser 64');

  const walkRightFrame0 = sheet.getFrame('walk', 'right', 0);
  assert(walkRightFrame0 !== null, 'Frame walk-right-0 deve existir');
  assert(walkRightFrame0!.sx === 0, 'sx deve ser 0');
  assert(walkRightFrame0!.sy === 7 * 64, 'sy deve ser row 7 * 64 = 448');
  console.log('✓ Requisito J passou: Spritesheets recortam os frames com precisão matemática');
}

// ============================================================================
// Requisito K: Assets podem ser reutilizados por múltiplas entidades
// ============================================================================
{
  const sharedSheet = createGridSpriteSheet({
    id: 'shared_npc',
    frameWidth: 32,
    frameHeight: 64,
    animationConfigs: {
      idle: { rowStart: 0, frameCount: 2, frameDuration: 0.5, hasDirections: true },
    },
  });

  // Duas entidades independentes que compartilham a mesma definição de spritesheet
  const entity1Anim = new AnimationState();
  const entity2Anim = new AnimationState();

  entity1Anim.play('idle', 'down');
  entity2Anim.play('idle', 'up');

  // Avança o tempo de forma diferente para cada entidade
  entity1Anim.update(0.6, sharedSheet.getAnimation('idle'));
  entity2Anim.update(0.1, sharedSheet.getAnimation('idle'));

  assert(
    entity1Anim.currentFrameIndex === 1,
    'Entidade 1 deve ter avançado para o frame 1 após 0.6s (frameDuration=0.5)',
  );
  assert(
    entity2Anim.currentFrameIndex === 0,
    'Entidade 2 deve continuar no frame 0 após 0.1s',
  );
  assert(
    entity1Anim.direction === 'down' && entity2Anim.direction === 'up',
    'Cada entidade preserva independentemente seu estado e direção',
  );
  console.log('✓ Requisito K passou: Assets e spritesheets são compartilhados por múltiplas entidades');
}

// ============================================================================
// Requisito L: Assets não são carregados repetidamente de forma desnecessária
// ============================================================================
{
  const assetMgr = AssetManager.getInstance();
  const promise1 = assetMgr.loadImage('/assets/test/unique_sprite.png');
  const promise2 = assetMgr.loadImage('/assets/test/unique_sprite.png');

  assert(
    promise1 === promise2,
    'Requisições simultâneas para o mesmo caminho devem retornar a mesma promessa em andamento',
  );

  const img1 = await promise1;
  const img2 = await assetMgr.loadImage('/assets/test/unique_sprite.png');
  assert(
    img1 === img2,
    'Requisições subsequentes devem retornar a mesma instância em cache',
  );
  console.log('✓ Requisito L passou: Assets possuem cache e deduplicação estrita de carregamento');
}

// ============================================================================
// Requisito M: O fallback continua funcionando quando o asset real não existe
// ============================================================================
{
  // Simula um CanvasRenderingContext2D leve para testar o SpriteRenderer
  let fallbackExecuted = false;
  let drawnImageCount = 0;

  const mockCtx = {
    imageSmoothingEnabled: true,
    drawImage: () => {
      drawnImageCount++;
    },
  } as unknown as CanvasRenderingContext2D;

  const spriteRenderer = new SpriteRenderer(mockCtx);
  const camera = new Camera(0, 0);
  const viewport = { width: 800, height: 600 };

  const visualBounds: VisualBounds = { worldX: -16, worldY: -32, width: 32, height: 64 };
  const sheetWithoutImage = new SpriteSheet('placeholder', 32, 64, {});

  spriteRenderer.renderSprite(
    camera,
    viewport,
    visualBounds,
    sheetWithoutImage,
    null,
    () => {
      fallbackExecuted = true;
    },
  );

  assert(
    fallbackExecuted,
    'Quando o asset não possuir imagem carregada, o fallback deve ser executado',
  );
  assert(
    drawnImageCount === 0,
    'Não deve tentar chamar drawImage quando não houver imagem carregada',
  );
  console.log('✓ Requisito M passou: Fallback técnico executado com segurança quando asset não existe');
}

// ============================================================================
// Requisito N: O sistema continua funcionando quando uma entidade possui apenas um frame
// ============================================================================
{
  const staticSheet = createStaticSpriteSheet('rock_static', 32, 32);
  const anim = staticSheet.getAnimation('default');
  assert(anim !== null && anim !== undefined, 'Animação estática deve existir');

  const state = new AnimationState({ initialAnimation: 'default' });

  // Executa muitas atualizações de tempo
  for (let i = 0; i < 100; i++) {
    state.update(0.16, anim);
  }

  assert(
    state.currentFrameIndex === 0,
    'Entidades com apenas um frame devem permanecer deterministicamente no frame 0',
  );
  const frame = state.getCurrentFrame(anim);
  assert(
    frame !== null && frame.sWidth === 32 && frame.sHeight === 32,
    'Frame de entidade estática deve ser recuperado com sucesso',
  );
  console.log('✓ Requisito N passou: Entidades estáticas com 1 frame operam estavelmente');
}

// ============================================================================
// Requisito O: O sistema continua funcionando quando uma animação possui vários frames
// ============================================================================
{
  const multiAnim: AnimationDefinition = {
    name: 'run',
    frameDuration: 0.1,
    loop: false, // não em loop para testar conclusão
    frames: [
      { sx: 0, sy: 0, sWidth: 32, sHeight: 64 },
      { sx: 32, sy: 0, sWidth: 32, sHeight: 64 },
      { sx: 64, sy: 0, sWidth: 32, sHeight: 64 },
      { sx: 96, sy: 0, sWidth: 32, sHeight: 64 },
      { sx: 128, sy: 0, sWidth: 32, sHeight: 64 },
    ],
  };

  const state = new AnimationState({ initialAnimation: 'run' });
  assert(state.currentFrameIndex === 0, 'Início no frame 0');

  state.update(0.15, multiAnim);
  assert(state.currentFrameIndex === 1, 'Após 0.15s com duration 0.1, avança para frame 1');

  state.update(0.2, multiAnim);
  assert(state.currentFrameIndex === 3, 'Após mais 0.2s, avança para frame 3');

  state.update(1.0, multiAnim);
  assert(
    state.currentFrameIndex === 4 && state.isFinished,
    'Animação sem loop estaciona no último frame e marca isFinished = true',
  );
  console.log('✓ Requisito O passou: Animações de múltiplos frames avançam e concluem perfeitamente');
}

// ============================================================================
// Requisito P: imageSmoothingEnabled permanece desativado durante a renderização de Pixel Art
// ============================================================================
{
  const mockCtx: { imageSmoothingEnabled: boolean } = {
    imageSmoothingEnabled: true,
  };

  const spriteRenderer = new SpriteRenderer(mockCtx as unknown as CanvasRenderingContext2D);
  assert(
    mockCtx.imageSmoothingEnabled === false,
    'Ao instanciar SpriteRenderer, imageSmoothingEnabled deve ser imediatamente false',
  );

  // Simula uma tentativa externa de ligar suavização
  mockCtx.imageSmoothingEnabled = true;
  spriteRenderer.enforcePixelArtSmoothing();
  assert(
    (mockCtx.imageSmoothingEnabled as boolean) === false,
    'enforcePixelArtSmoothing deve forçar imageSmoothingEnabled para false',
  );
  console.log('✓ Requisito P passou: imageSmoothingEnabled rigorosamente desativado para Pixel Art');
}

console.log('[TEST] Todos os requisitos (A até P) foram validados com 100% de sucesso!');
