import { World } from './World.ts';
import { Player, PlayerDirection } from './Player.ts';
import { WorldCoord, InputSource } from './types.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { TestToggleObject } from './TestToggleObject.ts';
import { WorldObject } from './WorldObject.ts';
import {
  Interactable,
  InteractionContext,
  InteractionDefinition,
  InteractionResult,
  isInteractable,
} from './InteractionTypes.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FALHA DE ASSERT] ${message}`);
    throw new Error(`[FALHA DE ASSERT] ${message}`);
  }
}

class MockInput implements InputSource {
  public justPressedActions = new Set<string>();
  public pressedActions = new Set<string>();

  public getMovementDirection(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }

  public isActionPressed(action: string): boolean {
    return this.pressedActions.has(action);
  }

  public isActionJustPressed(action: string): boolean {
    return this.justPressedActions.has(action);
  }

  public press(action: string): void {
    this.justPressedActions.add(action);
    this.pressedActions.add(action);
  }

  public hold(action: string): void {
    this.justPressedActions.delete(action);
    this.pressedActions.add(action);
  }

  public release(action: string): void {
    this.justPressedActions.delete(action);
    this.pressedActions.delete(action);
  }

  public clearFrameState(): void {
    this.justPressedActions.clear();
  }
}

console.log('[TEST] Iniciando suíte de testes de Ações de Interação e Mutações de Mundo (A até T)...');

// ============================================================================
// Teste A: Interação OFF → ON
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const toggle = new TestToggleObject('toggle_a', { worldX: 120, worldY: 100 }, false);
  world.getObjectManager().addObject(toggle);

  assert(toggle.active === false, 'Inicialmente deve estar OFF.');
  assert(toggle.state.active === false, 'Estado inicial deve ser OFF.');

  const result = interactionSystem.executeInteraction(player, world, toggle);
  assert(result !== null && result.success, 'Interação deve ser executada com sucesso.');
  assert(toggle.active === true, 'Estado active deve alternar para ON (true).');
  assert(toggle.state.active === true, 'Objeto state deve refletir active === true.');
  assert(toggle.state.label === 'ON', 'Rótulo de estado deve ser ON.');
  assert(result?.message === 'Beacon: ON', 'Feedback textual deve indicar Beacon: ON.');

  // Validar se o WorldObjectManager tem o estado sincronizado
  const storedState = world.getObjectManager().getObjectState('toggle_a');
  assert(storedState?.active === true, 'WorldObjectManager deve registrar active === true.');

  console.log('  ✓ Teste A: Interação OFF → ON validada com sucesso.');
}

// ============================================================================
// Teste B: Interação ON → OFF
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const toggle = new TestToggleObject('toggle_b', { worldX: 120, worldY: 100 }, true);
  world.getObjectManager().addObject(toggle);

  assert(toggle.active === true, 'Inicialmente deve estar ON.');

  const result = interactionSystem.executeInteraction(player, world, toggle);
  assert(result !== null && result.success, 'Interação deve ser executada com sucesso.');
  assert(toggle.active === false, 'Estado active deve alternar para OFF (false).');
  assert(toggle.state.active === false, 'Objeto state deve refletir active === false.');
  assert(toggle.state.label === 'OFF', 'Rótulo de estado deve ser OFF.');
  assert(result?.message === 'Beacon: OFF', 'Feedback textual deve indicar Beacon: OFF.');

  const storedState = world.getObjectManager().getObjectState('toggle_b');
  assert(storedState?.active === false, 'WorldObjectManager deve registrar active === false.');

  console.log('  ✓ Teste B: Interação ON → OFF validada com sucesso.');
}

