import {
  calculateGameTime,
  DayTransitionEvent,
  DayTransitionListener,
  DEFAULT_DAY_LENGTH_SECONDS,
  GameTime,
  TimeSystemConfig,
  TimeSystemSnapshot,
} from './GameTime.ts';

/**
 * Subsistema central e desacoplado responsável pela autoridade do tempo de jogo (TimeSystem).
 *
 * Princípios arquiteturais:
 * 1. Monotônico e determinístico: tempo baseado estritamente em deltaTime, independente de taxa de quadros (FPS);
 * 2. Sem relógio do sistema: zero uso de `Date.now()`, `performance.now()` ou `new Date()` para gameplay;
 * 3. Sem aleatoriedade: zero dependência de `Math.random()`;
 * 4. Desacoplamento estrito: desconhece entidades, culturas, inventário, ferramentas, sprites e renderização;
 * 5. Eventos de transição de dia genéricos e assíncronos a gameplay (não executa rotinas de colheita/fome diretamente);
 * 6. Suporte a controle de escala (aceleração/desaceleração) e congelamento/pausa;
 * 7. Suporte a avanço e definição manual para testes e sistemas futuros de sono/save.
 */
export class TimeSystem {
  /** Tempo total acumulado em segundos de simulação */
  private totalElapsedSeconds: number;

  /** Duração de um dia completo no mundo em segundos */
  private dayLengthSeconds: number;

  /** Dia de início da simulação */
  private readonly initialDay: number;

  /** Escala de velocidade do tempo (1.0 = velocidade normal) */
  private timeScale: number;

  /** Estado de pausa do avanço temporal */
  private paused: boolean;

  /** Delta de simulação efetivamente aplicado na última atualização */
  private lastDeltaSeconds: number = 0;

  /** Ouvintes desacoplados de transição de dia */
  private readonly dayTransitionListeners: Set<DayTransitionListener> = new Set();

  constructor(config?: TimeSystemConfig) {
    this.dayLengthSeconds = Math.max(1, config?.dayLengthSeconds ?? DEFAULT_DAY_LENGTH_SECONDS);
    this.totalElapsedSeconds = Math.max(0, config?.initialTime ?? 0);
    this.initialDay = Math.max(1, Math.floor(config?.initialDay ?? 1));
    this.timeScale = Math.max(0, config?.timeScale ?? 1.0);
    this.paused = config?.paused ?? false;
  }

  /**
   * Atualiza a simulação temporal com base no deltaTime informado.
   * Não avança caso esteja pausado ou com escala zero/negativa.
   */
  public update(deltaTime: number): void {
    if (deltaTime <= 0 || this.paused || this.timeScale <= 0) {
      this.lastDeltaSeconds = 0;
      return;
    }

    const effectiveDelta = deltaTime * this.timeScale;
    const previousDay = this.getDay();

    this.totalElapsedSeconds += effectiveDelta;
    this.lastDeltaSeconds = effectiveDelta;

    const currentDay = this.getDay();
    if (currentDay > previousDay) {
      this.notifyDayTransition(previousDay, currentDay);
    }
  }

  /**
   * Avança manualmente o relógio por uma quantidade fixa de segundos de simulação.
   * Ignora a pausa e a escala temporal (útil para testes determinísticos e mecânicas como dormir).
   */
  public advance(seconds: number): void {
    if (seconds <= 0) {
      return;
    }

    const previousDay = this.getDay();
    this.totalElapsedSeconds += seconds;
    this.lastDeltaSeconds = seconds;

    const currentDay = this.getDay();
    if (currentDay > previousDay) {
      this.notifyDayTransition(previousDay, currentDay);
    }
  }

  /**
   * Avança o tempo de simulação até o início exato do próximo dia de jogo.
   * Dispara a transição de dia determinística e retorna a quantidade de segundos avançados.
   */
  public advanceToNextDay(): number {
    const timeOfDay = this.getTimeOfDaySeconds();
    const secondsToNextDay = this.dayLengthSeconds - timeOfDay;
    this.advance(secondsToNextDay);
    return secondsToNextDay;
  }

  /**
   * Ajusta diretamente o tempo total de simulação (útil para testes, carregamento de saves ou debug).
   * Garante não negatividade.
   */
  public setTime(totalSeconds: number): void {
    const safeTime = Math.max(0, totalSeconds);
    const previousDay = this.getDay();

    this.totalElapsedSeconds = safeTime;
    this.lastDeltaSeconds = 0;

    const currentDay = this.getDay();
    if (currentDay !== previousDay) {
      this.notifyDayTransition(previousDay, currentDay);
    }
  }

  /**
   * Retorna um snapshot imutável com todos os detalhes do estado temporal atual.
   */
  public getTime(): GameTime {
    return calculateGameTime(
      this.totalElapsedSeconds,
      this.dayLengthSeconds,
      this.initialDay,
      this.paused,
      this.timeScale,
    );
  }

  /**
   * Retorna o total de segundos decorridos no mundo desde o início da simulação.
   */
  public getTotalElapsedSeconds(): number {
    return this.totalElapsedSeconds;
  }

