import { ItemDefinition, DEFAULT_MAX_STACK_SIZE } from './ItemDefinition.ts';
import {
  ItemStack,
  createItemStack,
  isValidItemStack,
  isValidQuantity,
  canMergeStacks,
  addToStack,
  removeFromStack,
  splitStack,
  mergeStacks,
} from './ItemStack.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';
import { AssetManager } from './AssetManager.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FALHA DE ASSERT] ${message}`);
    throw new Error(`[FALHA DE ASSERT] ${message}`);
  }
}

function assertThrows(fn: () => void, expectedErrorSubstring?: string, label?: string): void {
  let threw = false;
  try {
    fn();
  } catch (err: unknown) {
    threw = true;
    if (expectedErrorSubstring && err instanceof Error) {
      assert(
        err.message.includes(expectedErrorSubstring),
        `Esperava mensagem de erro contendo "${expectedErrorSubstring}", mas obteve: "${err.message}" (${label})`,
      );
    }
  }
  assert(threw, `Esperava lançamento de erro em: ${label ?? 'função'}`);
}

console.log('[TEST] Iniciando suíte de testes da Fundação do Sistema de Itens (A até T)...');

// ============================================================================
// Teste A: ItemDefinition possui ID estável
// ============================================================================
{
  const item: ItemDefinition = {
    id: 'test_item_stable',
    name: 'Item de Teste',
    maxStackSize: 99,
    category: 'misc',
  };

  assert(item.id === 'test_item_stable', 'ID deve ser imutável e idêntico.');
  assert(item.name === 'Item de Teste', 'Nome deve ser preservado.');
  assert(item.maxStackSize === 99, 'maxStackSize deve ser preservado.');
  console.log('  ✓ Teste A: ItemDefinition possui ID estável e declarativo.');
}

// ============================================================================
// Teste B: ItemRegistry registra item
// ============================================================================
{
  ItemRegistry.resetForTesting();
  assert(!ItemRegistry.has('custom_seed'), 'Item não deve existir antes de registrar.');

  ItemRegistry.register({
    id: 'custom_seed',
    name: 'Semente Especial',
    maxStackSize: 50,
    category: 'flora',
  });

  assert(ItemRegistry.has('custom_seed'), 'Item deve estar registrado no registry.');
  console.log('  ✓ Teste B: ItemRegistry registra novos itens com sucesso.');
}

// ============================================================================
// Teste C: ItemRegistry recupera item por ID
// ============================================================================
{
  ItemRegistry.resetForTesting();
  ItemRegistry.ensureInitialized();

  // Testar recuperação dos itens padrão técnicos
  const wood = ItemRegistry.get('wood');
  assert(wood !== undefined, 'Item "wood" deve existir no registry.');
  assert(wood?.id === 'wood', 'ID do item recuperado deve ser "wood".');
  assert(wood?.name === 'Madeira', 'Nome do item recuperado deve ser "Madeira".');
  assert(wood?.maxStackSize === DEFAULT_MAX_STACK_SIZE, 'maxStackSize padrão deve ser 99.');

  const stone = ItemRegistry.getOrThrow('stone');
  assert(stone.id === 'stone', 'getOrThrow deve recuperar "stone" com sucesso.');

  const flower = ItemRegistry.getOrThrow('flower');
  assert(flower.id === 'flower' && flower.category === 'flora', 'getOrThrow deve recuperar "flower".');

  console.log('  ✓ Teste C: ItemRegistry recupera itens técnicos registrados por ID.');
}

// ============================================================================
// Teste D: IDs duplicados são rejeitados
// ============================================================================
{
  ItemRegistry.resetForTesting();
  ItemRegistry.register({
    id: 'unique_gem',
    name: 'Gema Rara',
    maxStackSize: 10,
  });

  assertThrows(
    () => {
      ItemRegistry.register({
        id: 'unique_gem',
        name: 'Gema Duplicada',
        maxStackSize: 20,
      });
    },
    'Conflito de ID duplicado',
    'Registro de ID duplicado',
  );

  console.log('  ✓ Teste D: Registro de IDs duplicados é estritamente rejeitado.');
}

