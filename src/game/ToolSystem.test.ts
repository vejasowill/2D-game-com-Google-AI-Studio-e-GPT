import assert from 'node:assert';
import { ToolDefinition } from './ToolDefinition.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { Biome } from './Biome.ts';
import { ToolTarget, ToolExecutionContext, ToolExecutionResult } from './ToolTarget.ts';
import { WorldBounds } from './types.ts';
import { Input } from './Input.ts';

console.log('--- Iniciando Suíte Completa de Testes do ToolSystem (A até V) ---');

// Assegura registros inicializados
ItemRegistry.ensureInitialized();
ToolRegistry.reset();

// =========================================================================
// A. ToolDefinition é declarativa e imutável
// =========================================================================
{
  const tool: ToolDefinition = {
    id: 'test_tool_a',
    itemId: 'test_item_a',
    category: 'axe',
    action: 'chop',
    range: 40,
    cooldown: 0.5,
    actionDuration: 0.2,
    priority: 10,
    requiresTarget: true,
  };

  ToolRegistry.register(tool);
  const retrieved = ToolRegistry.get('test_tool_a');
  assert(retrieved !== undefined, 'A: Ferramenta deve ser registrada');
  assert(Object.isFrozen(retrieved), 'A: Objeto recuperado do registro deve ser imutável (frozen)');

  let threwError = false;
  try {
    // Tentativa de mutação em objeto congelado
    (retrieved as unknown as Record<string, unknown>).range = 999;
  } catch {
    threwError = true;
  }
  // Em strict mode lança erro ou mantém inalterado
  assert(retrieved.range === 40, 'A: Propriedade range não deve ser alterada');
  console.log('✓ Requisito A passou: ToolDefinition é declarativa e imutável');
}

// =========================================================================
// B. ToolRegistry registra ferramentas
// =========================================================================
{
  const customTool: ToolDefinition = {
    id: 'test_tool_b',
    itemId: 'test_item_b',
    category: 'pickaxe',
    action: 'mine',
    range: 32,
    cooldown: 0.3,
    actionDuration: 0.15,
  };

  ToolRegistry.register(customTool);
  assert(ToolRegistry.has('test_tool_b'), 'B: Registro deve confirmar existência por has()');
  assert(ToolRegistry.hasItemId('test_item_b'), 'B: Registro deve confirmar existência por hasItemId()');
  console.log('✓ Requisito B passou: ToolRegistry registra ferramentas');
}

// =========================================================================
// C. IDs duplicados são rejeitados
// =========================================================================
{
  let threwIdDuplicate = false;
  try {
    ToolRegistry.register({
      id: 'test_tool_b', // Já registrado no teste B
      itemId: 'test_item_diff',
      category: 'shovel',
      action: 'dig',
      range: 30,
      cooldown: 0.3,
      actionDuration: 0.2,
    });
  } catch (err) {
    threwIdDuplicate = true;
    assert((err as Error).message.includes('duplicado'), 'C: Erro deve indicar duplicidade de ID');
  }
  assert(threwIdDuplicate, 'C: IDs duplicados devem ser estritamente rejeitados');

  let threwItemIdDuplicate = false;
  try {
    ToolRegistry.register({
      id: 'test_tool_unique',
      itemId: 'test_item_b', // itemId já associado a test_tool_b
      category: 'shovel',
      action: 'dig',
      range: 30,
      cooldown: 0.3,
      actionDuration: 0.2,
    });
  } catch (err) {
    threwItemIdDuplicate = true;
    assert((err as Error).message.includes('duplicado'), 'C: Erro deve indicar duplicidade de itemId');
  }
  assert(threwItemIdDuplicate, 'C: itemIds duplicados devem ser estritamente rejeitados');
  console.log('✓ Requisito C passou: IDs duplicados são rejeitados');
}

// =========================================================================
// D. Ferramenta pode ser recuperada pelo ID
// =========================================================================
{
  const tool = ToolRegistry.get('basic_axe');
  assert(tool !== undefined, 'D: Ferramenta deve ser recuperada por ID');
  assert.strictEqual(tool?.id, 'basic_axe', 'D: ID recuperado deve ser "basic_axe"');
  assert.strictEqual(tool?.category, 'axe', 'D: Categoria deve ser "axe"');
  console.log('✓ Requisito D passou: Ferramenta pode ser recuperada pelo ID');
}