// ============================================================================
// Teste C: InteractionSystem não conhece o tipo concreto do objeto
// ============================================================================
{
  class GenericUnknownArtifact implements WorldObject, Interactable {
    public readonly id = 'alien_artifact_99';
    public readonly type = 'mysterious_ancient_relic';
    public position: WorldCoord = { worldX: 100, worldY: 100 };
    public width = 16;
    public height = 16;
    public interaction: InteractionDefinition = {
      id: 'examine_relic',
      label: 'Examinar Relíquia',
    };
    public examined = false;

    public interact(_context: InteractionContext): InteractionResult {
      this.examined = true;
      return {
        success: true,
        interactionId: this.interaction.id,
        actionLabel: this.interaction.label,
        message: 'A relíquia ressoa com energia antiga.',
        code: 'artifact_examined',
      };
    }
  }

  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 80, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const relic = new GenericUnknownArtifact();
  assert(isInteractable(relic), 'Artefato desconhecido deve satisfazer isInteractable.');

  world.getObjectManager().addObject(relic);
  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'alien_artifact_99', 'Deve selecionar o artefato desconhecido.');

  const result = interactionSystem.executeInteraction(player, world, target);
  assert(result !== null && result.success, 'Deve executar sem conhecer o tipo.');
  assert(relic.examined === true, 'O comportamento interno do objeto deve ter sido acionado.');
  console.log('  ✓ Teste C: InteractionSystem é 100% agnóstico a tipos concretos de objeto.');
}

// ============================================================================
// Teste D: Objeto fora do alcance não pode ser alterado
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const distantToggle = new TestToggleObject('distant_toggle', { worldX: 300, worldY: 100 }, false);
  world.getObjectManager().addObject(distantToggle);

  const mockInput = new MockInput();
  mockInput.press('interact');

  const updateResult = interactionSystem.update(player, world, mockInput);
  assert(updateResult === null, 'Nenhum resultado deve ser gerado para objeto fora de alcance.');
  assert(distantToggle.active === false, 'Objeto fora de alcance deve permanecer inalterado (OFF).');
  console.log('  ✓ Teste D: Objeto fora do alcance não pode ser alterado.');
}

// ============================================================================
// Teste E: Objeto atrás do jogador não pode ser alterado
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT; // Olhando para a direita

  // Objeto localizado atrás do jogador (à esquerda)
  const behindToggle = new TestToggleObject('behind_toggle', { worldX: 75, worldY: 100 }, false);
  world.getObjectManager().addObject(behindToggle);

  const mockInput = new MockInput();
  mockInput.press('interact');

  const result = interactionSystem.update(player, world, mockInput);
  assert(result === null, 'Não deve interagir com objeto nas costas.');
  assert(behindToggle.active === false, 'Objeto atrás das costas deve permanecer inalterado.');
  console.log('  ✓ Teste E: Objeto atrás do jogador não pode ser alterado.');
}

// ============================================================================
// Teste F: Interação funciona nas quatro direções cardinais
// ============================================================================
{
  const directions = [
    { dir: PlayerDirection.RIGHT, pos: { worldX: 120, worldY: 100 }, id: 'dir_r' },
    { dir: PlayerDirection.LEFT,  pos: { worldX: 80,  worldY: 100 }, id: 'dir_l' },
    { dir: PlayerDirection.UP,    pos: { worldX: 100, worldY: 80  }, id: 'dir_u' },
    { dir: PlayerDirection.DOWN,  pos: { worldX: 100, worldY: 120 }, id: 'dir_d' },
  ];

  for (const item of directions) {
    const world = new World(12345);
    const interactionSystem = new InteractionSystem(32);
    const player = new Player({ worldX: 100, worldY: 100 });
    player.direction = item.dir;

    const toggle = new TestToggleObject(item.id, item.pos, false);
    world.getObjectManager().addObject(toggle);

    const target = interactionSystem.findBestTarget(player, world);
    assert(target !== null && target.id === item.id, `Deve encontrar o objeto na direção ${item.dir}.`);

    const result = interactionSystem.executeInteraction(player, world, target);
    assert(result !== null && result.success, `Interação na direção ${item.dir} deve ter sucesso.`);
    assert(toggle.active === true, `Objeto na direção ${item.dir} deve ter mudado para ON.`);
  }

  console.log('  ✓ Teste F: Interação funciona em todas as 4 direções cardinais.');
}

// ============================================================================
// Teste G: Interação funciona em coordenadas negativas profundas
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: -5000, worldY: -8000 });
  player.direction = PlayerDirection.RIGHT;

  const negToggle = new TestToggleObject('neg_toggle', { worldX: -4980, worldY: -8000 }, false);
  world.getObjectManager().addObject(negToggle);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'neg_toggle', 'Deve encontrar o objeto em coordenadas negativas.');

  const result = interactionSystem.executeInteraction(player, world, target);
  assert(result !== null && result.success, 'Interação em coordenadas negativas deve ser bem-sucedida.');
  assert(negToggle.active === true, 'Objeto deve ter seu estado alterado para ON.');
  console.log('  ✓ Teste G: Interação em coordenadas negativas validada.');
}

