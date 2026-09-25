import {
  HealthState,
  createHealthState,
  damageHealth,
  getHealthPercentage,
  getMissingHealth,
  getRemainingHealth,
  hasEnoughHealth,
  isAlive,
  isDead,
  restoreHealth,
  setHealth,
  setMaximumHealth,
} from './HealthState.ts';

/**
 * Tipos de eventos suportados pelo subsistema de vida.
 */
export type HealthEventType = 'health_changed' | 'damage_received' | 'healed' | 'death';

/**
 * Evento emitido pelo HealthSystem para notificações desacopladas de gameplay.
 */
export interface HealthEvent {
  readonly type: HealthEventType;
  readonly state: HealthState;
  readonly previousState: HealthState;
  readonly amount?: number;
}

/**
 * Listener genérico para alterações de estado de vida.
 */
export type HealthChangeListener = (state: HealthState, previousState: HealthState) => void;

/**
 * Listener específico para eventos tipados de vida.
 */
export type HealthEventListener = (event: HealthEvent) => void;

/**
 * Resultado detalhado da operação de aplicação direta de dano no HealthSystem.
 */
export interface HealthDamageResult {
  readonly appliedDamage: number;
  readonly previousHealth: number;
  readonly currentHealth: number;
  readonly killed: boolean;
  readonly wasAlive: boolean;
  readonly isAlive: boolean;
}

/**
 * Subsistema genérico, puro e desacoplado responsável pelo gerenciamento de vida (HP).
 *
 * Princípios arquiteturais:
 * 1. Zero acoplamento: NÃO conhece Player, Criaturas, NPCs, Combate, Renderer, Canvas ou Input;
 * 2. Sem branches de entidades concretas;
 * 3. Totalmente determinístico: sem Math.random, sem relógio de parede (Date.now);
 * 4. Sem controle próprio de tempo: não possui relógio interno nem update autônomo com deltaTime;
 * 5. Garante atomicidade: rejeita danos inválidos e impede vida negativa;
 * 6. Suporta valores fracionários e notificações através de Observers desacoplados;
 * 7. Alvo morto (current === 0) rejeita danos adicionais e permanece morto.
 */
export class HealthSystem {
  private state: HealthState;
  private readonly changeListeners: Set<HealthChangeListener> = new Set();
  private readonly eventListeners: Map<HealthEventType, Set<HealthEventListener>> = new Map();

  /**
   * Construtor da infraestrutura de vida.
   *
   * @param initialMax Vida máxima inicial (padrão: 100).
   * @param initialCurrent Vida atual inicial (padrão: igual ao initialMax).
   */
  constructor(initialMax: number = 100, initialCurrent?: number) {
    this.state = createHealthState(initialCurrent, initialMax);
  }

  /**
   * Retorna o snapshot imutável do estado atual de vida.
   */
  public getState(): HealthState {
    return this.state;
  }

  /**
   * Retorna a quantidade de vida atual.
   */
  public getCurrent(): number {
    return this.state.current;
  }

  /**
   * Retorna a quantidade de vida máxima.
   */
  public getMaximum(): number {
    return this.state.maximum;
  }

  /**
   * Retorna a quantidade restante de vida.
   */
  public getRemaining(): number {
    return getRemainingHealth(this.state);
  }

  /**
   * Retorna a quantidade de vida faltante para atingir o máximo.
   */
  public getMissing(): number {
    return getMissingHealth(this.state);
  }

  /**
   * Retorna o percentual de vida atual entre 0.0 e 1.0.
   */
  public getPercentage(): number {
    return getHealthPercentage(this.state);
  }

  /**
   * Verifica se o alvo está vivo (current > 0).
   */
  public isAlive(): boolean {
    return isAlive(this.state);
  }

  /**
   * Verifica se o alvo está morto (current === 0).
   */
  public isDead(): boolean {
    return isDead(this.state);
  }

  /**
   * Verifica se o alvo possui quantidade de vida igual ou superior à requisitada.
   */
  public hasEnough(amount: number): boolean {
    return hasEnoughHealth(this.state, amount);
  }

  /**
   * Aplica dano à vida do alvo de forma atômica e determinística.
   *
   * Regras:
   * - Rejeita valores inválidos (amount <= 0, NaN, negativos);
   * - Se o alvo já estiver morto, nenhum dano é aplicado e permanece morto;
   * - Nunca permite que a vida fique negativa;
   * - Informa quanto dano foi realmente aplicado;
   * - Indica quando ocorreu transição de vivo -> morto (killed: true).
   *
   * @param amount Quantidade de dano a aplicar (> 0).
   * @returns HealthDamageResult com os detalhes da aplicação de dano.
   */
  public damage(amount: number): HealthDamageResult {
    const wasAlive = this.isAlive();

    // Rejeição de valores inválidos
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return Object.freeze({
        appliedDamage: 0,
        previousHealth: this.state.current,
        currentHealth: this.state.current,
        killed: false,
        wasAlive,
        isAlive: wasAlive,
      });
    }