// =========================================================================
// E. Ferramenta pode ser recuperada pelo itemId
// =========================================================================
{
  const tool = ToolRegistry.getByItemId('axe');
  assert(tool !== undefined, 'E: Ferramenta deve ser recuperada pelo itemId "axe"');
  assert.strictEqual(tool?.id, 'basic_axe', 'E: ID associado deve ser "basic_axe"');
  assert.strictEqual(tool?.action, 'chop', 'E: Ação associada deve ser "chop"');
  console.log('✓ Requisito E passou: Ferramenta pode ser recuperada pelo itemId');
}

// =========================================================================
// F. Item comum sem ToolDefinition não pode executar ferramenta
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 50, worldY: 50 });
  const itemUseSystem = new ItemUseSystem();

  // Equipar pedra (não possui ToolDefinition)
  player.inventory.addItemStack(createItemStack('stone', 5));
  player.hotbar.setSelectedSlot(0);

  assert.strictEqual(itemUseSystem.canUseItem(player), false, 'F: Item comum não é utilizável como ferramenta');
  const result = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(result.success, false, 'F: Execução com item comum deve falhar');
  assert.strictEqual(result.code, 'item_not_usable', 'F: Código de falha deve ser "item_not_usable"');
  console.log('✓ Requisito F passou: Item comum sem ToolDefinition não pode executar ferramenta');
}

// =========================================================================
// G. Machado atual é registrado como ToolDefinition
// =========================================================================
{
  const axeTool = ToolRegistry.get('basic_axe');
  assert(axeTool !== undefined, 'G: basic_axe deve estar registrado no ToolRegistry');
  assert.strictEqual(axeTool?.itemId, 'axe', 'G: itemId deve ser "axe"');
  assert.strictEqual(axeTool?.action, 'chop', 'G: action deve ser "chop"');
  assert.strictEqual(axeTool?.range, 36, 'G: range deve ser 36');
  assert.strictEqual(axeTool?.cooldown, 0.4, 'G: cooldown deve ser 0.4');
  console.log('✓ Requisito G passou: Machado atual é registrado como ToolDefinition');
}

// =========================================================================
// H. Machado continua funcionando
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem();

  // Equipar machado
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  // Adicionar árvore logo abaixo do player (na frente)
  const tree = new NaturalTreeObject(
    'tree_test_h',
    { worldX: 100, worldY: 120 },
    24,
    32,
    Biome.FOREST,
    5,
    5,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  const result = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(result.success, true, 'H: Corte de árvore deve suceder');
  assert.strictEqual(result.action, 'chop', 'H: Ação deve ser "chop"');
  assert.strictEqual(result.code, 'tree_chopped', 'H: Código deve ser "tree_chopped"');
  assert.strictEqual(tree.isChopped, true, 'H: Árvore deve estar cortada');

  // Verifica se a madeira foi criada no mundo
  const dropId = `drop:wood:chop:5:5`;
  const dropObj = world.getObjectManager().getObjectById(dropId);
  assert(dropObj !== null, 'H: Drop de madeira deve ser criado');
  console.log('✓ Requisito H passou: Machado continua funcionando');
}