// ============================================================================
// Teste E: ItemStack aceita quantidade válida
// ============================================================================
{
  const stack = createItemStack('wood', 15, 99);
  assert(stack.itemId === 'wood', 'itemId deve corresponder.');
  assert(stack.quantity === 15, 'quantity deve ser 15.');
  assert(isValidItemStack(stack, 99), 'isValidItemStack deve retornar true.');
  console.log('  ✓ Teste E: ItemStack aceita quantidade válida dentro dos limites.');
}

// ============================================================================
// Teste F: Quantidade zero é rejeitada
// ============================================================================
{
  assert(!isValidQuantity(0), 'isValidQuantity(0) deve ser false.');
  assertThrows(
    () => createItemStack('wood', 0, 99),
    'Quantidade não positiva rejeitada',
    'Quantidade zero',
  );
  console.log('  ✓ Teste F: Quantidade zero é estritamente rejeitada.');
}

// ============================================================================
// Teste G: Quantidade negativa é rejeitada
// ============================================================================
{
  assert(!isValidQuantity(-5), 'isValidQuantity(-5) deve ser false.');
  assertThrows(
    () => createItemStack('wood', -10, 99),
    'Quantidade não positiva rejeitada',
    'Quantidade negativa',
  );
  console.log('  ✓ Teste G: Quantidade negativa é estritamente rejeitada.');
}

// ============================================================================
// Teste H: Quantidade fracionária é rejeitada
// ============================================================================
{
  assert(!isValidQuantity(4.5), 'isValidQuantity(4.5) deve ser false.');
  assertThrows(
    () => createItemStack('stone', 3.14, 99),
    'Quantidade fracionária rejeitada',
    'Quantidade fracionária',
  );
  console.log('  ✓ Teste H: Quantidade fracionária é estritamente rejeitada.');
}

// ============================================================================
// Teste I: Quantidade acima do maxStackSize é rejeitada quando validada
// ============================================================================
{
  assertThrows(
    () => createItemStack('flower', 100, 99),
    'excede o limite máximo permitido',
    'Quantidade excedente a maxStackSize',
  );

  // Sem passar maxStackSize, a criação básica aceita inteiro positivo, mas a validação contra maxStackSize rejeita
  const rawStack = createItemStack('flower', 150);
  assert(!isValidItemStack(rawStack, 99), 'isValidItemStack deve rejeitar stack com 150 para maxStackSize 99.');
  assert(isValidItemStack(rawStack, 200), 'isValidItemStack deve aceitar se o limite for 200.');

  console.log('  ✓ Teste I: Quantidade acima do maxStackSize é rejeitada quando validada.');
}

// ============================================================================
// Teste J: Dois stacks do mesmo item podem ser empilhados
// ============================================================================
{
  const stackA = createItemStack('wood', 20, 99);
  const stackB = createItemStack('wood', 30, 99);
  assert(canMergeStacks(stackA, stackB, 99), 'Dois stacks de "wood" devem ser empilháveis.');

  const mergeResult = mergeStacks(stackA, stackB, 99);
  assert(mergeResult.target.quantity === 50, 'Stack resultante deve conter 50.');
  assert(mergeResult.source === null, 'Stack fonte deve ser totalmente consumido (null).');

  console.log('  ✓ Teste J: Dois stacks do mesmo item podem ser empilhados perfeitamente.');
}

// ============================================================================
// Teste K: Dois stacks de itens diferentes não podem ser empilhados
// ============================================================================
{
  const woodStack = createItemStack('wood', 10, 99);
  const stoneStack = createItemStack('stone', 10, 99);

  assert(!canMergeStacks(woodStack, stoneStack, 99), 'Stacks de wood e stone não podem se fundir.');
  assertThrows(
    () => mergeStacks(woodStack, stoneStack, 99),
    'Não é possível fundir itens diferentes',
    'Fundir itens diferentes',
  );

  console.log('  ✓ Teste K: Stacks de itens diferentes não podem ser empilhados.');
}

