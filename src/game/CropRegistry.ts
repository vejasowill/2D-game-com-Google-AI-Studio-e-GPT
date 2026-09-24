import { CropDefinition } from './CropDefinition.ts';

/**
 * Definição canônica inicial de culturas técnicas padrão para bootstrapping e testes.
 * Registra o nabo ('turnip') associado ao seedItemId 'turnip_seed'.
 */
export const DEFAULT_TECHNICAL_CROPS: readonly CropDefinition[] = Object.freeze([
  {
    id: 'turnip',
    name: 'Nabo',
    seedItemId: 'turnip_seed',
    totalStages: 4,
    stageDurations: [10, 10, 10],
    stageDuration: 10,
    yieldQuantity: 1,
    harvestItemId: 'turnip',
    harvestDefinition: {
      cropId: 'turnip',
      harvestItemId: 'turnip',
      harvestQuantity: 1,
      requiresMaturity: true,
      action: 'harvest',
    },
    spriteAssetId: 'crop_turnip',
    stageSpriteAssetIds: [
      'crop_turnip_stage_0',
      'crop_turnip_stage_1',
      'crop_turnip_stage_2',
      'crop_turnip_stage_3',
    ],
    metadata: {
      category: 'vegetable',
    },
  },
]);

/**
 * Registro central, desacoplado e estático de definições de culturas agrícolas (CropRegistry).
 *
 * Responsabilidades:
 * 1. Mapeamento declarativo imutável de id -> CropDefinition e seedItemId -> CropDefinition;
 * 2. Rejeição com erro determinístico de IDs duplicados ou seedItemIds já associados;
 * 3. Recuperação O(1) de culturas por ID ou pelo item de semente correspondente;
 * 4. 100% desacoplado de Renderer, Canvas, DOM ou ciclo de vida de WorldObjects;
 * 5. Inicialização idempotente via ensureInitialized() e suporte a testes isolados via reset() e clear().
 */
export class CropRegistry {
  private static readonly definitions: Map<string, CropDefinition> = new Map();
  private static readonly bySeedItemId: Map<string, CropDefinition> = new Map();
  private static isInitialized = false;

  /**
   * Garante deterministicamente que o registro contenha as culturas canônicas do jogo.
   */
  public static ensureInitialized(): void {
    if (this.isInitialized) {
      return;
    }
    for (const crop of DEFAULT_TECHNICAL_CROPS) {
      if (!this.definitions.has(crop.id)) {
        this.register(crop);
      }
    }
    this.isInitialized = true;
  }

  /**
   * Registra uma nova CropDefinition declarativa.
   *
   * @throws {Error} Se o ID ou seedItemId forem inválidos ou se houver conflito de duplicidade.
   */
  public static register(definition: CropDefinition): void {
    if (!definition || !definition.id || typeof definition.id !== 'string' || definition.id.trim().length === 0) {
      throw new Error('[CropRegistry] Definição de cultura inválida: o "id" é obrigatório e não pode ser vazio.');
    }

    if (!definition.seedItemId || typeof definition.seedItemId !== 'string' || definition.seedItemId.trim().length === 0) {
      throw new Error('[CropRegistry] Definição de cultura inválida: o "seedItemId" é obrigatório e não pode ser vazio.');
    }

    if (typeof definition.totalStages !== 'number' || definition.totalStages <= 1) {
      throw new Error('[CropRegistry] Definição de cultura inválida: "totalStages" deve ser maior que 1.');
    }

    const canonicalId = definition.id.trim();
    const canonicalSeedItemId = definition.seedItemId.trim();

    if (this.definitions.has(canonicalId)) {
      throw new Error(`[CropRegistry] Conflito de ID duplicado: a cultura "${canonicalId}" já está registrada.`);
    }

    if (this.bySeedItemId.has(canonicalSeedItemId)) {
      throw new Error(
        `[CropRegistry] Conflito de semente duplicada: o item de semente "${canonicalSeedItemId}" já está associado a outra cultura.`,
      );
    }

    const frozenDef = Object.freeze({
      ...definition,
      id: canonicalId,
      seedItemId: canonicalSeedItemId,
      stageDurations: Object.freeze([...(definition.stageDurations ?? [])]),
      stageSpriteAssetIds: definition.stageSpriteAssetIds ? Object.freeze([...definition.stageSpriteAssetIds]) : undefined,
    });

    this.definitions.set(canonicalId, frozenDef);
    this.bySeedItemId.set(canonicalSeedItemId, frozenDef);
  }

  /**
   * Recupera a definição da cultura pelo seu ID estável.
   */
  public static get(id: string): CropDefinition | undefined {
    this.ensureInitialized();
    return this.definitions.get(id);
  }

  /**
   * Recupera a definição da cultura pelo seu ID estável ou lança exceção descritiva.
   */
  public static getOrThrow(id: string): CropDefinition {
    this.ensureInitialized();
    const def = this.definitions.get(id);
    if (!def) {
      throw new Error(`[CropRegistry] Cultura não encontrada para o id "${id}".`);
    }
    return def;
  }

  /**
   * Recupera a definição da cultura associada ao itemId da semente.
   */
  public static getBySeedItemId(seedItemId: string): CropDefinition | undefined {
    this.ensureInitialized();
    return this.bySeedItemId.get(seedItemId);
  }

  /**
   * Verifica se uma cultura com o ID especificado está registrada.
   */
  public static has(id: string): boolean {
    this.ensureInitialized();
    return this.definitions.has(id);
  }

  /**
   * Verifica se existe cultura associada ao itemId de semente fornecido.
   */
  public static hasSeedItemId(seedItemId: string): boolean {
    this.ensureInitialized();
    return this.bySeedItemId.has(seedItemId);
  }

  /**
   * Retorna todas as culturas registradas no sistema.
   */
  public static getAll(): readonly CropDefinition[] {
    this.ensureInitialized();
    return Array.from(this.definitions.values());
  }

  /**
   * Limpa todas as definições registradas (útil para testes unitários isolados).
   */
  public static clear(): void {
    this.definitions.clear();
    this.bySeedItemId.clear();
    this.isInitialized = false;
  }

  /**
   * Restaura o registro para o estado inicial com as culturas técnicas padrão.
   */
  public static reset(): void {
    this.clear();
    this.ensureInitialized();
  }
}
