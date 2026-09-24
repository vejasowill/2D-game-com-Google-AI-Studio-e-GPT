/**
 * Duração padrão de um dia no mundo de jogo em segundos de simulação (20 minutos em tempo real).
 */
export const DEFAULT_DAY_LENGTH_SECONDS = 1200;

/**
 * Contrato declarativo imutável que representa um instante específico na linha temporal do jogo.
 * Totalmente desacoplado de entidades, culturas, inventário e renderização.
 */
export interface GameTime {
  /** Tempo total decorrido na simulação do mundo em segundos (monotônico, >= 0) */
  readonly totalElapsedSeconds: number;
  /** Dia atual do jogo (inicia em 1 no instante zero) */
  readonly day: number;
  /** Horário/segundos decorridos dentro do dia atual [0, dayLengthSeconds) */
  readonly timeOfDaySeconds: number;
  /** Duração configurada de um dia completo em segundos */
  readonly dayLengthSeconds: number;
  /** Progresso normalizado do dia atual [0, 1) */
  readonly dayProgress: number;
  /** Indica se o avanço temporal está pausado */
  readonly isPaused: boolean;
  /** Escala multiplicadora de velocidade do tempo (1.0 = normal) */
  readonly timeScale: number;
}

/**
 * Evento emitido de forma desacoplada quando ocorre uma mudança de dia na simulação.
 */
export interface DayTransitionEvent {
  readonly previousDay: number;
  readonly currentDay: number;
  readonly totalElapsedSeconds: number;
  readonly daysElapsed: number;
}

/**
 * Assinatura para ouvintes genéricos de transição de dia.
 */
export type DayTransitionListener = (event: DayTransitionEvent) => void;

/**
 * Opções de configuração inicial do subsistema temporal.
 */
export interface TimeSystemConfig {
  /** Duração de um dia em segundos (padrão: 1200) */
  readonly dayLengthSeconds?: number;
  /** Tempo total inicial decorrido em segundos (padrão: 0) */
  readonly initialTime?: number;
  /** Dia inicial de contagem (padrão: 1) */
  readonly initialDay?: number;
  /** Escala inicial de velocidade (padrão: 1.0) */
  readonly timeScale?: number;
  /** Se o tempo inicia pausado (padrão: false) */
  readonly paused?: boolean;
}

/**
 * Representação serializável para persistência (save/load) do estado temporal.
 */
export interface TimeSystemSnapshot {
  readonly totalElapsedSeconds: number;
  readonly dayLengthSeconds: number;
  readonly initialDay: number;
  readonly timeScale: number;
  readonly paused: boolean;
}

/**
 * Converte de forma determinística e pura um valor de tempo total decorrido em um objeto GameTime.
 * Função pura sem efeitos colaterais.
 */
export function calculateGameTime(
  totalElapsedSeconds: number,
  dayLengthSeconds: number = DEFAULT_DAY_LENGTH_SECONDS,
  initialDay: number = 1,
  isPaused: boolean = false,
  timeScale: number = 1.0,
): GameTime {
  const safeTotalSeconds = Math.max(0, totalElapsedSeconds);
  const safeDayLength = Math.max(1, dayLengthSeconds);
  const safeInitialDay = Math.max(1, Math.floor(initialDay));

  const dayOffset = Math.floor(safeTotalSeconds / safeDayLength);
  const day = safeInitialDay + dayOffset;

  // Cálculo robusto contra imprecisões de ponto flutuante na fronteira do dia
  const timeOfDaySeconds = safeTotalSeconds - (dayOffset * safeDayLength);
  const normalizedTimeOfDay = timeOfDaySeconds >= safeDayLength ? 0 : Math.max(0, timeOfDaySeconds);
  const dayProgress = normalizedTimeOfDay / safeDayLength;

  return {
    totalElapsedSeconds: safeTotalSeconds,
    day,
    timeOfDaySeconds: normalizedTimeOfDay,
    dayLengthSeconds: safeDayLength,
    dayProgress,
    isPaused,
    timeScale,
  };
}
