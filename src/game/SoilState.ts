import { TileType } from './types.ts';
import { World } from './World.ts';

/**
 * Estágios declarativos possíveis do solo cultivável.
 * Preparado para extensões futuras (sementes, rega, adubação) sem quebra de contrato.
 */
export type SoilStage =
  | 'untilled'
  | 'tilled'
  | 'planted'
  | 'watered'
  | 'fertilized'
  | string;

/**
 * Regra declarativa imutável de transição de estado de terreno/solo.
 * Permite que novos tipos de solo e ações sejam adicionados sem bifurcações de código hardcoded.
 */
export interface SoilTransitionRule {
  /** Tipo de terreno de origem permitido (ex: TileType.GRASS) */
  readonly fromTileType: TileType;
  /** Ação abstrata da ferramenta requerida (ex: 'till') */
  readonly requiredAction: string;
  /** Tipo de terreno resultante da transição (ex: TileType.TILLED_SOIL) */
  readonly resultingTileType: TileType;
  /** Estágio de solo correspondente */
  readonly resultingStage: SoilStage;
  /** Mensagem contextual descritiva opcional */
  readonly description?: string;
}

/**
 * Registro central e declarativo para regras de solo e terreno cultivável.
 *
 * Princípios arquiteturais:
 * 1. ZERO verificações hardcoded como `if (tile === GRASS)` espalhadas pelo código;
 * 2. Regras declarativas imutáveis registradas de forma puramente extensível;
 * 3. Permite adicionar terra arável, fertilizante, irrigação etc. futuramente;
 * 4. Operações de restauração puras e consistentes com o TileModificationRegistry (sem entradas fantasmas);
 * 5. Totalmente desacoplado de Canvas, Renderer, animações e física de sprites.
 */
export class SoilRegistry {
  private static readonly transitionRules: Map<string, SoilTransitionRule> = new Map();
  private static isInitialized = false;

  private static getRuleKey(fromTileType: TileType, action: string): string {
    return `${fromTileType}:${action}`;
  }

  /**
   * Inicializa deterministicamente as regras padrão de solo cultivável.
   */
  public static ensureInitialized(): void {
    if (this.isInitialized) {
      return;
    }

    // Regra canônica inicial: GRASS + 'till' -> TILLED_SOIL
    this.registerRule({
      fromTileType: TileType.GRASS,
      requiredAction: 'till',
      resultingTileType: TileType.TILLED_SOIL,
      resultingStage: 'tilled',
      description: 'Prepara a grama natural para cultivo transformando-a em solo arado.',
    });

    this.isInitialized = true;
  }

  /**
   * Registra uma nova regra declarativa de transição de solo.
   * Congela o objeto defensivamente para garantir imutabilidade.
   */
  public static registerRule(rule: SoilTransitionRule): void {
    const key = this.getRuleKey(rule.fromTileType, rule.requiredAction);
    this.transitionRules.set(key, Object.freeze({ ...rule }));
  }

  /**
   * Consulta a regra de transição associada a um tipo de terreno e ação requerida.
   */
  public static getTransition(fromTileType: TileType, action: string): SoilTransitionRule | undefined {
    this.ensureInitialized();
    const key = this.getRuleKey(fromTileType, action);
    return this.transitionRules.get(key);
  }

  /**
   * Verifica deterministicamente se um tipo de terreno aceita uma determinada ação.
   */
  public static canTransition(fromTileType: TileType, action: string): boolean {
    return this.getTransition(fromTileType, action) !== undefined;
  }

  /**
   * Retorna o estágio conceitual atual do solo a partir do tipo de terreno.
   */
  public static getSoilStage(tileType: TileType): SoilStage {
    if (tileType === TileType.TILLED_SOIL) {
      return 'tilled';
    }
    return 'untilled';
  }

  /**
   * Restaura o solo preparado de volta ao seu estado procedural original (ex: TILLED_SOIL -> GRASS).
   * Utiliza a infraestrutura de restauração de modificações do World, garantindo que
   * não restem entradas fantasmas no TileModificationRegistry se o estado restaurado
   * for idêntico ao terreno procedural original.
   */
  public static restoreSoil(world: World, tileX: number, tileY: number): boolean {
    const currentTile = world.getEffectiveTile(tileX, tileY);
    if (!currentTile || currentTile.type !== TileType.TILLED_SOIL) {
      return false;
    }
    return world.restoreTileModification(tileX, tileY);
  }

  /**
   * Limpa as regras customizadas e restaura o estado padrão inicial (útil para testes).
   */
  public static reset(): void {
    this.transitionRules.clear();
    this.isInitialized = false;
    this.ensureInitialized();
  }
}
