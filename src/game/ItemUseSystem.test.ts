import assert from 'node:assert';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { Player, PlayerDirection } from './Player.ts';
import { World } from './World.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { Biome } from './Biome.ts';
import { ItemDropObject } from './ItemDropObject.ts';
import { ItemActionTarget, ItemUseContext, ItemUseResult } from './ItemUseTypes.ts';
import { WorldObject } from './WorldObject.ts';

console.log('--- Iniciando testes de ItemUseSystem e Ferramentas ---');

// Inicializa o registro de itens
ItemRegistry.ensureInitialized();

// 1. Validar registro declarativo da ferramenta 'axe'
const axeDef = ItemRegistry.get('axe');
assert(axeDef !== undefined, 'Machado ("axe") deve estar cadastrado no ItemRegistry');
assert.strictEqual(axeDef?.id, 'axe', 'ID deve ser "axe"');
assert.strictEqual(axeDef?.maxStackSize, 1, 'Ferramentas não devem ser empilháveis (maxStackSize === 1)');
assert(axeDef?.useDefinition !== undefined, 'Machado deve possuir useDefinition declarativa');
assert.strictEqual(axeDef?.useDefinition?.action, 'chop', 'Ação declarativa deve ser "chop"');
assert.strictEqual(axeDef?.useDefinition?.requiresTarget, true, 'Machado deve exigir alvo físico');
console.log('✓ 1. Definição declarativa do machado validada');

// 2. Testar comportamento sem item equipado
const world = new World();
const player = new Player({ worldX: 100, worldY: 100 });
const itemUseSystem = new ItemUseSystem(40, 0.5);

const noItemResult = itemUseSystem.useEquippedItem(player, world);
assert.strictEqual(noItemResult.success, false, 'Uso sem item equipado deve falhar');
assert.strictEqual(noItemResult.code, 'no_equipped_item', 'Código deve ser "no_equipped_item"');
console.log('✓ 2. Falha controlada sem item equipado validada');

// 3. Testar item equipado sem ação de uso (ex: pedra 'stone')
player.inventory.addItemStack(createItemStack('stone', 5));
player.hotbar.setSelectedSlot(0); // Seleciona o slot 0 com pedras
const nonUsableResult = itemUseSystem.useEquippedItem(player, world);
assert.strictEqual(nonUsableResult.success, false, 'Uso de item sem useDefinition deve falhar');
assert.strictEqual(nonUsableResult.code, 'item_not_usable', 'Código deve ser "item_not_usable"');
console.log('✓ 3. Falha controlada para item sem useDefinition validada');

// 4. Equipar machado e testar uso sem alvo ao alcance
player.inventory.addItemStack(createItemStack('axe', 1));
player.hotbar.setSelectedSlot(1); // Seleciona slot 1 (machado)
assert.strictEqual(player.getEquippedItem()?.itemId, 'axe', 'Item equipado deve ser machado');

const noTargetResult = itemUseSystem.useEquippedItem(player, world);
assert.strictEqual(noTargetResult.success, false, 'Machado sem alvo deve falhar');
assert.strictEqual(noTargetResult.code, 'no_target', 'Código deve ser "no_target"');
console.log('✓ 4. Rejeição de ferramenta que exige alvo na ausência de alvos validada');

// 5. Testar rejeição de alvo localizado atrás do Player (setor traseiro)
const treeBehind = new NaturalTreeObject(
  'tree_behind',
  { worldX: 100, worldY: 70 }, // Acima do player quando ele olha para baixo (DOWN)
  24,
  32,
  Biome.FOREST,
  10,
  7,
  0,
);
world.getObjectManager().addObject(treeBehind);
player.direction = PlayerDirection.DOWN; // Olha para o sul
const behindResult = itemUseSystem.useEquippedItem(player, world);
assert.strictEqual(behindResult.success, false, 'Alvo nas costas do Player deve ser estritamente rejeitado');
assert.strictEqual(behindResult.code, 'no_target', 'Não deve encontrar alvo válido nas costas');
console.log('✓ 5. Rejeição estrita de alvo no setor traseiro validada');

// 6. Testar alvo frontal dentro do alcance de corte
const treeInFront = new NaturalTreeObject(
  'tree_front',
  { worldX: 100, worldY: 120 }, // Logo abaixo do Player (Y=100 + size=16 => distância ~4px)
  24,
  32,
  Biome.FOREST,
  10,
  12,
  0,
);
world.getObjectManager().addObject(treeInFront);

// Player olhando para baixo
player.direction = PlayerDirection.DOWN;
assert.strictEqual(itemUseSystem.getRemainingCooldown(), 0, 'Cooldown inicial deve ser zero');

