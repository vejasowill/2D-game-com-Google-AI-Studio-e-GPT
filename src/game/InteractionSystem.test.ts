import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { TestInteractableObject } from './TestInteractableObject.ts';
import { Input } from './Input.ts';
import {
  Interactable,
  InteractionContext,
  InteractionResult,
  isInteractable,
} from './InteractionTypes.ts';
import { TILE_SIZE, CHUNK_SIZE } from './constants.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[FALHA DE ASSERT] ${message}`);
  }
}

console.log('[TEST] Iniciando suíte de testes do Sistema Genérico de Interação...');

// ============================================================================
// Teste A: Objeto não interativo é ignorado pelo sistema
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem();
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto convencional do mundo sem contrato de interação (ex: pedra/árvore)
  const inertObject: WorldObject = {
    id: 'inert_rock_1',
    type: 'rock',
    position: { worldX: 128, worldY: 100 },
    width: 24,
    height: 24,
  };

  world.getObjectManager().addObject(inertObject);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target === null, 'Objeto não interativo deve ser completamente ignorado.');
  console.log('  ✓ Teste A: Objeto não interativo é ignorado com sucesso.');
}

// ============================================================================
// Teste B: Objeto interativo dentro do alcance e na direção do Player é encontrado
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem();
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const interactable = new TestInteractableObject(
    'box_b',
    { worldX: 128, worldY: 100 },
    24,
    24,
    'Abrir Caixa',
    0,
  );
  world.getObjectManager().addObject(interactable);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null, 'Objeto interativo ao alcance deve ser selecionado.');
  assert(target?.id === 'box_b', 'O alvo selecionado deve possuir o ID correto.');

  // Executa a interação
  const result = interactionSystem.executeInteraction(player, world, target);
  assert(result !== null && result.success, 'Interação deve ser executada com sucesso.');
  assert(result?.interactionId === 'inspect_box_b', 'ID da interação deve conferir.');
  assert(interactable.interactionCount === 1, 'Contador do objeto deve ser incrementado.');
  console.log('  ✓ Teste B: Objeto interativo dentro do alcance é encontrado e interage com sucesso.');
}

// ============================================================================
// Teste C: Objeto fora do alcance não pode ser encontrado
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto a 120 pixels de distância (alcance é 32)
  const farObject = new TestInteractableObject(
    'far_box',
    { worldX: 220, worldY: 100 },
    24,
    24,
  );
  world.getObjectManager().addObject(farObject);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target === null, 'Objeto fora do alcance não deve ser selecionado.');
  console.log('  ✓ Teste C: Objeto fora do alcance não é encontrado.');
}

// ============================================================================
// Teste D: Objeto atrás do Player não é selecionado quando existe um objeto à frente
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto nas costas do jogador (à esquerda, quando ele olha para a direita)
  const behindObject = new TestInteractableObject(
    'behind_box',
    { worldX: 70, worldY: 100 },
    24,
    24,
  );
  // Objeto à frente do jogador
  const frontObject = new TestInteractableObject(
    'front_box',
    { worldX: 128, worldY: 100 },
    24,
    24,
  );

  world.getObjectManager().addObject(behindObject);
  world.getObjectManager().addObject(frontObject);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null, 'Deve encontrar um alvo válido.');
  assert(target?.id === 'front_box', 'Objeto à frente deve ser escolhido, nunca o de trás.');

  // Teste de exclusividade: se houver APENAS o objeto atrás, não deve selecionar nada
  world.getObjectManager().removeObject('front_box');
  const targetBehindOnly = interactionSystem.findBestTarget(player, world);
  assert(targetBehindOnly === null, 'Objeto nas costas nunca deve ser selecionado mesmo estando próximo.');
  console.log('  ✓ Teste D: Objeto atrás do Player é estritamente rejeitado.');
}

