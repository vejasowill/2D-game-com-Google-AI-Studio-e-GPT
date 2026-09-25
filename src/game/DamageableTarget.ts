import { DamageDefinition } from './DamageDefinition.ts';
import { HealthState } from './HealthState.ts';
import { HealthSystem } from './HealthSystem.ts';

/**
 * Códigos determinísticos para o resultado da aplicação de dano.
 */
export enum DamageResultCode {
  INVALID_DAMAGE = 'invalid_damage',
  TARGET_DEAD = 'target_dead',
  TARGET_REJECTED = 'target_rejected',
  NO_DAMAGE = 'no_damage',
  DAMAGE_APPLIED = 'damage_applied',
  TARGET_KILLED = 'target_killed',
}

/**
 * Resultado imutável e descritivo da aplicação de dano.
 */
export interface DamageResult {
  readonly success: boolean;
  readonly damageApplied: number;
  readonly remainingHealth: number;
  readonly killed: boolean;
  readonly code: DamageResultCode;
  readonly damage?: DamageDefinition;
  readonly targetId?: string;
}

/**
 * Função utilitária para construção imutável de DamageResult.
 */
export function createDamageResult(
  success: boolean,
  damageApplied: number,
  remainingHealth: number,
  killed: boolean,
  code: DamageResultCode,
  damage?: DamageDefinition,
  targetId?: string,
): DamageResult {
  return Object.freeze({
    success,
    damageApplied,
    remainingHealth,
    killed,
    code,
    damage,
    targetId,
  });
}

/**
 * Contrato genérico e desacoplado para qualquer entidade que possa receber dano.
 * Permite que Player, Criaturas, NPCs, Árvores ou Bosses implementem o mesmo contrato
 * sem o sistema de dano precisar conhecer classes concretas.
 */
export interface DamageableTarget {
  /** Identificador opcional do alvo para fins de diagnóstico e rastreabilidade */
  readonly id?: string;

  /** Verifica se o alvo está vivo */
  isAlive(): boolean;

  /** Verifica se o alvo tem condições de receber determinado dano */
  canReceiveDamage(damage: DamageDefinition): boolean;

  /** Aplica o dano no alvo e retorna o resultado detalhado */
  receiveDamage(damage: DamageDefinition): DamageResult;

  /** Retorna o snapshot atual do estado de vida do alvo */
  getHealth(): HealthState;

  /** Retorna opcionalmente a autoridade do subsistema de vida */
  getHealthSystem?(): HealthSystem;
}
