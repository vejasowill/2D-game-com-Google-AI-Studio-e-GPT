/**
 * Tipos declarativos de dano padronizados para o jogo.
 * Evita strings mágicas espalhadas pelo código.
 */
export enum DamageType {
  PHYSICAL = 'physical',
  ENVIRONMENTAL = 'environmental',
  FIRE = 'fire',
  POISON = 'poison',
  FALL = 'fall',
  MELEE = 'melee',
}

/**
 * Definição imutável e declarativa de dano.
 * Permite que futuras fontes de dano sejam descritas sem acoplamento ou hardcode.
 */
export interface DamageDefinition {
  readonly id: string;
  readonly amount: number;
  readonly type: DamageType | string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Cria uma instância imutável e validada de DamageDefinition.
 *
 * @param config Parâmetros da definição de dano.
 * @throws {Error} Se id for vazio, amount for negativo ou inválido, ou type for indefinido.
 */
export function createDamageDefinition(config: {
  id: string;
  amount: number;
  type?: DamageType | string;
  source?: string;
  metadata?: Record<string, unknown>;
}): DamageDefinition {
  if (!config.id || typeof config.id !== 'string' || config.id.trim() === '') {
    throw new Error('[DamageDefinition] O identificador "id" deve ser uma string não-vazia.');
  }

  if (typeof config.amount !== 'number' || Number.isNaN(config.amount) || config.amount < 0) {
    throw new Error(`[DamageDefinition] Quantidade de dano deve ser um número não-negativo (>= 0). Recebido: ${config.amount}`);
  }

  const type = config.type ?? DamageType.PHYSICAL;
  if (!type || typeof type !== 'string' || type.trim() === '') {
    throw new Error('[DamageDefinition] O tipo de dano "type" deve ser uma string não-vazia.');
  }

  return Object.freeze({
    id: config.id,
    amount: config.amount,
    type,
    source: config.source,
    metadata: config.metadata ? Object.freeze({ ...config.metadata }) : undefined,
  });
}

/**
 * Registro central declarativo para definições padrão e customizadas de dano.
 * Alinhado com ItemRegistry, ToolRegistry e TileRegistry.
 */
export class DamageRegistry {
  private static readonly definitions: Map<string, DamageDefinition> = new Map();

  /**
   * Registra uma nova definição de dano.
   */
  public static register(definition: DamageDefinition): void {
    if (!definition || !definition.id) {
      throw new Error('[DamageRegistry] Definição de dano inválida.');
    }
    DamageRegistry.definitions.set(definition.id, definition);
  }

  /**
   * Retorna a definição de dano pelo seu ID ou undefined se não encontrada.
   */
  public static get(id: string): DamageDefinition | undefined {
    return DamageRegistry.definitions.get(id);
  }

  /**
   * Verifica se determinada definição está registrada.
   */
  public static has(id: string): boolean {
    return DamageRegistry.definitions.has(id);
  }

  /**
   * Retorna todas as definições registradas.
   */
  public static getAll(): readonly DamageDefinition[] {
    return Array.from(DamageRegistry.definitions.values());
  }

  /**
   * Limpa todas as definições registradas (útil para testes isolados).
   */
  public static clear(): void {
    DamageRegistry.definitions.clear();
  }

  /**
   * Inicializa definições canônicas padrão de teste/base.
   */
  public static ensureInitialized(): void {
    if (DamageRegistry.definitions.size === 0) {
      DamageRegistry.register(
        createDamageDefinition({
          id: 'default_physical',
          amount: 10,
          type: DamageType.PHYSICAL,
        }),
      );
      DamageRegistry.register(
        createDamageDefinition({
          id: 'environmental_hazard',
          amount: 5,
          type: DamageType.ENVIRONMENTAL,
        }),
      );
    }
  }
}