// ============================================================================
// Teste E: Direção do Player (RIGHT) seleciona corretamente objetos à direita
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const rightObj = new TestInteractableObject('right_obj', { worldX: 128, worldY: 100 });
  world.getObjectManager().addObject(rightObj);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'right_obj', 'Deve selecionar o objeto à direita.');
  console.log('  ✓ Teste E: Direção RIGHT seleciona objetos à direita.');
}

// ============================================================================
// Teste F: Direção do Player (LEFT) seleciona corretamente objetos à esquerda
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.LEFT;

  const leftObj = new TestInteractableObject('left_obj', { worldX: 72, worldY: 100 });
  world.getObjectManager().addObject(leftObj);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'left_obj', 'Deve selecionar o objeto à esquerda.');
  console.log('  ✓ Teste F: Direção LEFT seleciona objetos à esquerda.');
}

// ============================================================================
// Teste G: Direção do Player (UP) seleciona corretamente objetos acima
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.UP;

  const upObj = new TestInteractableObject('up_obj', { worldX: 100, worldY: 72 });
  world.getObjectManager().addObject(upObj);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'up_obj', 'Deve selecionar o objeto acima.');
  console.log('  ✓ Teste G: Direção UP seleciona objetos acima.');
}

// ============================================================================
// Teste H: Direção do Player (DOWN) seleciona corretamente objetos abaixo
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.DOWN;

  const downObj = new TestInteractableObject('down_obj', { worldX: 100, worldY: 128 });
  world.getObjectManager().addObject(downObj);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'down_obj', 'Deve selecionar o objeto abaixo.');
  console.log('  ✓ Teste H: Direção DOWN seleciona objetos abaixo.');
}

// ============================================================================
// Teste I: Dois objetos possíveis produzem seleção determinística (por prioridade e distância)
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(48);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto mais próximo (distância 10px), mas prioridade baixa (0)
  const objNearLowPrio = new TestInteractableObject(
    'near_low_prio',
    { worldX: 128, worldY: 100 },
    24,
    24,
    'Comum',
    0,
  );
  // Objeto um pouco mais distante (distância 24px), mas prioridade alta (10)
  const objFarHighPrio = new TestInteractableObject(
    'far_high_prio',
    { worldX: 144, worldY: 100 },
    24,
    24,
    'Importante',
    10,
  );

  world.getObjectManager().addObject(objNearLowPrio);
  world.getObjectManager().addObject(objFarHighPrio);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null, 'Deve selecionar um alvo.');
  assert(
    target?.id === 'far_high_prio',
    'Objeto de maior prioridade declarativa deve ter precedência determinística.',
  );

  // Agora se as prioridades forem iguais, a menor distância deve vencer
  objFarHighPrio.interaction = { ...objFarHighPrio.interaction, priority: 0 };
  const targetByDistance = interactionSystem.findBestTarget(player, world);
  assert(
    targetByDistance !== null && targetByDistance.id === 'near_low_prio',
    'Com prioridades iguais, o objeto mais próximo deve vencer deterministicamente.',
  );

  console.log('  ✓ Teste I: Seleção determinística por prioridade e distância validada.');
}

// ============================================================================
// Teste J: Empates de distância são resolvidos deterministicamente (por ID lexicográfico)
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(48);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Dois objetos na mesma coordenada e mesma prioridade: 'alpha_box' vs 'zebra_box'
  const objZebra = new TestInteractableObject('zebra_box', { worldX: 130, worldY: 100 }, 24, 24, 'Ação', 0);
  const objAlpha = new TestInteractableObject('alpha_box', { worldX: 130, worldY: 100 }, 24, 24, 'Ação', 0);

  // Inserção 1: zebra primeiro
  world.getObjectManager().addObject(objZebra);
  world.getObjectManager().addObject(objAlpha);

  const target1 = interactionSystem.findBestTarget(player, world);
  assert(target1 !== null && target1.id === 'alpha_box', 'Empate deve ser resolvido por ID lexicográfico ("alpha" < "zebra").');

  // Inversão da ordem de inserção em um novo World
  const world2 = new World(42);
  world2.getObjectManager().addObject(objAlpha);
  world2.getObjectManager().addObject(objZebra);

  const target2 = interactionSystem.findBestTarget(player, world2);
  assert(target2 !== null && target2.id === 'alpha_box', 'Ordem de inserção nunca deve alterar o desempate determinístico.');

  console.log('  ✓ Teste J: Empates são estritamente resolvidos de forma determinística.');
}