// =========================================================================
// I. ItemUseSystem não depende diretamente de 'axe'
// =========================================================================
{
  // Registra uma ferramenta hipotética e alvo totalmente desacoplados de 'axe'
  ItemRegistry.register({
    id: 'test_laser_tool_item',
    name: 'Laser Tool',
    maxStackSize: 1,
    category: 'tool',
  });

  ToolRegistry.register({
    id: 'test_laser_tool',
    itemId: 'test_laser_tool_item',
    category: 'custom',
    action: 'vaporize',
    range: 50,
    cooldown: 0.2,
    actionDuration: 0.1,
    requiresTarget: true,
  });

  class MockLaserTarget implements ToolTarget {
    public readonly targetType = 'custom';
    public readonly targetId = 'mock_laser_target';
    public readonly targetPosition = { worldX: 200, worldY: 220 };
    public vaporized = false;

    public getTargetBounds(): WorldBounds {
      return { minX: 200, minY: 220, maxX: 220, maxY: 240, width: 20, height: 20 };
    }

    public canReceiveToolAction(tool: ToolDefinition, _ctx?: ToolExecutionContext): boolean {
      return tool.action === 'vaporize' && !this.vaporized;
    }

    public receiveToolAction(tool: ToolDefinition, _ctx?: ToolExecutionContext): ToolExecutionResult {
      this.vaporized = true;
      return {
        success: true,
        action: tool.action,
        code: 'target_vaporized',
        message: 'Alvo vaporizado!',
      };
    }
  }

  const world = new World();
  const player = new Player({ worldX: 200, worldY: 200 });
  const itemUseSystem = new ItemUseSystem();

  player.inventory.addItemStack(createItemStack('test_laser_tool_item', 1));
  player.hotbar.setSelectedSlot(0);

  const mockTarget = new MockLaserTarget();
  // Simula detecção de alvo
  world.getObjectManager().addObject({
    id: mockTarget.targetId,
    type: 'mock',
    position: mockTarget.targetPosition,
    width: 20,
    height: 20,
    getTargetBounds: () => mockTarget.getTargetBounds(),
    canReceiveToolAction: (tool: ToolDefinition, ctx: ToolExecutionContext) => mockTarget.canReceiveToolAction(tool, ctx),
    receiveToolAction: (tool: ToolDefinition, ctx: ToolExecutionContext) => mockTarget.receiveToolAction(tool, ctx),
    targetType: 'custom',
    targetId: mockTarget.targetId,
    targetPosition: mockTarget.targetPosition,
  } as unknown as NaturalTreeObject);

  player.direction = PlayerDirection.DOWN;
  const result = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(result.success, true, 'I: ItemUseSystem deve executar ação genérica "vaporize" sem conhecer o ID');
  assert.strictEqual(result.action, 'vaporize', 'I: Ação deve ser "vaporize"');
  assert.strictEqual(result.code, 'target_vaporized', 'I: Código retornado pelo alvo deve ser preservado');
  console.log('✓ Requisito I passou: ItemUseSystem não depende diretamente de "axe"');
}

// =========================================================================
// J. Ferramentas futuras podem compartilhar o mesmo pipeline
// =========================================================================
{
  ItemRegistry.register({
    id: 'test_pickaxe_item',
    name: 'Picareta de Teste',
    maxStackSize: 1,
    category: 'tool',
  });

  ToolRegistry.register({
    id: 'test_pickaxe',
    itemId: 'test_pickaxe_item',
    category: 'pickaxe',
    action: 'mine',
    range: 36,
    cooldown: 0.35,
    actionDuration: 0.2,
    requiresTarget: true,
  });

  const pickaxeDef = ToolRegistry.getByItemId('test_pickaxe_item');
  assert(pickaxeDef !== undefined, 'J: Picareta deve estar registrada');
  assert.strictEqual(pickaxeDef?.action, 'mine', 'J: Picareta utiliza ação "mine"');
  assert.strictEqual(pickaxeDef?.category, 'pickaxe', 'J: Categoria "pickaxe"');
  console.log('✓ Requisito J passou: Ferramentas futuras compartilham o mesmo pipeline');
}

// =========================================================================
// K. Alcance continua independente do sprite
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem(36, 0.4);

  // Árvore fora de alcance físico (distância ~60px > 36px)
  const farTree = new NaturalTreeObject(
    'far_tree_k',
    { worldX: 100, worldY: 180 },
    24,
    32,
    Biome.FOREST,
    10,
    10,
    0,
  );
  world.getObjectManager().addObject(farTree);

  player.direction = PlayerDirection.DOWN;
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const result = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(result.success, false, 'K: Árvore fora de alcance físico não pode ser atingida');
  assert.strictEqual(result.code, 'no_target', 'K: Deve falhar por ausência de alvo ao alcance');
  console.log('✓ Requisito K passou: Alcance continua independente do sprite');
}

// =========================================================================
// L. Cooldown continua determinístico
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem();

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'tree_cooldown_l',
    { worldX: 100, worldY: 120 },
    24,
    32,
    Biome.FOREST,
    2,
    2,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  const result1 = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(result1.success, true, 'L: Primeiro uso deve ter sucesso');

  // Cooldown deve estar ativo
  assert(itemUseSystem.getRemainingCooldown() > 0, 'L: Cooldown deve estar ativo');
  const result2 = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(result2.success, false, 'L: Segundo uso durante cooldown deve ser rejeitado');
  assert.strictEqual(result2.code, 'cooldown_active', 'L: Código deve ser "cooldown_active"');

  // Avança cooldown manualmente de forma determinística
  itemUseSystem.setCooldown(0);
  assert.strictEqual(itemUseSystem.getRemainingCooldown(), 0, 'L: Cooldown resetado');
  console.log('✓ Requisito L passou: Cooldown continua determinístico');
}