  /**
   * Retorna o dia atual no calendário do jogo (inicia em 1 por padrão).
   */
  public getDay(): number {
    const dayOffset = Math.floor(this.totalElapsedSeconds / this.dayLengthSeconds);
    return this.initialDay + dayOffset;
  }

  /**
   * Retorna os segundos decorridos dentro do dia atual [0, dayLengthSeconds).
   */
  public getTimeOfDaySeconds(): number {
    const dayOffset = Math.floor(this.totalElapsedSeconds / this.dayLengthSeconds);
    const timeOfDay = this.totalElapsedSeconds - (dayOffset * this.dayLengthSeconds);
    return timeOfDay >= this.dayLengthSeconds ? 0 : Math.max(0, timeOfDay);
  }

  /**
   * Retorna a fração normalizada de conclusão do dia atual [0, 1).
   */
  public getDayProgress(): number {
    return this.getTimeOfDaySeconds() / this.dayLengthSeconds;
  }

  /**
   * Retorna a duração configurada de um dia completo em segundos.
   */
  public getDayLengthSeconds(): number {
    return this.dayLengthSeconds;
  }

  /**
   * Atualiza a duração configurada do dia em segundos.
   */
  public setDayLengthSeconds(seconds: number): void {
    if (seconds > 0) {
      this.dayLengthSeconds = seconds;
    }
  }

  /**
   * Pausa o avanço do tempo de simulação.
   */
  public pause(): void {
    this.paused = true;
  }

  /**
   * Despausa o avanço do tempo de simulação.
   */
  public resume(): void {
    this.paused = false;
  }

  /**
   * Define o estado de pausa do tempo de simulação.
   */
  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /**
   * Informa se a simulação temporal está pausada.
   */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Define a escala multiplicadora de velocidade do tempo (ex: 2.0 para o dobro da velocidade).
   * Valores negativos são desconsiderados.
   */
  public setTimeScale(scale: number): void {
    if (scale >= 0) {
      this.timeScale = scale;
    }
  }

  /**
   * Retorna a escala multiplicadora de velocidade do tempo atual.
   */
  public getTimeScale(): number {
    return this.timeScale;
  }

  /**
   * Retorna o delta em segundos efetivamente aplicado no último ciclo de update.
   */
  public getLastDeltaSeconds(): number {
    return this.lastDeltaSeconds;
  }

  /**
   * Registra um ouvinte para notificações de transição de dia.
   * Retorna uma função para desinscrever o ouvinte de forma segura.
   */
  public addDayTransitionListener(listener: DayTransitionListener): () => void {
    this.dayTransitionListeners.add(listener);
    return () => {
      this.dayTransitionListeners.delete(listener);
    };
  }

  /**
   * Remove um ouvinte previamente registrado.
   */
  public removeDayTransitionListener(listener: DayTransitionListener): boolean {
    return this.dayTransitionListeners.delete(listener);
  }

  /**
   * Remove todos os ouvintes de transição de dia (útil em teardown).
   */
  public clearDayTransitionListeners(): void {
    this.dayTransitionListeners.clear();
  }

  /**
   * Converte determinística e puramente um tempo arbitrário em GameTime considerando as configurações deste sistema.
   */
  public calculateGameTime(totalSeconds: number): GameTime {
    return calculateGameTime(
      totalSeconds,
      this.dayLengthSeconds,
      this.initialDay,
      this.paused,
      this.timeScale,
    );
  }

  /**
   * Gera um snapshot serializável para persistência (save/load).
   */
  public serialize(): TimeSystemSnapshot {
    return {
      totalElapsedSeconds: this.totalElapsedSeconds,
      dayLengthSeconds: this.dayLengthSeconds,
      initialDay: this.initialDay,
      timeScale: this.timeScale,
      paused: this.paused,
    };
  }

  /**
   * Restaura o estado a partir de um snapshot serializado.
   */
  public deserialize(snapshot: TimeSystemSnapshot): void {
    this.dayLengthSeconds = Math.max(1, snapshot.dayLengthSeconds);
    this.timeScale = Math.max(0, snapshot.timeScale);
    this.paused = snapshot.paused;
    this.setTime(snapshot.totalElapsedSeconds);
  }

  /**
   * Cria uma nova instância de TimeSystem a partir de um snapshot salvo.
   */
  public static fromSnapshot(snapshot: TimeSystemSnapshot): TimeSystem {
    const system = new TimeSystem({
      dayLengthSeconds: snapshot.dayLengthSeconds,
      initialTime: snapshot.totalElapsedSeconds,
      initialDay: snapshot.initialDay,
      timeScale: snapshot.timeScale,
      paused: snapshot.paused,
    });
    return system;
  }

  /**
   * Notifica todos os ouvintes registrados quando ocorre uma transição de dia.
   */
  private notifyDayTransition(previousDay: number, currentDay: number): void {
    if (this.dayTransitionListeners.size === 0) {
      return;
    }

    const event: DayTransitionEvent = {
      previousDay,
      currentDay,
      totalElapsedSeconds: this.totalElapsedSeconds,
      daysElapsed: currentDay - previousDay,
    };

    for (const listener of this.dayTransitionListeners) {
      listener(event);
    }
  }
}
