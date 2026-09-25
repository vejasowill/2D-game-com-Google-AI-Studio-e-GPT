/**
 * Contrato imutável e declarativo para o estado de vida (HealthState).
 * Base genérica para Player, futuras criaturas, NPCs e objetos destrutíveis.
 *
 * Invariantes obrigatórias:
 * 1. maximum > 0;
 * 2. current >= 0;
 * 3. current <= maximum;
 * 4. Suporte nativo a valores fracionários (ex: 12.5, 0.25);
 * 5. Nunca permitir vida negativa nem acima do máximo;
 * 6. Imutabilidade estrita garantida por Object.freeze;
 * 7. Funções puras determinísticas sem efeitos colaterais.
 */
export interface HealthState {
  readonly current: number;
  readonly maximum: number;
}

/**
 * Cria uma instância imutável e validada de HealthState.
 *
 * @param current Valor atual da vida (padrão: igual ao maximum).
 * @param maximum Valor máximo permitido da vida (deve ser > 0, padrão: 100).
 * @throws {Error} Se maximum <= 0 ou for NaN.
 * @throws {Error} Se current não for número ou for NaN.
 */
export function createHealthState(current?: number, maximum: number = 100): HealthState {
  if (typeof maximum !== 'number' || Number.isNaN(maximum) || maximum <= 0) {
    throw new Error(`[HealthState] Valor máximo de vida deve ser um número positivo (> 0). Recebido: ${maximum}`);
  }

  const rawCurrent = current !== undefined ? current : maximum;
  if (typeof rawCurrent !== 'number' || Number.isNaN(rawCurrent)) {
    throw new Error(`[HealthState] Valor atual de vida deve ser um número válido. Recebido: ${rawCurrent}`);
  }

  const clampedCurrent = Math.max(0, Math.min(maximum, rawCurrent));

  return Object.freeze({
    current: clampedCurrent,
    maximum,
  });
}

/**
 * Verifica deterministicamente se o estado possui vida suficiente para suprir a quantidade requerida.
 * Rejeita valores negativos ou não numéricos.
 */
export function hasEnoughHealth(state: HealthState, amount: number): boolean {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    return false;
  }
  return state.current >= amount;
}

/**
 * Função pura que deduz uma quantidade de vida, retornando um novo HealthState imutável.
 * Garante que a vida nunca fique abaixo de zero.
 *
 * @throws {Error} Se amount for negativo ou inválido.
 */
export function damageHealth(state: HealthState, amount: number): HealthState {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    throw new Error(`[HealthState] Quantidade de dano deve ser um número não-negativo (>= 0). Recebido: ${amount}`);
  }

  const newCurrent = Math.max(0, state.current - amount);
  return Object.freeze({
    current: newCurrent,
    maximum: state.maximum,
  });
}

/**
 * Função pura que restaura uma quantidade de vida, retornando um novo HealthState imutável.
 * Garante que a vida nunca ultrapasse o máximo.
 *
 * @throws {Error} Se amount for negativo ou inválido.
 */
export function restoreHealth(state: HealthState, amount: number): HealthState {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    throw new Error(`[HealthState] Quantidade a restaurar deve ser um número não-negativo (>= 0). Recebido: ${amount}`);
  }

  const newCurrent = Math.min(state.maximum, state.current + amount);
  return Object.freeze({
    current: newCurrent,
    maximum: state.maximum,
  });
}

/**
 * Função pura que define o valor atual da vida com clamp determinístico entre 0 e maximum.
 *
 * @throws {Error} Se newCurrent não for número ou for NaN.
 */
export function setHealth(state: HealthState, newCurrent: number): HealthState {
  if (typeof newCurrent !== 'number' || Number.isNaN(newCurrent)) {
    throw new Error(`[HealthState] Novo valor de vida deve ser um número válido. Recebido: ${newCurrent}`);
  }

  const clamped = Math.max(0, Math.min(state.maximum, newCurrent));
  return Object.freeze({
    current: clamped,
    maximum: state.maximum,
  });
}

/**
 * Função pura que altera o valor máximo da vida de forma controlada.
 * Se o valor atual ultrapassar o novo máximo, ele é ajustado para o novo teto.
 *
 * @throws {Error} Se newMaximum <= 0 ou for NaN.
 */
export function setMaximumHealth(state: HealthState, newMaximum: number): HealthState {
  if (typeof newMaximum !== 'number' || Number.isNaN(newMaximum) || newMaximum <= 0) {
    throw new Error(`[HealthState] Novo valor máximo deve ser um número positivo (> 0). Recebido: ${newMaximum}`);
  }

  const clampedCurrent = Math.min(state.current, newMaximum);
  return Object.freeze({
    current: clampedCurrent,
    maximum: newMaximum,
  });
}

/**
 * Retorna se o alvo está vivo (current > 0).
 */
export function isAlive(state: HealthState): boolean {
  return state.current > 0;
}

/**
 * Retorna se o alvo está morto (current === 0).
 */
export function isDead(state: HealthState): boolean {
  return state.current === 0;
}

/**
 * Retorna a quantidade de vida restante no estado.
 */
export function getRemainingHealth(state: HealthState): number {
  return state.current;
}

/**
 * Retorna a quantidade que falta para atingir a vida máxima.
 */
export function getMissingHealth(state: HealthState): number {
  return Math.max(0, state.maximum - state.current);
}

/**
 * Retorna a proporção de vida atual em relação ao máximo (entre 0.0 e 1.0).
 */
export function getHealthPercentage(state: HealthState): number {
  return state.maximum > 0 ? state.current / state.maximum : 0;
}
