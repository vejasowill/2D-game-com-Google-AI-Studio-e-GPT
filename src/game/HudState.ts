import { DEFAULT_DAY_LENGTH_SECONDS } from './GameTime.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';

/**
 * Contrato declarativo imutável que representa o estado visual observável da HUD.
 * Totalmente derivado das autoridades existentes (TimeSystem e EnergySystem).
 */
export interface HudState {
  /** Dia atual do jogo (derivado de TimeSystem.getDay()) */
  readonly day: number;

  /** Segundos decorridos no dia atual [0, dayLengthSeconds) */
  readonly timeOfDaySeconds: number;

  /** Horário formatado no relógio do jogo (ex: '06:00', '08:00') */
  readonly formattedTime: string;

  /** Quantidade atual de energia do Player */
  readonly currentEnergy: number;

  /** Quantidade máxima de energia do Player */
  readonly maximumEnergy: number;

  /** Fração normalizada de energia [0.0, 1.0] */
  readonly energyPercentage: number;

  /** Quantidade atual de vida do Player */
  readonly currentHealth: number;

  /** Quantidade máxima de vida do Player */
  readonly maximumHealth: number;

  /** Fração normalizada de vida [0.0, 1.0] */
  readonly healthPercentage: number;
}

/**
 * Converte o timeOfDaySeconds em formato de relógio de jogo legível (HH:MM).
 *
 * Princípios determinísticos:
 * 1. O dia de simulação inicia às 06:00 (alvorecer / despertar matinal clássico de jogos de exploração);
 * 2. Mapeia estritamente [0, dayLengthSeconds) para as 24 horas do dia de forma monotônica;
 * 3. Função pura, sem Date.now(), sem performance.now(), sem Math.random().
 *
 * @param timeOfDaySeconds Segundos decorridos no dia atual
 * @param dayLengthSeconds Duração de um dia completo em segundos de simulação
 * @param startHour Hora inicial do dia (padrão: 6, para despertar às 06:00)
 */
export function formatGameClock(
  timeOfDaySeconds: number,
  dayLengthSeconds: number = DEFAULT_DAY_LENGTH_SECONDS,
  startHour: number = 6,
): string {
  const safeDayLength = Math.max(1, dayLengthSeconds);
  const clampedSeconds = Math.max(0, timeOfDaySeconds);
  const progress = (clampedSeconds % safeDayLength) / safeDayLength;
  const totalMinutesInDay = 24 * 60; // 1440 minutos
  const elapsedMinutes = Math.floor(progress * totalMinutesInDay);
  const startMinute = (startHour * 60) % totalMinutesInDay;
  const currentMinuteOfDay = (startMinute + elapsedMinutes) % totalMinutesInDay;
  const hours = Math.floor(currentMinuteOfDay / 60);
  const minutes = currentMinuteOfDay % 60;
  const padH = hours < 10 ? `0${hours}` : `${hours}`;
  const padM = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${padH}:${padM}`;
}

/**
 * Extrai o estado atual da HUD a partir das autoridades existentes de forma pura e determinística.
 * Não duplica estado, não cria relógio secundário e não altera gameplay.
 */
export function calculateHudState(
  world: World,
  player: Player,
  startHour: number = 6,
): HudState {
  const timeSystem = world.getTimeSystem();
  const gameTime = timeSystem.getTime();
  const energy = player.getEnergy();
  const health = player.getHealthSystem();

  return {
    day: gameTime.day,
    timeOfDaySeconds: gameTime.timeOfDaySeconds,
    formattedTime: formatGameClock(gameTime.timeOfDaySeconds, gameTime.dayLengthSeconds, startHour),
    currentEnergy: energy.getCurrent(),
    maximumEnergy: energy.getMaximum(),
    energyPercentage: energy.getPercentage(),
    currentHealth: health.getCurrent(),
    maximumHealth: health.getMaximum(),
    healthPercentage: health.getPercentage(),
  };
}
