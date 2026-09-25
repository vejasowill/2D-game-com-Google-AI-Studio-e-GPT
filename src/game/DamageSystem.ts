import { DamageDefinition } from './DamageDefinition.ts';
import {
  DamageResult,
  DamageResultCode,
  DamageableTarget,
  createDamageResult,
} from './DamageableTarget.ts';

/**
 * Ouvinte desacoplado para notificações globais de aplicação de dano.
 */
export type DamageEventListener = (result: DamageResult, target: DamageableTarget) => void;

/**
 * Pipeline central e desacoplado para aplicação de dano a DamageableTargets.
 *
 * Princípios arquiteturais:
 * 1. Opera estritamente por contratos (DamageableTarget);
 * 2. Zero referências a Player, Criaturas, NPCs, ferramentas ou objetos específicos;
 * 3. Atomicidade estrita: validação completa antes de qualquer mutação;
 * 4. Disparo de eventos somente após validação e sucesso;
 * 5. Determinismo puro, sem Math.random, sem dependência de Canvas ou Renderer.
 */
export class DamageSystem {
  private readonly listeners: Set<DamageEventListener> = new Set();

  /**
   * Inscreve um ouvinte para eventos de dano aplicados pelo pipeline.
   * Retorna uma função de cancelamento da inscrição.
   */
  public subscribe(listener: DamageEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Executa o pipeline de aplicação atômica de dano em um alvo.
   *
   * Fluxo determinístico:
   * 1. Valida DamageDefinition (rejeita amount negativo, NaN, ausência de ID);
   * 2. Valida existência do alvo;
   * 3. Verifica se o alvo está vivo (alvo morto rejeita dano);
   * 4. Consulta target.canReceiveDamage(damage);
   * 5. Se dano for 0, retorna resultado no_damage sem mutação;
   * 6. Executa a alteração atômica através de target.receiveDamage(damage);
   * 7. Notifica ouvintes se o dano foi aplicado com sucesso.
   *
   * @param target Alvo que implementa o contrato DamageableTarget.
   * @param damage Definição declarativa do dano.
   */
  public applyDamage(target: DamageableTarget, damage: DamageDefinition): DamageResult {
    // 1. Validação estrita de DamageDefinition
    if (
      !damage ||
      typeof damage.id !== 'string' ||
      damage.id.trim() === '' ||
      typeof damage.amount !== 'number' ||
      Number.isNaN(damage.amount) ||
      damage.amount < 0
    ) {
      const remainingHealth = target ? target.getHealth().current : 0;
      return createDamageResult(
        false,
        0,
        remainingHealth,
        false,
        DamageResultCode.INVALID_DAMAGE,
        damage,
        target?.id,
      );
    }

    // 2. Validação do alvo
    if (!target) {
      return createDamageResult(
        false,
        0,
        0,
        false,
        DamageResultCode.TARGET_REJECTED,
        damage,
      );
    }

    const currentHealth = target.getHealth().current;

    // 3. Verifica se o alvo já está morto (alvo morto permanece morto e rejeita dano)
    if (!target.isAlive()) {
      return createDamageResult(
        false,
        0,
        currentHealth,
        false,
        DamageResultCode.TARGET_DEAD,
        damage,
        target.id,
      );
    }

    // 4. Verifica se o alvo pode receber este tipo/especificação de dano
    if (!target.canReceiveDamage(damage)) {
      return createDamageResult(
        false,
        0,
        currentHealth,
        false,
        DamageResultCode.TARGET_REJECTED,
        damage,
        target.id,
      );
    }

    // 5. Caso especial: dano numérico 0 (operação atômica sem mutação)
    if (damage.amount === 0) {
      return createDamageResult(
        true,
        0,
        currentHealth,
        false,
        DamageResultCode.NO_DAMAGE,
        damage,
        target.id,
      );
    }

    // 6. Aplicação atômica delegada ao contrato do alvo
    const result = target.receiveDamage(damage);

    // 7. Notifica ouvintes somente após aplicação válida
    if (result.success && result.damageApplied > 0) {
      this.notifyListeners(result, target);
    }

    return result;
  }

  private notifyListeners(result: DamageResult, target: DamageableTarget): void {
    for (const listener of this.listeners) {
      listener(result, target);
    }
  }
}