// ============================================================================
// Teste K: Coordenadas negativas no mundo continuam funcionando
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: -1500, worldY: -2000 });
  player.direction = PlayerDirection.RIGHT;

  const negObj = new TestInteractableObject(
    'neg_coord_box',
    { worldX: -1475, worldY: -2000 },
    24,
    24,
  );
  world.getObjectManager().addObject(negObj);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'neg_coord_box', 'Deve operar perfeitamente em coordenadas negativas profundas.');
  console.log('  ✓ Teste K: Coordenadas negativas profundas funcionam perfeitamente.');
}

// ============================================================================
// Teste L: Objetos em fronteiras de chunks continuam funcionando
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const chunkSizePixels = TILE_SIZE * CHUNK_SIZE; // 512 px

  // Player posicionado a 10px antes da fronteira do chunk (ex: X = 502)
  const player = new Player({ worldX: chunkSizePixels - 10, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto posicionado a 15px depois da fronteira do chunk (no chunk adjacente, X = 527)
  const boundaryObj = new TestInteractableObject(
    'boundary_box',
    { worldX: chunkSizePixels + 15, worldY: 100 },
    24,
    24,
  );
  world.getObjectManager().addObject(boundaryObj);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'boundary_box', 'Deve detectar objeto cruzando fronteira de chunks.');
  console.log('  ✓ Teste L: Detecção através de fronteiras de chunks validada com sucesso.');
}

// ============================================================================
// Teste M: Consultar interação não materializa chunks
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 3000, worldY: 3000 });
  player.direction = PlayerDirection.RIGHT;

  const initialLoadedChunkCount = world.getLoadedChunkCount();

  // Realizar múltiplas consultas de interação
  interactionSystem.findBestTarget(player, world);
  interactionSystem.findBestTarget(player, world);

  const postLoadedChunkCount = world.getLoadedChunkCount();
  assert(
    initialLoadedChunkCount === postLoadedChunkCount,
    'Consultar o InteractionSystem NUNCA deve provocar a geração ou materialização de chunks.',
  );
  console.log('  ✓ Teste M: Consultar interação é estritamente livre de materialização de chunks.');
}

// ============================================================================
// Teste N: Alteração futura de sprite NÃO altera a lógica de interação
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Criar um objeto interativo genérico com metadados puramente lógicos
  class CustomInteractingEntity implements WorldObject, Interactable {
    public id = 'custom_sprite_entity';
    public type = 'custom_npc';
    public position = { worldX: 128, worldY: 100 };
    public width = 24;
    public height = 24;
    public spriteId = 'sprite_version_1'; // Atributo puramente visual
    public interaction = {
      id: 'talk',
      label: 'Conversar',
    };
    public interact(): InteractionResult {
      return { success: true, interactionId: 'talk' };
    }
  }

  const entity = new CustomInteractingEntity();
  world.getObjectManager().addObject(entity);

  const target1 = interactionSystem.findBestTarget(player, world);
  assert(target1 !== null && target1.id === 'custom_sprite_entity', 'Alvo deve ser selecionado.');

  // Alterar o sprite ou visual completamente
  entity.spriteId = 'sprite_version_99_hd_pixel_art';
  const target2 = interactionSystem.findBestTarget(player, world);
  assert(
    target2 !== null && target2.id === 'custom_sprite_entity',
    'Alterações de sprites ou arte visual não afetam o contrato lógico de interação.',
  );
  console.log('  ✓ Teste N: Independência total entre lógica de interação e representação de sprites.');
}

