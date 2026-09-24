import {
  EnergyState,
  canConsumeEnergy,
  consumeEnergy,
  createEnergyState,
  getEnergyPercentage,
  getMissingEnergy,
  getRemainingEnergy,
  hasEnoughEnergy,
  restoreEnergy,
  setEnergy,
  setMaximumEnergy,
} from './EnergyState.ts';

/**
 * Listener desacoplado para notificações de alteração de estado de energia.
 */
export type EnergyChangeListener = (state: EnergyState, previousState: EnergyState) => void;

/**
 * Subsistema genérico, puro e desacoplado responsável pelo gerenciamento de energia/stamina.
 *
 * Princípios arquiteturais:
 * 1. Zero acoplamento: NÃO conhece CropSystem, Inventory, ToolRegistry, ItemRegistry, Renderer, Canvas, Input, NPC, animais ou ferramentas específicas;
 * 2. Sem branches de gameplay: opera exclusivamente com grandezas numéricas de energia;
 * 3. Totalmente determinístico: sem Math.random, sem relógio de parede (Date.now);
 * 4. Sem controle próprio de tempo: não possui relógio interno nem update autônomo com deltaTime;
 * 5. Garante atomicidade: operações de consumo só alteram o estado se houver saldo suficiente;
 * 6. Permite inscrição desacoplada de ouvintes através de subscribe();
 * 7. Suporta valores fracionários e operações de reset/restauração total.
 */
export class EnergySystem {
  private state: EnergyState;
  private readonly listeners: Set<EnergyChangeListener> = new Set();

  /**
   * Construtor da infraestrutura de energia.
   *
   * @param initialMax Energia máxima inicial (padrão: 100).
   * @param initialCurrent Energia atual inicial (padrão: igual ao initialMax).
   */
  constructor(initialMax: number = 100, initialCurrent?: number) {
    this.state = createEnergyState(initialCurrent, initialMax);
  }

  /**
   * Retorna o snapshot imutável do estado atual de energia.
   */
  public getState(): EnergyState {
    return this.state;
  }

  /**
   * Retorna a quantidade de energia atual.
   */
  public getCurrent(): number {
    return this.state.current;
  }

  /**
   * Retorna a quantidade de energia máxima.
   */
  public getMaximum(): number {
    return this.state.maximum;
  }

  /**
   * Retorna a quantidade restante de energia.
   */
  public getRemaining(): number {
    return getRemainingEnergy(this.state);
  }

  /**
   * Retorna a quantidade de energia faltante para atingir o máximo.
   */
  public getMissing(): number {
    return getMissingEnergy(this.state);
  }

  /**
   * Retorna o percentual de energia atual entre 0.0 e 1.0.
   */
  public getPercentage(): number {
    return getEnergyPercentage(this.state);
  }

  /**
   * Verifica se existe energia suficiente para a quantidade requisitada sem deduzir nada.
   */
  public hasEnough(amount: number): boolean {
    return hasEnoughEnergy(this.state, amount);
  }

  /**
   * Alias declarativo para hasEnough.
   */
  public canConsume(amount: number): boolean {
    return canConsumeEnergy(this.state, amount);
  }

  /**
   * Tenta consumir deterministicamente uma quantidade de energia.
   *
   * Se houver energia suficiente:
   * - Deduz a energia do estado;
   * - Notifica os ouvintes;
   * - Retorna true.
   *
   * Se não houver energia suficiente (ou se amount for inválido/negativo):
   * - O estado permanece estritamente inalterado;
   * - Retorna false.
   */
  public consume(amount: number): boolean {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
      return false;
    }

    if (amount === 0) {
      return true;
    }

    if (!hasEnoughEnergy(this.state, amount)) {
      return false;
    }

    const previous = this.state;
    this.state = consumeEnergy(this.state, amount);
    this.notifyListeners(previous);
    return true;
  }

  /**
   * Restaura uma quantidade de energia até o teto máximo permitido.
   *
   * @param amount Quantidade a ser restaurada (>= 0).
   * @returns Quantidade de energia efetivamente restaurada.
   */
  public restore(amount: number): number {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return 0;
    }

    const previous = this.state;
    this.state = restoreEnergy(this.state, amount);
    const restored = this.state.current - previous.current;

    if (restored > 0) {
      this.notifyListeners(previous);
    }

    return restored;
  }

  /**
   * Restaura completamente a energia do jogador até o valor máximo.
   *
   * @returns Quantidade total de energia restaurada.
   */
  public restoreFull(): number {
    return this.restore(this.state.maximum);
  }

  /**
   * Reseta o estado para o valor máximo (ou para os valores especificados).
   */
  public reset(maximum?: number, current?: number): void {
    const previous = this.state;
    const newMax = maximum !== undefined ? maximum : this.state.maximum;
    const newCurrent = current !== undefined ? current : newMax;
    this.state = createEnergyState(newCurrent, newMax);
    this.notifyListeners(previous);
  }

  /**
   * Define explicitamente o valor atual de energia, aplicando clamp seguro entre 0 e maximum.
   */
  public setCurrent(value: number): void {
    const previous = this.state;
    this.state = setEnergy(this.state, value);
    if (this.state.current !== previous.current) {
      this.notifyListeners(previous);
    }
  }

  /**
   * Altera o valor máximo de energia de forma controlada.
   * Se a energia atual exceder o novo teto, ela é ajustada para o novo máximo.
   */
  public setMaximum(newMax: number): void {
    const previous = this.state;
    this.state = setMaximumEnergy(this.state, newMax);
    if (this.state.maximum !== previous.maximum || this.state.current !== previous.current) {
      this.notifyListeners(previous);
    }
  }

  /**
   * Inscreve um ouvinte desacoplado para notificações de alteração de energia.
   * Retorna uma função para cancelamento da inscrição (unsubscribe).
   */
  public subscribe(listener: EnergyChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifica todos os ouvintes inscritos sobre uma alteração de estado.
   */
  private notifyListeners(previous: EnergyState): void {
    for (const listener of this.listeners) {
      listener(this.state, previous);
    }
  }
}