    // Se já estiver morto, rejeita dano em alvo morto e permanece morto
    if (!wasAlive) {
      return Object.freeze({
        appliedDamage: 0,
        previousHealth: 0,
        currentHealth: 0,
        killed: false,
        wasAlive: false,
        isAlive: false,
      });
    }

    const previous = this.state;
    this.state = damageHealth(this.state, amount);
    const appliedDamage = previous.current - this.state.current;
    const isNowAlive = isAlive(this.state);
    const killed = wasAlive && !isNowAlive;

    // Dispara eventos após alteração válida
    this.emitEvent({
      type: 'damage_received',
      state: this.state,
      previousState: previous,
      amount: appliedDamage,
    });

    if (killed) {
      this.emitEvent({
        type: 'death',
        state: this.state,
        previousState: previous,
      });
    }

    this.emitEvent({
      type: 'health_changed',
      state: this.state,
      previousState: previous,
    });

    this.notifyChangeListeners(previous);

    return Object.freeze({
      appliedDamage,
      previousHealth: previous.current,
      currentHealth: this.state.current,
      killed,
      wasAlive,
      isAlive: isNowAlive,
    });
  }

  /**
   * Restaura uma quantidade de vida até o teto máximo permitido.
   *
   * Regras:
   * - Rejeita valores inválidos (amount <= 0, NaN, negativos);
   * - Nunca ultrapassa o valor máximo de vida;
   * - Informa quanto foi realmente restaurado.
   *
   * @param amount Quantidade a ser restaurada (> 0).
   * @returns Quantidade de vida efetivamente restaurada.
   */
  public heal(amount: number): number {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return 0;
    }

    const previous = this.state;
    this.state = restoreHealth(this.state, amount);
    const restored = this.state.current - previous.current;

    if (restored > 0) {
      this.emitEvent({
        type: 'healed',
        state: this.state,
        previousState: previous,
        amount: restored,
      });

      this.emitEvent({
        type: 'health_changed',
        state: this.state,
        previousState: previous,
      });

      this.notifyChangeListeners(previous);
    }

    return restored;
  }

  /**
   * Restaura completamente a vida do alvo até o valor máximo.
   *
   * @returns Quantidade total de vida restaurada.
   */
  public restoreFull(): number {
    return this.heal(this.state.maximum);
  }

  /**
   * Reseta o estado para o valor máximo (ou para os valores especificados).
   */
  public reset(maximum?: number, current?: number): void {
    const previous = this.state;
    const newMax = maximum !== undefined ? maximum : this.state.maximum;
    const newCurrent = current !== undefined ? current : newMax;
    this.state = createHealthState(newCurrent, newMax);

    this.emitEvent({
      type: 'health_changed',
      state: this.state,
      previousState: previous,
    });

    this.notifyChangeListeners(previous);
  }

  /**
   * Define explicitamente o valor atual de vida, aplicando clamp seguro entre 0 e maximum.
   */
  public setCurrent(value: number): void {
    const previous = this.state;
    this.state = setHealth(this.state, value);
    if (this.state.current !== previous.current) {
      const wasAlive = isAlive(previous);
      const isNowAlive = isAlive(this.state);

      if (wasAlive && !isNowAlive) {
        this.emitEvent({
          type: 'death',
          state: this.state,
          previousState: previous,
        });
      }

      this.emitEvent({
        type: 'health_changed',
        state: this.state,
        previousState: previous,
      });

      this.notifyChangeListeners(previous);
    }
  }

  /**
   * Altera o valor máximo de vida de forma controlada.
   * Se a vida atual exceder o novo teto, ela é ajustada para o novo máximo.
   */
  public setMaximum(newMax: number): void {
    const previous = this.state;
    this.state = setMaximumHealth(this.state, newMax);
    if (this.state.maximum !== previous.maximum || this.state.current !== previous.current) {
      this.emitEvent({
        type: 'health_changed',
        state: this.state,
        previousState: previous,
      });

      this.notifyChangeListeners(previous);
    }
  }

  /**
   * Inscreve um ouvinte desacoplado para notificações gerais de alteração de vida.
   * Retorna uma função de desinscrição (unsubscribe).
   */
  public subscribe(listener: HealthChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Inscreve um ouvinte para um tipo específico de evento de vida.
   * Retorna uma função de desinscrição (unsubscribe).
   */
  public on(eventType: HealthEventType, listener: HealthEventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    const set = this.eventListeners.get(eventType)!;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  private notifyChangeListeners(previous: HealthState): void {
    for (const listener of this.changeListeners) {
      listener(this.state, previous);
    }
  }

  private emitEvent(event: HealthEvent): void {
    const set = this.eventListeners.get(event.type);
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
  }
}