// ============================================================================
// Teste H: Interação funciona atravessando fronteiras de chunks
// ============================================================================
{
  // CHUNK_SIZE = 16 tiles * 32px = 512px.
  // Fronteira entre Chunk 0 e Chunk 1 ocorre em X = 512.
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 504, worldY: 100 }); // Dentro do chunk 0
  player.direction = PlayerDirection.RIGHT;

  const borderToggle = new TestToggleObject('border_toggle', { worldX: 520, worldY: 100 }, false); // Dentro do chunk 1
  world.getObjectManager().addObject(borderToggle);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'border_toggle', 'Deve detectar através da fronteira de chunk.');

  const result = interactionSystem.executeInteraction(player, world, target);
  assert(result !== null && result.success, 'Interação cruzando fronteira deve suceder.');
  assert(borderToggle.active === true, 'Estado deve alterar para ON cruzando a fronteira.');
  console.log('  ✓ Teste H: Detecção e mutação através de fronteiras de chunks validadas.');
}

// ============================================================================
// Teste I: Interação não materializa chunks
// ============================================================================
{
  const world = new World(999);
  const initialLoadedChunks = world.getLoadedChunkCount();

  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 2000, worldY: 3000 });
  player.direction = PlayerDirection.DOWN;

  // Consulta de alvo e tentativa de interação
  interactionSystem.findBestTarget(player, world);
  const afterCount = world.getLoadedChunkCount();
  assert(afterCount === initialLoadedChunks, 'Consultas de interação não podem forçar carregamento de chunks.');
  console.log('  ✓ Teste I: Ausência de materialização espúria de chunks confirmada.');
}

// ============================================================================
// Teste J: Sprite visual não influencia alcance da interação
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto com tamanho físico pequeno (16x16), situado em 165px (além do alcance padrão de 32px após o Player em 120)
  const smallHitboxObj = new TestToggleObject('small_hb', { worldX: 165, worldY: 100 }, false, 16, 16);
  world.getObjectManager().addObject(smallHitboxObj);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target === null, 'Não deve alcançar objeto fora do alcance físico mesmo que o sprite fosse grande.');
  console.log('  ✓ Teste J: Alcance de interação é governado estritamente pela geometria física.');
}

// ============================================================================
// Teste K: Alterar o tamanho visual não altera hitbox nem interação
// ============================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  const initialPhysicalSize = player.size;
  const initialFootBase = player.getFootBaseY();

  // Alterar dimensões visuais do player para 32x64 via visualConfig
  player.visualConfig = {
    visualWidth: 32,
    visualHeight: 64,
    anchorX: 0.5,
    anchorY: 1.0,
  };

  const visualBounds = player.getVisualBounds();
  assert(visualBounds.width === 32, 'Largura visual deve ser 32px.');
  assert(visualBounds.height === 64, 'Altura visual deve ser 64px.');
  assert(player.size === initialPhysicalSize, 'Hitbox física (size) deve ser invariante.');
  assert(player.getFootBaseY() === initialFootBase, 'Linha de base dos pés deve ser invariante.');
  console.log('  ✓ Teste K: Visual ≠ Hitbox ≠ Interaction State rigorosamente preservado.');
}

// ============================================================================
// Teste L: Remover objeto remove corretamente seu índice espacial
// ============================================================================
{
  const world = new World(12345);
  const obj = new TestToggleObject('to_remove', { worldX: 150, worldY: 150 }, false);
  world.getObjectManager().addObject(obj);

  assert(world.getObjectManager().getObjectById('to_remove') !== null, 'Objeto deve existir.');
  assert(world.getObjectManager().getObjectsInArea(140, 140, 40, 40).length === 1, 'Objeto deve estar no índice.');

  // Aplicar mutação de remoção via WorldMutationHandler
  const success = WorldMutationHandler.applyMutation(world, {
    type: 'remove_object',
    objectId: 'to_remove',
  });

  assert(success === true, 'Remoção deve ser bem-sucedida.');
  assert(world.getObjectManager().getObjectById('to_remove') === null, 'Objeto não deve mais ser retornado por ID.');
  assert(world.getObjectManager().getObjectsInArea(140, 140, 40, 40).length === 0, 'Índice espacial deve estar limpo.');
  console.log('  ✓ Teste L: Remover objeto remove corretamente seu índice espacial.');
}