// =========================================================================
// M. PlayerActionState continua correto
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const itemUseSystem = new ItemUseSystem();

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'tree_action_m',
    { worldX: 100, worldY: 120 },
    24,
    32,
    Biome.FOREST,
    3,
    3,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  itemUseSystem.useEquippedItem(player, world);

  const activeAction = player.getActiveAction();
  assert(activeAction !== null, 'M: Player deve possuir ação ativa em andamento');
  assert.strictEqual(activeAction?.action, 'chop', 'M: Ação deve ser "chop"');
  assert.strictEqual(activeAction?.itemId, 'axe', 'M: itemId deve ser "axe"');
  assert.strictEqual(activeAction?.direction, PlayerDirection.DOWN, 'M: Direção gravada na ação');
  assert(activeAction?.duration > 0, 'M: Duração deve ser positiva');
  console.log('✓ Requisito M passou: PlayerActionState continua correto');
}

// =========================================================================
// N. Direção continua travada durante a ação
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  player.direction = PlayerDirection.DOWN;
  player.startAction('chop', 'axe', 0.3);

  assert.strictEqual(player.isActionActive(), true, 'N: Ação deve estar ativa');
  // Durante ação ativa, a direção deve permanecer a mesma
  assert.strictEqual(player.getActiveAction()?.direction, PlayerDirection.DOWN, 'N: Direção da ação é DOWN');
  console.log('✓ Requisito N passou: Direção continua travada durante a ação');
}

// =========================================================================
// O. Resultado de ferramenta é determinístico
// =========================================================================
{
  const world1 = new World();
  const player1 = new Player({ worldX: 100, worldY: 100 });
  const tree1 = new NaturalTreeObject('tree_det_1', { worldX: 100, worldY: 120 }, 24, 32, Biome.FOREST, 4, 4, 0);
  world1.getObjectManager().addObject(tree1);
  player1.direction = PlayerDirection.DOWN;
  player1.inventory.addItemStack(createItemStack('axe', 1));
  player1.hotbar.setSelectedSlot(0);

  const world2 = new World();
  const player2 = new Player({ worldX: 100, worldY: 100 });
  const tree2 = new NaturalTreeObject('tree_det_2', { worldX: 100, worldY: 120 }, 24, 32, Biome.FOREST, 4, 4, 0);
  world2.getObjectManager().addObject(tree2);
  player2.direction = PlayerDirection.DOWN;
  player2.inventory.addItemStack(createItemStack('axe', 1));
  player2.hotbar.setSelectedSlot(0);

  const sys1 = new ItemUseSystem();
  const sys2 = new ItemUseSystem();

  const res1 = sys1.useEquippedItem(player1, world1);
  const res2 = sys2.useEquippedItem(player2, world2);

  assert.strictEqual(res1.success, res2.success, 'O: Sucesso idêntico');
  assert.strictEqual(res1.action, res2.action, 'O: Ação idêntica');
  assert.strictEqual(res1.code, res2.code, 'O: Código idêntico');
  console.log('✓ Requisito O passou: Resultado de ferramenta é determinístico');
}

// =========================================================================
// P. Nenhuma consulta cria/materializa chunks indevidamente
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: 5000, worldY: 5000 }); // Coordenada distante descarregada
  const itemUseSystem = new ItemUseSystem();

  const loadedChunksBefore = world.getLoadedChunkCount();
  // findBestTarget busca apenas no WorldObjectManager já em memória na área
  itemUseSystem.findBestTarget(player, world, 'chop', 40);
  const loadedChunksAfter = world.getLoadedChunkCount();

  assert.strictEqual(loadedChunksAfter, loadedChunksBefore, 'P: Consulta de ferramentas não materializa chunks');
  console.log('✓ Requisito P passou: Nenhuma consulta cria/materializa chunks indevidamente');
}

