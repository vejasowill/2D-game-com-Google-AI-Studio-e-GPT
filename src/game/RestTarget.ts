import { Player } from './Player.ts';
import { World } from './World.ts';

/**
 * Modo declarativo de restauração de energia pelo descanso.
 */
export type RestEnergyRestoreMode = 'full' | 'amount' | 'percentage';

/**
 * Definição declarativa e imutável das propriedades de um ponto de descanso.
 */
export interface RestDefinition {
  /** Identificador opcional do tipo de descanso (ex: 'bed', 'camp_rest', 'tent') */
  readonly id?: string;

  /** Rótulo declarativo legível (ex: 'Descansar', 'Dormir') */
  readonly label?: string;

  /** Modo de recuperação de energia: 'full' (padrão), 'amount' (fixo) ou 'percentage' (fração do max) */
  readonly energyRestoreMode?: RestEnergyRestoreMode;

  /** Quantidade ou percentual numérico a ser restaurado quando o modo não for 'full' */
  readonly energyRestoreAmount?: number;

  /** Indica se o descanso avança o relógio até o próximo dia (padrão: true) */
  readonly advanceToNextDay?: boolean;

  /** Horário/offset em segundos a partir do início do próximo dia para despertar (padrão: 0, início do dia) */
  readonly wakeUpTimeOffsetSeconds?: number;

  /** Metadados declarativos customizados */
  readonly customParams?: Readonly<Record<string, unknown>>;
}

/**
 * Contexto imutável fornecido para avaliação e execução do descanso.
 */
export interface RestContext {
  readonly player: Player;
  readonly world: World;
  readonly target?: RestTarget;
  readonly customArgs?: Readonly<Record<string, unknown>>;
}

/**
 * Resultado estruturado retornado pela tentativa de descanso.
 */
export interface RestResult {
  readonly success: boolean;
  readonly code: 'REST_SUCCESS' | 'CONDITIONS_NOT_MET' | 'ALREADY_FULL' | 'INVALID_TARGET' | string;
  readonly message: string;
  readonly previousEnergy: number;
  readonly restoredEnergy: number;
  readonly currentEnergy: number;
  readonly previousDay: number;
  readonly currentDay: number;
  readonly timeAdvancedSeconds: number;
  readonly target?: RestTarget;
}

/**
 * Contrato declarativo e desacoplado que qualquer objeto ou elemento do mundo pode implementar
 * para funcionar como local de descanso (cama, barraca, banco, fogueira, abrigo, etc.).
 *
 * Princípios arquiteturais:
 * 1. Não acoplado a uma classe ou entidade "Bed" concreta;
 * 2. Totalmente independente de Canvas, Renderer, sprites ou DOM;
 * 3. Baseado no TimeSystem como única autoridade de tempo;
 * 4. Suporta avaliação prévia (canRest) e pós-processamento determinístico (onRestComplete).
 */
export interface RestTarget {
  /**
   * Avalia se as condições para descanso são atendidas no contexto atual.
   * Por exemplo: se já está de manhã, se há monstros por perto, etc.
   */
  canRest?(context: RestContext): boolean;

  /**
   * Retorna a definição declarativa de descanso associada a este alvo.
   */
  getRestDefinition?(context?: RestContext): RestDefinition;

  /**
   * Gancho opcional chamado após o descanso ter sido executado com sucesso.
   */
  onRestComplete?(result: RestResult, context: RestContext): void;
}

/**
 * Guarda de tipo para identificar objetos que implementam o contrato RestTarget.
 */
export function isRestTarget(obj: unknown): obj is RestTarget {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  return typeof (obj as RestTarget).getRestDefinition === 'function' ||
    typeof (obj as RestTarget).canRest === 'function';
}