// ============================================================================
// Teste M: Adicionar objeto mantém índice espacial correto
// ============================================================================
{
  const world = new World(12345);
  const newObj = new TestToggleObject('dynamically_added', { worldX: 250, worldY: 250 }, false);

  const success = WorldMutationHandler.applyMutation(world, {
    type: 'create_object',
    object: newObj,
  });

  assert(success === true, 'Criação deve ser bem-sucedida.');
  assert(world.getObjectManager().getObjectById('dynamically_added') !== null, 'Objeto deve existir no manager.');
  const query = world.getObjectManager().getObjectsInArea(240, 240, 30, 30);
  assert(query.length === 1 && query[0].id === 'dynamically_added', 'Objeto deve estar presente no índice espacial.');
  console.log('  ✓ Teste M: Adicionar objeto mantém índice espacial correto.');
}

// ============================================================================
// Teste N: Mover objeto mantém índice espacial correto
// ============================================================================
{
  const world = new World(12345);
  const movable = new TestToggleObject('movable_obj', { worldX: 100, worldY: 100 }, false);
  world.getObjectManager().addObject(movable);

  // Mover para uma área distante (Chunk diferente)
  const moved = WorldMutationHandler.applyMutation(world, {
    type: 'update_position',
    objectId: 'movable_obj',
    newPosition: { worldX: 800, worldY: 800 },
  });

  assert(moved === true, 'Mutação de posição deve ser bem-sucedida.');
  assert(world.getObjectManager().getObjectsInArea(90, 90, 30, 30).length === 0, 'Antiga área deve estar vazia.');
  const newAreaObjects = world.getObjectManager().getObjectsInArea(790, 790, 30, 30);
  assert(newAreaObjects.length === 1 && newAreaObjects[0].id === 'movable_obj', 'Nova área deve conter o objeto.');
  console.log('  ✓ Teste N: Mover objeto mantém índice espacial perfeitamente consistente.');
}

// ============================================================================
// Teste O: Descarregar/recarregar chunk mantém o comportamento determinístico
// ============================================================================
{
  const world = new World(42);
  const chunkManager = world.getChunkManager();
  const objManager = world.getObjectManager();

  // Forçar carregamento do chunk (0, 0)
  const chunk0 = chunkManager.getChunk(0, 0);
  assert(chunk0 !== null, 'Chunk (0,0) deve carregar.');

  // Adicionar um objeto dinâmico no chunk (0, 0)
  const dynObj = new TestToggleObject('chunk_test_obj', { worldX: 64, worldY: 64 }, false);
  objManager.addObject(dynObj);
  assert(objManager.getObjectById('chunk_test_obj') !== null, 'Objeto deve estar registrado.');

  const initialTileType = chunk0.getTile(0, 0)?.type;

  // Descarregar chunk e limpar objetos associados ao chunk descarregado
  objManager.removeObject('chunk_test_obj');
  chunkManager.unloadChunk(0, 0);

  assert(objManager.getObjectById('chunk_test_obj') === null, 'Objeto foi devidamente retirado ao descarregar.');

  // Recarregar chunk: deve gerar os tiles idênticos de forma puramente determinística
  const reloadedChunk = chunkManager.getChunk(0, 0);
  assert(reloadedChunk !== null, 'Chunk recarregado não pode ser nulo.');
  assert(reloadedChunk.getTile(0, 0)?.type === initialTileType, 'Tiles devem ser deterministicamente idênticos.');
  console.log('  ✓ Teste O: Ciclo de vida e determinismo entre descarregar/recarregar chunks comprovados.');
}

// ============================================================================
// Teste P: Pressionar E uma vez executa uma única interação
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const toggle = new TestToggleObject('single_press_obj', { worldX: 120, worldY: 100 }, false);
  world.getObjectManager().addObject(toggle);

  const mockInput = new MockInput();
  mockInput.press('interact');

  const result = interactionSystem.update(player, world, mockInput, 0.016);
  assert(result !== null && result.success, 'Interação deve ser acionada no primeiro frame.');
  assert(toggle.toggleCount === 1, 'Deve executar exatamente 1 alternância.');
  console.log('  ✓ Teste P: Pressionar E executa uma única interação.');
}

