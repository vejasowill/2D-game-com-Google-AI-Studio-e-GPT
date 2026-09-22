import { DEFAULT_ITEM_DROP_TTL } from './constants.ts';

export interface ObjectLifecycleDefinition {
  /** TTL padrão em segundos para instâncias deste tipo de objeto */
  readonly defaultTtl: number;
}

/**
 * Registro declarativo de configurações de ciclo de vida para tipos de objetos do mundo.
 * Evita valores mágicos espalhados e permite que futuros subsistemas registrem novos tipos.
 */
export class LifecycleConfig {
  private static readonly definitions: Map<string, ObjectLifecycleDefinition> = new Map([
    ['item_drop', { defaultTtl: DEFAULT_ITEM_DROP_TTL }],
    ['projectile', { defaultTtl: 5 }],
    ['temporary_effect', { defaultTtl: 3 }],
    ['temporary_corpse', { defaultTtl: 60 }],
  ]);

  /**
   * Obtém o TTL padrão para um tipo de objeto, se configurado.
   */
  public static getDefaultTtl(objectType: string): number | null {
    const def = this.definitions.get(objectType);
    return def ? def.defaultTtl : null;
  }

  /**
   * Registra ou sobrescreve a configuração de ciclo de vida para um tipo de objeto.
   */
  public static registerType(objectType: string, definition: ObjectLifecycleDefinition): void {
    if (!objectType || definition.defaultTtl <= 0) {
      throw new Error(`[LifecycleConfig] Configuração inválida para o tipo '${objectType}'.`);
    }
    this.definitions.set(objectType, { ...definition });
  }

  /**
   * Verifica se o tipo de objeto possui configuração declarativa de ciclo de vida.
   */
  public static hasType(objectType: string): boolean {
    return this.definitions.has(objectType);
  }

  /**
   * Remove a configuração de um tipo (útil para isolamento em testes).
   */
  public static unregisterType(objectType: string): boolean {
    return this.definitions.delete(objectType);
  }
}
