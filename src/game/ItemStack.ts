/**
 * Representação de uma quantidade de determinado item.
 *
 * Princípios arquiteturais:
 * 1. Um ItemStack representa apenas (itemId, quantity).
 * 2. NÃO possui posição no mundo, física, velocidade ou dimensões espaciais.
 * 3. NÃO herda de WorldObject.
 * 4. Imutável por convenção estrutural.
 *
 * Invariantes obrigatórias:
 * - quantity > 0
 * - quantity é um número inteiro estrito (Number.isInteger)
 * - quantity <= maxStackSize (quando validado contra sua ItemDefinition)
 */
export interface ItemStack {
  readonly itemId: string;
  readonly quantity: number;
}

/**
 * Valida se um valor numérico atende às invariantes básicas de quantidade de um ItemStack:
 * número inteiro finito estritamente maior que zero.
 */
export function isValidQuantity(quantity: unknown): quantity is number {
  return typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0;
}

/**
 * Cria uma nova instância imutável de ItemStack garantindo a aplicação de todas as invariantes.
 *
 * @throws {Error} se itemId for inválido, se quantity <= 0, se for fracionário, ou se exceder maxStackSize.
 */
export function createItemStack(
  itemId: string,
  quantity: number,
  maxStackSize?: number,
): ItemStack {
  if (!itemId || typeof itemId !== 'string' || itemId.trim().length === 0) {
    throw new Error(`[ItemStack] itemId inválido: "${itemId}"`);
  }

  if (!Number.isInteger(quantity)) {
    throw new Error(
      `[ItemStack] Quantidade fracionária rejeitada: ${quantity}. A quantidade deve ser um número inteiro.`,
    );
  }

  if (quantity <= 0) {
    throw new Error(
      `[ItemStack] Quantidade não positiva rejeitada: ${quantity}. A quantidade deve ser estritamente maior que zero.`,
    );
  }

  if (maxStackSize !== undefined) {
    if (!Number.isInteger(maxStackSize) || maxStackSize <= 0) {
      throw new Error(`[ItemStack] maxStackSize inválido: ${maxStackSize}`);
    }
    if (quantity > maxStackSize) {
      throw new Error(
        `[ItemStack] Quantidade (${quantity}) excede o limite máximo permitido (${maxStackSize}) para o item "${itemId}".`,
      );
    }
  }

  return Object.freeze({
    itemId: itemId.trim(),
    quantity,
  });
}

/**
 * Verifica se um objeto atende formalmente ao contrato de ItemStack e suas invariantes.
 */
export function isValidItemStack(
  stack: unknown,
  maxStackSize?: number,
): stack is ItemStack {
  if (!stack || typeof stack !== 'object') {
    return false;
  }

  const s = stack as Partial<ItemStack>;
  if (typeof s.itemId !== 'string' || s.itemId.trim().length === 0) {
    return false;
  }

  if (!isValidQuantity(s.quantity)) {
    return false;
  }

  if (maxStackSize !== undefined) {
    if (!Number.isInteger(maxStackSize) || maxStackSize <= 0) {
      return false;
    }
    if (s.quantity > maxStackSize) {
      return false;
    }
  }

  return true;
}

/**
 * Verifica se dois stacks possuem o mesmo itemId e se o stack de destino ainda possui espaço
 * para receber mais unidades (quando maxStackSize é fornecido).
 */
export function canMergeStacks(
  target: ItemStack,
  source: ItemStack,
  maxStackSize?: number,
): boolean {
  if (target.itemId !== source.itemId) {
    return false;
  }

  if (maxStackSize !== undefined) {
    return target.quantity < maxStackSize;
  }

  return true;
}

/**
 * Adiciona uma quantidade a um ItemStack de forma puramente funcional e imutável,
 * respeitando o maxStackSize se fornecido.
 *
 * @returns Um objeto contendo o stack atualizado e a quantidade excedente que não coube (remainder).
 * @throws {Error} Se a quantidade a adicionar não for um inteiro positivo.
 */
