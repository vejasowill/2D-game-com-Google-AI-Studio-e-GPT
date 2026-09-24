import { ToolDefinition } from './ToolDefinition.ts';
import {
  DEFAULT_AXE_ENERGY_COST,
  DEFAULT_HOE_ENERGY_COST,
  DEFAULT_WATERING_CAN_ENERGY_COST,
} from './constants.ts';

/**
 * Definições técnicas canônicas padrão de ferramentas para bootstrapping inicial.
 * Registra o machado atual ('basic_axe' associado ao itemId 'axe').
 */
export const DEFAULT_TECHNICAL_TOOLS: readonly ToolDefinition[] = Object.freeze([
  {
    id: 'basic_axe',
    itemId: 'axe',
    category: 'axe',
    action: 'chop',
    targetDomain: 'object',
    range: 36,
    cooldown: 0.4,
    actionDuration: 0.2,
    priority: 100,
    requiresTarget: true,
    energyCost: DEFAULT_AXE_ENERGY_COST,
    spriteAssetId: 'item_axe',
  },
  {
    id: 'basic_hoe',
    itemId: 'hoe',
    category: 'hoe',
    action: 'till',
    targetDomain: 'tile',
    range: 48,
    cooldown: 0.35,
    actionDuration: 0.2,
    priority: 100,
    requiresTarget: true,
    energyCost: DEFAULT_HOE_ENERGY_COST,
    spriteAssetId: 'item_hoe',
  },
  {
    id: 'basic_watering_can',
    itemId: 'watering_can',
    category: 'watering_can',
    action: 'water',
    targetDomain: 'tile',
    range: 48,
    cooldown: 0.35,
    actionDuration: 0.2,
    priority: 100,
    requiresTarget: true,
    energyCost: DEFAULT_WATERING_CAN_ENERGY_COST,
    spriteAssetId: 'item_watering_can',
  },
]);

/**
 * Registro central e estático para definições declarativas de ferramentas.
 *
 * Responsabilidades:
 * 1. Manter o mapeamento imutável de toolId -> ToolDefinition e itemId -> ToolDefinition;
 * 2. Impedir registro duplicado de IDs com exceção determinística;
 * 3. Impedir mapeamento ambíguo de múltiplos registros para o mesmo itemId;
 * 4. Recuperação O(1) de ferramentas por ID ou por itemId;
 * 5. 100% desacoplado de Renderer, Canvas, sprites ou elementos visuais do DOM;
 * 6. Suporte completo a testes isolados via reset() e clear().
 */
export class ToolRegistry {
  private static readonly definitions: Map<string, ToolDefinition> = new Map();
  private static readonly byItemId: Map<string, ToolDefinition> = new Map();
  private static isInitialized = false;

  /**
   * Garante a inicialização determinística das ferramentas técnicas padrão do jogo.
   */
  public static ensureInitialized(): void {
    if (this.isInitialized) {
      return;
    }
    for (const tool of DEFAULT_TECHNICAL_TOOLS) {
      if (!this.definitions.has(tool.id)) {
        this.register(tool);
      }
    }
    this.isInitialized = true;
  }

  /**
   * Registra uma nova ToolDefinition declarativa.
   *
   * @throws {Error} Se o ID ou itemId forem inválidos ou se houver conflito de duplicidade.
   */
  public static register(definition: ToolDefinition): void {
    if (!definition || !definition.id || typeof definition.id !== 'string' || definition.id.trim().length === 0) {
      throw new Error('[ToolRegistry] Definição de ferramenta inválida: o "id" é obrigatório e não pode ser vazio.');
    }

    if (!definition.itemId || typeof definition.itemId !== 'string' || definition.itemId.trim().length === 0) {
      throw new Error('[ToolRegistry] Definição de ferramenta inválida: o "itemId" é obrigatório e não pode ser vazio.');
    }

    if (!definition.action || typeof definition.action !== 'string' || definition.action.trim().length === 0) {
      throw new Error('[ToolRegistry] Definição de ferramenta inválida: a "action" é obrigatória e não pode ser vazia.');
    }

    if (!definition.category || typeof definition.category !== 'string' || definition.category.trim().length === 0) {
      throw new Error('[ToolRegistry] Definição de ferramenta inválida: a "category" é obrigatória.');
    }

    const canonicalId = definition.id.trim();
    const canonicalItemId = definition.itemId.trim();

    if (this.definitions.has(canonicalId)) {
      throw new Error(`[ToolRegistry] Conflito de ID duplicado: a ferramenta "${canonicalId}" já está registrada.`);
    }

    if (this.byItemId.has(canonicalItemId)) {
      throw new Error(`[ToolRegistry] Conflito de itemId duplicado: o item "${canonicalItemId}" já está associado a outra ferramenta.`);
    }

    const frozenDef = Object.freeze({ ...definition, id: canonicalId, itemId: canonicalItemId });
    this.definitions.set(canonicalId, frozenDef);
    this.byItemId.set(canonicalItemId, frozenDef);
  }

  /**
   * Recupera a definição da ferramenta pelo seu ID canônico.
   */
  public static get(id: string): ToolDefinition | undefined {
    this.ensureInitialized();
    return this.definitions.get(id);
  }

  /**
   * Recupera a definição da ferramenta pelo seu ID canônico ou lança exceção descritiva.
   */
  public static getOrThrow(id: string): ToolDefinition {
    const tool = this.get(id);
    if (!tool) {
      throw new Error(`[ToolRegistry] Ferramenta "${id}" não encontrada no registro.`);
    }
    return tool;
  }

  /**
   * Recupera a definição da ferramenta associada ao itemId do inventário.
   */
  public static getByItemId(itemId: string): ToolDefinition | undefined {
    this.ensureInitialized();
    return this.byItemId.get(itemId);
  }

  /**
   * Verifica se uma ferramenta com o ID especificado está registrada.
   */
  public static has(id: string): boolean {
    this.ensureInitialized();
    return this.definitions.has(id);
  }

  /**
   * Verifica se existe ferramenta associada ao itemId especificado.
   */
  public static hasItemId(itemId: string): boolean {
    this.ensureInitialized();
    return this.byItemId.has(itemId);
  }

  /**
   * Retorna todas as ferramentas registradas no sistema.
   */
  public static getAll(): readonly ToolDefinition[] {
    this.ensureInitialized();
    return Array.from(this.definitions.values());
  }

  /**
   * Remove uma ferramenta do registro (útil para testes unitários).
   */
  public static unregister(id: string): boolean {
    const existing = this.definitions.get(id);
    if (!existing) {
      return false;
    }
    this.definitions.delete(id);
    this.byItemId.delete(existing.itemId);
    return true;
  }

  /**
   * Limpa integralmente todos os registros (útil para testes de isolamento).
   */
  public static clear(): void {
    this.definitions.clear();
    this.byItemId.clear();
    this.isInitialized = false;
  }

  /**
   * Reseta o registro para o estado padrão inicial determinístico.
   */
  public static reset(): void {
    this.clear();
    this.ensureInitialized();
  }
}