// =========================================================================
// Q. Coordenadas negativas continuam funcionando
// =========================================================================
{
  const world = new World();
  const player = new Player({ worldX: -200, worldY: -200 });
  const itemUseSystem = new ItemUseSystem();

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  const tree = new NaturalTreeObject(
    'tree_neg_q',
    { worldX: -200, worldY: -180 },
    24,
    32,
    Biome.FOREST,
    -10,
    -10,
    0,
  );
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  const result = itemUseSystem.useEquippedItem(player, world);
  assert.strictEqual(result.success, true, 'Q: Ferramenta funciona em coordenadas negativas');
  assert.strictEqual(tree.isChopped, true, 'Q: Árvore em coordenada negativa foi cortada');
  console.log('✓ Requisito Q passou: Coordenadas negativas continuam funcionando');
}

// =========================================================================
// R. Mobile USE_ITEM continua sendo a mesma ação genérica
// =========================================================================
{
  const input = new Input();
  const itemUseSystem = new ItemUseSystem();
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);

  // Simula pressionar botão virtual touch 'use_item'
  input.triggerActionDown('use_item');

  // Adiciona árvore para corte
  const tree = new NaturalTreeObject('tree_mobile_r', { worldX: 100, worldY: 120 }, 24, 32, Biome.FOREST, 6, 6, 0);
  world.getObjectManager().addObject(tree);
  player.direction = PlayerDirection.DOWN;

  const result = itemUseSystem.update(player, world, input, 0.016);
  assert(result !== null, 'R: update com ação use_item disparada deve executar a ação');
  assert.strictEqual(result?.success, true, 'R: Execução bem-sucedida via ação touch');
  console.log('✓ Requisito R passou: Mobile USE_ITEM continua sendo a mesma ação genérica');
}

// =========================================================================
// S. Hotbar/Equipment continuam sendo a fonte do item equipado
// =========================================================================
{
  const player = new Player({ worldX: 0, worldY: 0 });
  player.inventory.addItemStack(createItemStack('axe', 1));
  player.inventory.addItemStack(createItemStack('wood', 10));

  player.hotbar.setSelectedSlot(0);
  assert.strictEqual(player.getEquippedItem()?.itemId, 'axe', 'S: Slot 0 é o machado');

  player.hotbar.setSelectedSlot(1);
  assert.strictEqual(player.getEquippedItem()?.itemId, 'wood', 'S: Slot 1 é madeira');

  player.hotbar.setSelectedSlot(2);
  assert.strictEqual(player.getEquippedItem(), null, 'S: Slot 2 vazio');
  console.log('✓ Requisito S passou: Hotbar/Equipment continuam sendo a fonte do item equipado');
}

// =========================================================================
// T. Assets visuais continuam opcionais
// =========================================================================
{
  ToolRegistry.register({
    id: 'test_headless_tool',
    itemId: 'test_headless_item',
    category: 'custom',
    action: 'inspect',
    range: 30,
    cooldown: 0.1,
    actionDuration: 0.1,
    // Sem spriteAssetId e sem animationConfig
  });

  const tool = ToolRegistry.get('test_headless_tool');
  assert(tool !== undefined, 'T: Ferramenta sem asset registrada');
  assert.strictEqual(tool?.spriteAssetId, undefined, 'T: spriteAssetId é opcional e ausente');
  assert.strictEqual(tool?.animationConfig, undefined, 'T: animationConfig é opcional e ausente');
  console.log('✓ Requisito T passou: Assets visuais continuam opcionais');
}

// =========================================================================
// U. O fallback visual atual continua funcionando
// =========================================================================
{
  const tool = ToolRegistry.get('basic_axe');
  assert.strictEqual(tool?.spriteAssetId, 'item_axe', 'U: Fallback item_axe preservado');
  console.log('✓ Requisito U passou: O fallback visual atual continua funcionando');
}

// =========================================================================
// V. Nenhuma alteração de física ocorre pela introdução do sistema
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 100 });
  const initialSize = player.size;
  const initialSpeed = player.speed;

  player.inventory.addItemStack(createItemStack('axe', 1));
  player.hotbar.setSelectedSlot(0);
  player.startAction('chop', 'axe', 0.2);

  assert.strictEqual(player.size, initialSize, 'V: Tamanho físico do Player permanece 16px');
  assert.strictEqual(player.speed, initialSpeed, 'V: Velocidade do Player inalterada');
  console.log('✓ Requisito V passou: Nenhuma alteração de física ocorre pela introdução do sistema');
}

console.log('===================================================================');
console.log('TODOS OS 22 TESTES (A até V) DO TOOL SYSTEM PASSARAM COM SUCESSO!');
console.log('===================================================================');