// ============================================================================
// Teste O: Alteração de tamanho visual (ex.: 32x64) NÃO altera detecção física se hitbox/range forem preservados
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Objeto com limites de interação explícitos desacoplados de dimensões visuais ampliadas (32x64)
  const tallEntity = new TestInteractableObject(
    'tall_entity',
    { worldX: 128, worldY: 100 },
    32,
    64, // Dimensão física/visual ampliada
    'Inspecionar',
    0,
    32,
    { offsetX: 4, offsetY: 40, width: 24, height: 24 }, // Hitbox de interação na base
  );
  world.getObjectManager().addObject(tallEntity);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'tall_entity', 'Objeto com hitbox de interação desacoplada deve ser encontrado.');
  console.log('  ✓ Teste O: Desacoplamento entre geometria de interação e dimensões de sprite confirmado.');
}

// ============================================================================
// Teste P: O input de interação discreto NÃO dispara repetidamente caso a tecla permaneça pressionada
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const testTarget = new TestInteractableObject('test_p', { worldX: 128, worldY: 100 });
  world.getObjectManager().addObject(testTarget);

  const input = new Input();

  // Simular evento keydown inicial da tecla E
  input.triggerKeyDown('KeyE');

  // Frame 1: Tecla acabou de ser pressionada
  assert(input.isActionJustPressed('interact') === true, 'Deve ser justPressed no frame inicial.');
  const resultFrame1 = interactionSystem.update(player, world, input);
  assert(resultFrame1 !== null && resultFrame1.success, 'Frame 1 deve disparar interação.');
  assert(testTarget.interactionCount === 1, 'Contador deve ser 1.');

  // Limpar frame state como o GameLoop faz ao término de cada frame
  input.clearFrameState();

  // Frame 2: Tecla PERMANECE pressionada (held)
  assert(input.isActionPressed('interact') === true, 'Ação continua pressionada (held).');
  assert(input.isActionJustPressed('interact') === false, 'Ação NÃO deve ser justPressed no frame subsequente.');

  const resultFrame2 = interactionSystem.update(player, world, input);
  assert(resultFrame2 === null, 'Frame 2 NÃO deve disparar interação repetida.');
  assert(testTarget.interactionCount === 1, 'Contador de interações deve permanecer estritamente em 1.');

  // Frame 3: Usuário solta a tecla e aperta novamente
  input.triggerKeyUp('KeyE');
  input.triggerKeyDown('KeyE');
  assert(input.isActionJustPressed('interact') === true, 'Nova pressão discreta deve ser detectada.');
  const resultFrame3 = interactionSystem.update(player, world, input);
  assert(resultFrame3 !== null, 'Nova pressão discreta deve disparar a interação.');
  assert(testTarget.interactionCount === 2, 'Contador deve avançar para 2.');

  input.destroy();
  console.log('  ✓ Teste P: Ação discreta não repete enquanto a tecla permanece segurada.');
}

// ============================================================================
// Teste Q: Objetos comuns continuam não quebrando e podem coexistir com objetos interativos
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(40);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  // Vários objetos naturais convencionais ao redor
  world.getObjectManager().addObject({ id: 'tree_1', type: 'tree', position: { worldX: 100, worldY: 80 }, width: 32, height: 32 });
  world.getObjectManager().addObject({ id: 'rock_1', type: 'rock', position: { worldX: 120, worldY: 100 }, width: 24, height: 24 });
  world.getObjectManager().addObject({ id: 'flower_1', type: 'wildflower', position: { worldX: 120, worldY: 110 }, width: 16, height: 16 });

  // Objeto interativo junto a eles
  const interactable = new TestInteractableObject('chest_q', { worldX: 130, worldY: 100 });
  world.getObjectManager().addObject(interactable);

  const target = interactionSystem.findBestTarget(player, world);
  assert(target !== null && target.id === 'chest_q', 'Deve coexistir e selecionar o objeto interativo ignorando os inertes.');
  console.log('  ✓ Teste Q: Coexistência harmoniosa com objetos estáticos do mundo validada.');
}