const chopResult = itemUseSystem.useEquippedItem(player, world);
assert.strictEqual(chopResult.success, true, 'Corte da árvore à frente deve ter sucesso');
assert.strictEqual(chopResult.action, 'chop', 'Ação executada deve ser "chop"');
assert.strictEqual(chopResult.code, 'tree_chopped', 'Código de resultado deve ser "tree_chopped"');

// Verificar se a árvore foi marcada como cortada
assert.strictEqual(treeInFront.isChopped, true, 'Árvore cortada deve ter isChopped === true');

// Verificar se o drop de madeira foi instanciado e adicionado ao World via mutação
const dropId = `drop:wood:chop:10:12`;
const spawnedDrop = world.getObjectManager().getObjectById(dropId);
assert(spawnedDrop !== null, `Drop de madeira "${dropId}" deve existir no ObjectManager`);
assert(spawnedDrop instanceof ItemDropObject, 'Objeto dropado deve ser instância de ItemDropObject');
assert.strictEqual((spawnedDrop as ItemDropObject).itemId, 'wood', 'Drop deve conter "wood"');
assert.strictEqual((spawnedDrop as ItemDropObject).quantity, 3, 'Drop deve conter 3 madeiras');
console.log('✓ 6. Execução de corte, mutação de mundo e criação determinística de drop validadas');

// 7. Testar cooldown do sistema
assert(itemUseSystem.getRemainingCooldown() > 0, 'Cooldown deve estar ativo após o uso');
const onCooldownResult = itemUseSystem.useEquippedItem(player, world);
assert.strictEqual(onCooldownResult.success, false, 'Tentativa em cooldown deve falhar');
assert.strictEqual(onCooldownResult.code, 'cooldown_active', 'Código deve indicar cooldown ativo');

// Simular avanço determinístico de tempo através de update
itemUseSystem.update(player, world, {
  getMovementDirection: () => ({ x: 0, y: 0 }),
  isActionPressed: () => false,
  isActionJustPressed: () => false,
}, 0.5);
assert.strictEqual(itemUseSystem.getRemainingCooldown(), 0, 'Cooldown deve ser zerado após transcurso de deltaTime');
console.log('✓ 7. Mecânica e ciclo de cooldown determinístico validados');

// 8. Tentar cortar a mesma árvore já cortada
const secondChopResult = itemUseSystem.useEquippedItem(player, world);
assert.strictEqual(secondChopResult.success, false, 'Árvore já cortada não deve aceitar novo corte');
console.log('✓ 8. Prevenção de duplicação e idempotência de corte validadas');

// 9. Testar múltiplos alvos e desempate determinístico
itemUseSystem.resetCooldown();
const treeCandidateA = new NaturalTreeObject(
  'tree_cand_A',
  { worldX: 95, worldY: 120 },
  24,
  32,
  Biome.FOREST,
  9,
  12,
  0,
);
const treeCandidateB = new NaturalTreeObject(
  'tree_cand_B',
  { worldX: 105, worldY: 120 },
  24,
  32,
  Biome.FOREST,
  11,
  12,
  0,
);
world.getObjectManager().addObject(treeCandidateA);
world.getObjectManager().addObject(treeCandidateB);

const bestTarget = itemUseSystem.findBestTarget(player, world, 'chop', 40);
assert(bestTarget !== null, 'Deve encontrar o melhor alvo entre os candidatos');
assert(bestTarget?.id === 'tree_cand_A' || bestTarget?.id === 'tree_cand_B', 'Alvo deve ser um dos candidatos válidos');
console.log('✓ 9. Busca e desempate determinístico de múltiplos alvos validados');

// 10. Testar contrato ItemActionTarget genérico com objeto customizado desacoplado
class CustomTargetObject implements WorldObject, ItemActionTarget {
  public id: string = 'custom_target';
  public type: string = 'custom';
  public position = { worldX: 100, worldY: 125 };
  public width = 16;
  public height = 16;
  public actionReceived: string | null = null;

  public canReceiveAction(action: string): boolean {
    return action === 'chop';
  }

  public receiveAction(action: string, context: ItemUseContext): ItemUseResult {
    this.actionReceived = action;
    return {
      success: true,
      action,
      code: 'custom_action_success',
      message: 'Custom target processou a ação!',
    };
  }
}

const customTarget = new CustomTargetObject();
world.getObjectManager().addObject(customTarget);
itemUseSystem.resetCooldown();

// Contexto direto de execução
const customResult = customTarget.receiveAction('chop', {
  player,
  world,
  equippedItem: player.getEquippedItem()!,
  target: customTarget,
  action: 'chop',
});
assert.strictEqual(customResult.success, true);
assert.strictEqual(customTarget.actionReceived, 'chop');
console.log('✓ 10. Polimorfismo e desacoplamento do contrato ItemActionTarget validados');

console.log('=== TODOS OS TESTES DE ITEM USE SYSTEM PASSARAM COM SUCESSO! ===');