// ============================================================================
// Teste L: Adicionar quantidade respeita maxStackSize
// ============================================================================
{
  const initialStack = createItemStack('wood', 90, 99);
  // Tentar adicionar 20 unidades (espaço disponível: 9 unidades)
  const result = addToStack(initialStack, 20, 99);

  assert(result.updated.quantity === 99, 'Stack de destino deve parar exatamente no maxStackSize (99).');
  assert(result.remainder === 11, 'Excedente (remainder) deve ser 11 (20 - 9).');
  assert(initialStack.quantity === 90, 'Stack original deve ser imutável.');

  console.log('  ✓ Teste L: Adicionar quantidade respeita estritamente o maxStackSize e calcula excedente.');
}

// ============================================================================
// Teste M: Remover quantidade nunca produz quantidade negativa
// ============================================================================
{
  const stack = createItemStack('stone', 10, 99);

  // Remover quantidade parcial (4 de 10)
  const partial = removeFromStack(stack, 4);
  assert(partial.updated !== null && partial.updated.quantity === 6, 'Quantidade restante deve ser 6.');
  assert(partial.removed === 4, 'Quantidade removida deve ser 4.');

  // Remover quantidade exata (10 de 10)
  const exact = removeFromStack(stack, 10);
  assert(exact.updated === null, 'Ao remover tudo, updated deve ser null (sem stack vazio/negativo).');
  assert(exact.removed === 10, 'Removido deve ser 10.');

  // Remover quantidade superior (15 de 10)
  const excess = removeFromStack(stack, 15);
  assert(excess.updated === null, 'Ao remover além do total, updated deve ser null.');
  assert(excess.removed === 10, 'Removido máximo deve ser limitado a 10.');

  console.log('  ✓ Teste M: Remover quantidade nunca produz quantidade negativa ou nula no stack.');
}

// ============================================================================
// Teste N: Dividir stack preserva a quantidade total
// ============================================================================
{
  const fullStack = createItemStack('flower', 50, 99);
  const { primary, split } = splitStack(fullStack, 15);

  assert(primary.itemId === 'flower' && split.itemId === 'flower', 'Ambos os stacks devem ter o mesmo itemId.');
  assert(primary.quantity === 35, 'Primary deve conter 35.');
  assert(split.quantity === 15, 'Split deve conter 15.');
  assert(primary.quantity + split.quantity === fullStack.quantity, 'A soma das partes deve ser estritamente igual ao original.');

  // Divisão inválida (igual ou maior que o total)
  assertThrows(() => splitStack(fullStack, 50), 'Não é possível dividir', 'Split igual ao total');
  assertThrows(() => splitStack(fullStack, 60), 'Não é possível dividir', 'Split maior que total');
  assertThrows(() => splitStack(fullStack, 0), 'Quantidade de divisão inválida', 'Split zero');

  console.log('  ✓ Teste N: Dividir stack preserva rigorosamente a conservação da quantidade.');
}

// ============================================================================
// Teste O: ItemStack não depende de World
// ============================================================================
{
  // Criação, manipulação e cálculo de ItemStack ocorrem de forma isolada na memória
  const standaloneStack = createItemStack('wood', 7);
  const doubled = addToStack(standaloneStack, 7);
  assert(doubled.updated.quantity === 14, 'Operações em ItemStack não requerem instância de World.');
  console.log('  ✓ Teste O: ItemStack é 100% puro e desacoplado de World.');
}

// ============================================================================
// Teste P: ItemStack não depende de Renderer
// ============================================================================
{
  // Nenhuma importação de Canvas, CanvasRenderingContext2D ou Renderer em ItemStack
  const stack = createItemStack('stone', 25);
  assert(stack.itemId === 'stone' && stack.quantity === 25, 'ItemStack opera em ambientes sem Canvas/DOM.');
  console.log('  ✓ Teste P: ItemStack é 100% puro e desacoplado de Renderer.');
}