// ============================================================================
// Teste R: WorldObjectManager permanece consistente após adicionar e remover objetos interativos
// ============================================================================
{
  const world = new World(42);
  const objManager = world.getObjectManager();
  const initialCount = objManager.getAllObjects().length;

  const testObj1 = new TestInteractableObject('r_1', { worldX: 100, worldY: 100 });
  const testObj2 = new TestInteractableObject('r_2', { worldX: 150, worldY: 100 });

  objManager.addObject(testObj1);
  objManager.addObject(testObj2);
  assert(objManager.getAllObjects().length === initialCount + 2, 'Contagem deve aumentar em 2.');

  const removed = objManager.removeObject('r_1');
  assert(removed === true, 'Remoção de r_1 deve ser bem-sucedida.');
  assert(objManager.getObjectById('r_1') === null, 'r_1 não deve mais existir no manager.');
  assert(objManager.getObjectById('r_2') !== null, 'r_2 deve continuar existindo no manager.');
  assert(objManager.getAllObjects().length === initialCount + 1, 'Contagem deve ser consistente.');

  objManager.removeObject('r_2');
  assert(objManager.getAllObjects().length === initialCount, 'Contagem final deve retornar ao valor inicial.');
  console.log('  ✓ Teste R: Consistência do WorldObjectManager preservada.');
}

// ============================================================================
// Teste S: Remoção de objeto interativo do mundo remove-o da seleção de interação
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const removableObj = new TestInteractableObject('removable_box', { worldX: 128, worldY: 100 });
  world.getObjectManager().addObject(removableObj);

  // Antes da remoção: alvo selecionado
  const targetBefore = interactionSystem.findBestTarget(player, world);
  assert(targetBefore !== null && targetBefore.id === 'removable_box', 'Alvo presente antes da remoção.');

  // Remoção do mundo
  world.getObjectManager().removeObject('removable_box');

  // Depois da remoção: nenhum alvo
  const targetAfter = interactionSystem.findBestTarget(player, world);
  assert(targetAfter === null, 'Objeto removido não pode mais ser alvo de interação.');
  console.log('  ✓ Teste S: Remoção do alvo atualiza imediatamente o sistema de interação.');
}

// ============================================================================
// Teste T: Mover o objeto interativo atualiza sua seleção
// ============================================================================
{
  const world = new World(42);
  const interactionSystem = new InteractionSystem(32);
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.RIGHT;

  const movableObj = new TestInteractableObject('movable_box', { worldX: 300, worldY: 100 });
  world.getObjectManager().addObject(movableObj);

  // Inicialmente fora do alcance
  const targetInitial = interactionSystem.findBestTarget(player, world);
  assert(targetInitial === null, 'Inicialmente distante demais para interagir.');

  // Mover para dentro do alcance à frente do jogador
  world.getObjectManager().updateObjectPosition('movable_box', { worldX: 128, worldY: 100 });

  const targetMovedIn = interactionSystem.findBestTarget(player, world);
  assert(targetMovedIn !== null && targetMovedIn.id === 'movable_box', 'Após ser movido para dentro do alcance, deve ser selecionado.');

  // Mover para as costas do jogador (à esquerda)
  world.getObjectManager().updateObjectPosition('movable_box', { worldX: 70, worldY: 100 });
  const targetMovedBehind = interactionSystem.findBestTarget(player, world);
  assert(targetMovedBehind === null, 'Após ser movido para as costas, deve perder a seleção.');

  console.log('  ✓ Teste T: Movimentação dinâmica de objetos interativos atualiza a seleção instantaneamente.');
}

console.log('\n[SUCESSO] Todos os 20 requisitos de teste do Sistema de Interação (A até T) foram aprovados com 100% de sucesso!');