export function addToStack(
  target: ItemStack,
  amountToAdd: number,
  maxStackSize?: number,
): { readonly updated: ItemStack; readonly remainder: number } {
  if (!Number.isInteger(amountToAdd) || amountToAdd <= 0) {
    throw new Error(
      `[ItemStack] Quantidade a adicionar inválida: ${amountToAdd}. Deve ser um inteiro > 0.`,
    );
  }

  if (maxStackSize !== undefined) {
    if (!Number.isInteger(maxStackSize) || maxStackSize <= 0) {
      throw new Error(`[ItemStack] maxStackSize inválido: ${maxStackSize}`);
    }

    const availableSpace = Math.max(0, maxStackSize - target.quantity);
    const accepted = Math.min(availableSpace, amountToAdd);
    const remainder = amountToAdd - accepted;

    const newQuantity = target.quantity + accepted;
    return {
      updated: createItemStack(target.itemId, newQuantity, maxStackSize),
      remainder,
    };
  }

  return {
    updated: createItemStack(target.itemId, target.quantity + amountToAdd),
    remainder: 0,
  };
}

/**
 * Remove uma quantidade de um ItemStack de forma puramente funcional e imutável.
 *
 * Invariante: Nunca produz quantidade negativa ou zero. Se a remoção esgotar o stack,
 * retorna updated: null e a quantidade efetivamente removida.
 *
 * @throws {Error} Se amountToRemove não for um número inteiro positivo.
 */
export function removeFromStack(
  target: ItemStack,
  amountToRemove: number,
): { readonly updated: ItemStack | null; readonly removed: number } {
  if (!Number.isInteger(amountToRemove) || amountToRemove <= 0) {
    throw new Error(
      `[ItemStack] Quantidade a remover inválida: ${amountToRemove}. Deve ser um inteiro > 0.`,
    );
  }

  if (amountToRemove >= target.quantity) {
    return {
      updated: null,
      removed: target.quantity,
    };
  }

  const remaining = target.quantity - amountToRemove;
  return {
    updated: createItemStack(target.itemId, remaining),
    removed: amountToRemove,
  };
}

/**
 * Divide um ItemStack em dois novos stacks imutáveis.
 * Preserva estritamente a conservação da quantidade total:
 * primary.quantity + split.quantity === target.quantity.
 *
 * @param target O stack a ser dividido.
 * @param splitAmount A quantidade a ser destacada para o novo stack.
 * @throws {Error} Se splitAmount não for inteiro ou não estiver no intervalo [1, target.quantity - 1].
 */
export function splitStack(
  target: ItemStack,
  splitAmount: number,
): { readonly primary: ItemStack; readonly split: ItemStack } {
  if (!Number.isInteger(splitAmount) || splitAmount <= 0) {
    throw new Error(
      `[ItemStack] Quantidade de divisão inválida: ${splitAmount}. Deve ser um inteiro positivo.`,
    );
  }

  if (splitAmount >= target.quantity) {
    throw new Error(
      `[ItemStack] Não é possível dividir ${splitAmount} de um stack de quantidade ${target.quantity}. O splitAmount deve ser estritamente menor que a quantidade total.`,
    );
  }

  const primaryQuantity = target.quantity - splitAmount;
  return {
    primary: createItemStack(target.itemId, primaryQuantity),
    split: createItemStack(target.itemId, splitAmount),
  };
}

/**
 * Funde dois stacks do mesmo item de forma funcional, preenchendo o destino até maxStackSize.
 *
 * @returns { target: ItemStack; source: ItemStack | null }
 * Se source for totalmente consumido, retorna source: null.
 * Se target e source forem de itens diferentes, lança erro.
 */
export function mergeStacks(
  target: ItemStack,
  source: ItemStack,
  maxStackSize?: number,
): { readonly target: ItemStack; readonly source: ItemStack | null } {
  if (target.itemId !== source.itemId) {
    throw new Error(
      `[ItemStack] Não é possível fundir itens diferentes: "${target.itemId}" e "${source.itemId}".`,
    );
  }

  const addResult = addToStack(target, source.quantity, maxStackSize);

  if (addResult.remainder === 0) {
    return {
      target: addResult.updated,
      source: null,
    };
  }

  return {
    target: addResult.updated,
    source: createItemStack(source.itemId, addResult.remainder, maxStackSize),
  };
}