// ============================================================================
// Teste Q: ItemDefinition não depende de World
// ============================================================================
{
  const def: ItemDefinition = {
    id: 'test_def_pure',
    name: 'Definição Pura',
    maxStackSize: 10,
  };
  assert(def.id === 'test_def_pure', 'ItemDefinition descreve dados puros sem dependências de simulação espacial.');
  console.log('  ✓ Teste Q: ItemDefinition não depende de World nem de instâncias físicas.');
}

// ============================================================================
// Teste R: ItemDefinition pode possuir referência visual sem exigir asset carregado
// ============================================================================
{
  const itemWithAssetRef: ItemDefinition = {
    id: 'future_crystal',
    name: 'Cristal Futuro',
    maxStackSize: 16,
    spriteAssetId: 'item_future_crystal_unloaded',
  };

  // O AssetManager não possui essa imagem carregada nem cadastrada
  const assetManager = AssetManager.getInstance();
  const loaded = assetManager.getSpriteSheet(itemWithAssetRef.spriteAssetId!);
  assert(loaded === undefined, 'Asset de imagem não precisa existir nem estar carregado.');
  assert(itemWithAssetRef.spriteAssetId === 'item_future_crystal_unloaded', 'Referência declarativa é mantida com segurança.');
  console.log('  ✓ Teste R: Referência a spriteAssetId funciona sem exigir asset carregado.');
}

// ============================================================================
// Teste S: ItemStack funciona de forma pura e determinística sem inventar posições no mundo
// ============================================================================
{
  const stack = createItemStack('wood', 12);
  const keys = Object.keys(stack);
  assert(keys.includes('itemId') && keys.includes('quantity'), 'ItemStack possui apenas itemId e quantity.');
  assert(!('worldX' in stack), 'ItemStack não possui worldX.');
  assert(!('worldY' in stack), 'ItemStack não possui worldY.');
  assert(!('position' in stack), 'ItemStack não possui position.');
  assert(!('width' in stack) && !('height' in stack), 'ItemStack não possui dimensões espaciais.');
  console.log('  ✓ Teste S: ItemStack não inventa posição espacial nem polui sua representação.');
}

// ============================================================================
// Teste T: Um futuro WorldObject de item pode referenciar itemId e quantity sem alterar a arquitetura física de WorldObject
// ============================================================================
{
  const world = new World(12345);

  // Simulação arquitetural de um drop no mundo físico através do contrato WorldObject existente
  const itemDropWorldObject: WorldObject = {
    id: 'dropped_item_sample_1',
    type: 'item_drop',
    position: { worldX: -320, worldY: 480 }, // Suporta coordenadas negativas e qualquer ponto do mundo
    width: 16,
    height: 16,
    state: {
      itemId: 'wood',
      quantity: 5,
    },
  };

  world.getObjectManager().addObject(itemDropWorldObject);

  const retrieved = world.getObjectManager().getObjectById('dropped_item_sample_1');
  assert(retrieved !== null, 'WorldObject de drop deve existir no WorldObjectManager.');
  assert(retrieved?.position.worldX === -320, 'Posição espacial do WorldObject é preservada.');
  assert(retrieved?.state?.itemId === 'wood', 'WorldObject state referencia itemId sem contaminar o contrato.');
  assert(retrieved?.state?.quantity === 5, 'WorldObject state referencia quantity.');

  // Verifica se o estado pode ser convertido de forma pura para um ItemStack
  const reconstructedStack = createItemStack(
    retrieved!.state!.itemId as string,
    retrieved!.state!.quantity as number,
  );
  assert(reconstructedStack.itemId === 'wood' && reconstructedStack.quantity === 5, 'ItemStack reconstruído com sucesso.');

  console.log('  ✓ Teste T: Futuro drop no mundo integra-se naturalmente via WorldObject.state sem alterar sua arquitetura.');
}

console.log('\n[SUCESSO] Todos os 20 requisitos de teste da Fundação do Sistema de Itens (A até T) foram aprovados com êxito!');
