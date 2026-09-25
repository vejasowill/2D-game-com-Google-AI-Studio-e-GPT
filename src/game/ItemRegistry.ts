import { DEFAULT_MAX_STACK_SIZE, ItemDefinition } from './ItemDefinition.ts';
import {
  DEFAULT_AXE_ENERGY_COST,
  DEFAULT_HOE_ENERGY_COST,
  DEFAULT_WATERING_CAN_ENERGY_COST,
} from './constants.ts';

/**
 * Definições técnicas padrão de itens para teste e bootstrapping inicial.
 */
export const DEFAULT_TECHNICAL_ITEMS: readonly ItemDefinition[] = Object.freeze([
  {
    id: 'wood',
    name: 'Madeira',
    maxStackSize: DEFAULT_MAX_STACK_SIZE,
    category: 'material',
    spriteAssetId: 'item_wood',
    description: 'Pedaço de madeira bruta para construção e utilidades.',
    icon: { kind: 'wood' },
  },
  {
    id: 'stone',
    name: 'Pedra',
    maxStackSize: DEFAULT_MAX_STACK_SIZE,
    category: 'material',
    spriteAssetId: 'item_stone',
    description: 'Fragmento rochoso resistente.',
    icon: { kind: 'stone' },
  },
  {
    id: 'flower',
    name: 'Flor Silvestre',
    maxStackSize: DEFAULT_MAX_STACK_SIZE,
    category: 'flora',
    spriteAssetId: 'item_flower',
    description: 'Pequena flor do campo aromática e decorativa.',
    icon: { kind: 'flower' },
  },
  {
    id: 'axe',
    name: 'Machado',
    maxStackSize: 1,
    category: 'tool',
    spriteAssetId: 'item_axe',
    description: 'Ferramenta de corte para obter madeira de árvores.',
    icon: { kind: 'axe' },
    useDefinition: {
      action: 'chop',
      range: 36,
      cooldown: 0.4,
      requiresTarget: true,
      energyCost: DEFAULT_AXE_ENERGY_COST,
    },
  },
  {
    id: 'hoe',
    name: 'Enxada',
    maxStackSize: 1,
    category: 'tool',
    spriteAssetId: 'item_hoe',
    description: 'Ferramenta para cultivar e preparar o solo para plantio.',
    icon: { kind: 'hoe' },
    useDefinition: {
      action: 'till',
      range: 48,
      cooldown: 0.35,
      requiresTarget: true,
      energyCost: DEFAULT_HOE_ENERGY_COST,
    },
  },
  {
    id: 'watering_can',
    name: 'Regador',
    maxStackSize: 1,
    category: 'watering_can',
    spriteAssetId: 'item_watering_can',
    description: 'Ferramenta para irrigar e regar culturas agrícolas plantadas.',
    icon: { kind: 'watering_can' },
    useDefinition: {
      action: 'water',
      range: 48,
      cooldown: 0.35,
      requiresTarget: true,
      targetDomain: 'tile',
      consumesItem: false,
      energyCost: DEFAULT_WATERING_CAN_ENERGY_COST,
    },
  },
  {
    id: 'turnip_seed',
    name: 'Semente de Nabo',
    maxStackSize: DEFAULT_MAX_STACK_SIZE,
    category: 'seed',
    spriteAssetId: 'item_turnip_seed',
    description: 'Semente para plantio de nabos em solo arado (tilled soil).',
    icon: { kind: 'seed' },
    useDefinition: {
      action: 'plant',
      range: 48,
      cooldown: 0.3,
      requiresTarget: true,
      targetDomain: 'tile',
      consumesItem: true,
      consumeQuantity: 1,
    },
  },
  {
    id: 'turnip',
    name: 'Nabo',
    maxStackSize: DEFAULT_MAX_STACK_SIZE,
    category: 'flora',
    spriteAssetId: 'item_turnip',
    description: 'Um nabo fresco cultivado.',
    icon: { kind: 'turnip' },
  },
]);

/**
 * Registro central e estático para definições declarativas de itens.
 *
 * Responsabilidades:
 * 1. Manter o mapeamento imutável de id -> ItemDefinition.
 * 2. Impedir registro duplicado de IDs com erro determinístico.
 * 3. Servir como fonte única de verdade para consultas de propriedades de itens
 *    (sem duplicações espalhadas por outros módulos).
 */
export class ItemRegistry {
  private static readonly definitions: Map<string, ItemDefinition> = new Map();
  private static isInitialized = false;

  /**
   * Garante que os itens técnicos padrão estejam registrados.
   */
  public static ensureInitialized(): void {
    if (this.isInitialized) {
      return;
    }
    for (const item of DEFAULT_TECHNICAL_ITEMS) {
      if (!this.definitions.has(item.id)) {
        this.register(item);
      }
    }
    this.isInitialized = true;
  }

  /**
   * Registra uma nova ItemDefinition no registro.
   *
   * @throws {Error} Se o ID for inválido, duplicado, ou se maxStackSize for menor ou igual a zero.
   */
  public static register(definition: ItemDefinition): void {
    if (!definition || !definition.id || typeof definition.id !== 'string' || definition.id.trim().length === 0) {
      throw new Error('[ItemRegistry] Definição de item inválida: o "id" é obrigatório e não pode ser vazio.');
    }

    const canonicalId = definition.id.trim();

    if (this.definitions.has(canonicalId)) {
      throw new Error(`[ItemRegistry] Conflito de ID duplicado: o item "${canonicalId}" já está registrado.`);
    }

    if (!Number.isInteger(definition.maxStackSize) || definition.maxStackSize <= 0) {
      throw new Error(
        `[ItemRegistry] Item "${canonicalId}" possui maxStackSize inválido: ${definition.maxStackSize}. Deve ser um inteiro > 0.`,
      );
    }

    // Congela a definição para garantir imutabilidade estrita
    this.definitions.set(canonicalId, Object.freeze({ ...definition, id: canonicalId }));
  }

  /**
   * Obtém a ItemDefinition correspondente ao ID informado, ou undefined caso não exista.
   */
  public static get(id: string): ItemDefinition | undefined {
    this.ensureInitialized();
    return this.definitions.get(id.trim());
  }

  /**
   * Obtém a ItemDefinition correspondente ao ID informado ou lança erro se não estiver registrado.
   *
   * @throws {Error} Se o item com o ID informado não estiver cadastrado.
   */
  public static getOrThrow(id: string): ItemDefinition {
    this.ensureInitialized();
    const item = this.definitions.get(id.trim());
    if (!item) {
      throw new Error(`[ItemRegistry] Item não encontrado para o ID: "${id}"`);
    }
    return item;
  }

  /**
   * Verifica se determinado ID de item está registrado.
   */
  public static has(id: string): boolean {
    this.ensureInitialized();
    return this.definitions.has(id.trim());
  }

  /**
   * Retorna todas as definições de itens registradas como lista imutável.
   */
  public static getAll(): readonly ItemDefinition[] {
    this.ensureInitialized();
    return Array.from(this.definitions.values());
  }

  /**
   * Limpa todos os itens registrados e redefine o estado de inicialização.
   * Utilizado principalmente para isolamento em testes unitários.
   */
  public static resetForTesting(): void {
    this.definitions.clear();
    this.isInitialized = false;
  }

  /**
   * Alias de conveniência para resetForTesting.
   */
  public static clear(): void {
    this.resetForTesting();
  }
}
