/**
 * Contrato imutável e declarativo para o estado de energia/stamina do jogador.
 *
 * Invariantes obrigatórias:
 * 1. maximum > 0;
 * 2. current >= 0;
 * 3. current <= maximum;
 * 4. Suporte nativo a valores fracionários (ex: 12.5);
 * 5. Nunca permitir energia negativa nem acima do máximo;
 * 6. Imutabilidade estrita garantida por Object.freeze.
 */
export interface EnergyState {
  readonly current: number;
  readonly maximum: number;
}

/**
 * Cria uma instância imutável e validada de EnergyState.
 *
 * @param current Valor atual da energia (padrão: igual ao maximum).
 * @param maximum Valor máximo permitido da energia (deve ser > 0, padrão: 100).
 * @throws {Error} Se maximum <= 0 ou for NaN.
 */
export function createEnergyState(current?: number, maximum: number = 100): EnergyState {
  if (typeof maximum !== 'number' || Number.isNaN(maximum) || maximum <= 0) {
    throw new Error(`[EnergyState] Valor máximo de energia deve ser um número positivo (> 0). Recebido: ${maximum}`);
  }

  const rawCurrent = current !== undefined ? current : maximum;
  if (typeof rawCurrent !== 'number' || Number.isNaN(rawCurrent)) {
    throw new Error(`[EnergyState] Valor atual de energia deve ser um número válido. Recebido: ${rawCurrent}`);
  }

  const clampedCurrent = Math.max(0, Math.min(maximum, rawCurrent));

  return Object.freeze({
    current: clampedCurrent,
    maximum,
  });
}

/**
 * Verifica deterministicamente se o estado possui energia suficiente para suprir a quantidade requerida.
 * Rejeita valores negativos ou não numéricos.
 */
export function hasEnoughEnergy(state: EnergyState, amount: number): boolean {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    return false;
  }
  return state.current >= amount;
}

/**
 * Alias semântico para hasEnoughEnergy.
 */
export function canConsumeEnergy(state: EnergyState, amount: number): boolean {
  return hasEnoughEnergy(state, amount);
}

/**
 * Função pura que deduz uma quantidade de energia, retornando um novo EnergyState imutável.
 * Garante que o valor nunca fique abaixo de zero.
 *
 * @throws {Error} Se amount for negativo ou inválido.
 */
export function consumeEnergy(state: EnergyState, amount: number): EnergyState {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    throw new Error(`[EnergyState] Quantidade a consumir deve ser um número não-negativo (>= 0). Recebido: ${amount}`);
  }

  const newCurrent = Math.max(0, state.current - amount);
  return Object.freeze({
    current: newCurrent,
    maximum: state.maximum,
  });
}

/**
 * Função pura que restaura uma quantidade de energia, retornando um novo EnergyState imutável.
 * Garante que o valor nunca ultrapasse o máximo.
 *
 * @throws {Error} Se amount for negativo ou inválido.
 */
export function restoreEnergy(state: EnergyState, amount: number): EnergyState {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    throw new Error(`[EnergyState] Quantidade a restaurar deve ser um número não-negativo (>= 0). Recebido: ${amount}`);
  }

  const newCurrent = Math.min(state.maximum, state.current + amount);
  return Object.freeze({
    current: newCurrent,
    maximum: state.maximum,
  });
}

/**
 * Função pura que define o valor atual da energia com clamp determinístico entre 0 e maximum.
 */
export function setEnergy(state: EnergyState, newCurrent: number): EnergyState {
  if (typeof newCurrent !== 'number' || Number.isNaN(newCurrent)) {
    throw new Error(`[EnergyState] Novo valor de energia deve ser um número válido. Recebido: ${newCurrent}`);
  }

  const clamped = Math.max(0, Math.min(state.maximum, newCurrent));
  return Object.freeze({
    current: clamped,
    maximum: state.maximum,
  });
}

/**
 * Função pura que altera o valor máximo da energia de forma controlada.
 * Se o valor atual ultrapassar o novo máximo, ele é ajustado para o novo teto.
 *
 * @throws {Error} Se newMaximum <= 0 ou for NaN.
 */
export function setMaximumEnergy(state: EnergyState, newMaximum: number): EnergyState {
  if (typeof newMaximum !== 'number' || Number.isNaN(newMaximum) || newMaximum <= 0) {
    throw new Error(`[EnergyState] Novo valor máximo deve ser um número positivo (> 0). Recebido: ${newMaximum}`);
  }

  const clampedCurrent = Math.min(state.current, newMaximum);
  return Object.freeze({
    current: clampedCurrent,
    maximum: newMaximum,
  });
}

/**
 * Retorna a quantidade de energia restante no estado.
 */
export function getRemainingEnergy(state: EnergyState): number {
  return state.current;
}

/**
 * Retorna a quantidade que falta para atingir a energia máxima.
 */
export function getMissingEnergy(state: EnergyState): number {
  return Math.max(0, state.maximum - state.current);
}

/**
 * Retorna a proporção de energia atual em relação ao máximo (entre 0.0 e 1.0).
 */
export function getEnergyPercentage(state: EnergyState): number {
  return state.maximum > 0 ? state.current / state.maximum : 0;
}