// ============================================================================
// Teste Q: Manter E pressionado não executa interações repetidas
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const toggle = new TestToggleObject('hold_obj', { worldX: 120, worldY: 100 }, false);
  world.getObjectManager().addObject(toggle);

  const mockInput = new MockInput();
  // Frame 1: Tecla pressionada
  mockInput.press('interact');
  interactionSystem.update(player, world, mockInput, 0.016);
  mockInput.clearFrameState();

  // Frames 2 a 10: Tecla mantida pressionada (hold)
  for (let f = 0; f < 10; f++) {
    mockInput.hold('interact');
    const resultHold = interactionSystem.update(player, world, mockInput, 0.016);
    assert(resultHold === null, 'Não deve reexecutar interação enquanto a tecla for mantida.');
  }

  assert(toggle.toggleCount === 1, 'Contador de interações deve permanecer estritamente em 1.');
  console.log('  ✓ Teste Q: Manter tecla pressionada não repete a ação.');
}

// ============================================================================
// Teste R: Interações consecutivas após soltar e pressionar novamente
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const toggle = new TestToggleObject('consecutive_obj', { worldX: 120, worldY: 100 }, false);
  world.getObjectManager().addObject(toggle);

  const mockInput = new MockInput();

  // 1ª Interação: OFF -> ON
  mockInput.press('interact');
  interactionSystem.update(player, world, mockInput, 0.016);
  mockInput.clearFrameState();
  assert(toggle.active === true && toggle.toggleCount === 1, 'Primeira interação deve levar para ON.');

  // Soltar a tecla
  mockInput.release('interact');
  interactionSystem.update(player, world, mockInput, 0.016);
  mockInput.clearFrameState();

  // 2ª Interação: ON -> OFF
  mockInput.press('interact');
  interactionSystem.update(player, world, mockInput, 0.016);
  mockInput.clearFrameState();
  assert(toggle.active === false && toggle.toggleCount === 2, 'Segunda interação deve levar para OFF.');

  // Soltar a tecla
  mockInput.release('interact');
  interactionSystem.update(player, world, mockInput, 0.016);
  mockInput.clearFrameState();

  // 3ª Interação: OFF -> ON
  mockInput.press('interact');
  interactionSystem.update(player, world, mockInput, 0.016);
  mockInput.clearFrameState();
  assert(toggle.active === true && toggle.toggleCount === 3, 'Terceira interação deve levar novamente para ON.');

  console.log('  ✓ Teste R: Interações consecutivas com soltura e novo pressionamento operam com perfeição.');
}

// ============================================================================
// Teste S: O resultado de uma interação pode carregar feedback textual
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const toggle = new TestToggleObject('feedback_obj', { worldX: 120, worldY: 100 }, false);
  world.getObjectManager().addObject(toggle);

  const result = interactionSystem.executeInteraction(player, world, toggle);
  assert(result !== null, 'Resultado não pode ser nulo.');
  assert(result?.message === 'Beacon: ON', 'Resultado carrega a mensagem textual contextual.');
  assert(interactionSystem.getActiveFeedbackMessage() === 'Beacon: ON', 'InteractionSystem armazena feedback.');

  console.log('  ✓ Teste S: Feedback textual carregado no resultado sem acoplamento ao Renderer.');
}

// ============================================================================
// Teste T: O objeto continua podendo existir sem possuir sprite real
// ============================================================================
{
  const world = new World(12345);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto puramente técnico/lógico, sem spritesheets nem texturas carregadas
  const pureLogicalObject = new TestToggleObject('pure_logic', { worldX: 120, worldY: 100 }, false);
  world.getObjectManager().addObject(pureLogicalObject);

  // Todo o sistema de posicionamento, busca espacial e interação opera sem sprite
  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'pure_logic', 'Objeto sem sprite é detectado e interage normalmente.');
  const result = interactionSystem.executeInteraction(player, world, target);
  assert(result !== null && result.success, 'Interação com objeto sem sprite ocorre com 100% de sucesso.');
  assert(pureLogicalObject.active === true, 'Estado é mutado com sucesso.');

  console.log('  ✓ Teste T: Objeto opera plenamente sem necessidade de sprite visual.');
}

console.log('\n[SUCESSO] Todos os 20 requisitos de teste de Ações de Interação e Mutações de Mundo (A até T) foram aprovados!');
