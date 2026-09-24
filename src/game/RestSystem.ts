import { Player } from './Player.ts';
import { World } from './World.ts';
import { isRestTarget, RestContext, RestDefinition, RestResult, RestTarget } from './RestTarget.ts';

/**
 * Subsistema central, genérico e desacoplado para execução do ciclo de descanso e transição de dia.
 *
 * Responsabilidades:
 * 1. Autoridade temporal: utiliza exclusivamente o TimeSystem do World (zero Date.now, performance.now, new Date());
 * 2. Transição de dia: avança o relógio até o início do próximo dia via advanceToNextDay ou segundos customizados;
 * 3. Eventos determinísticos: dispara corretamente os DayTransitionListeners já registrados no TimeSystem;
 * 4. Integridade temporal: sincroniza TemporaryObjectSystem sem materializar chunks indevidos;
 * 5. Integridade agrícola: CropSystem permanece consistente e determinístico (crescimento avança conforme regras existentes);
 * 6. Recuperação de energia: restaura a energia do Player conforme a RestDefinition (padrão: 100% / restoreFull);
 * 7. 100% desacoplado de gráficos, Canvas, UI, ou entidades concretas ("Bed").
 */
export class RestSystem {
  /** Ouvinte desacoplado opcional para eventos de descanso */
  public onRest?: (result: RestResult, context: RestContext) => void;

  /**
   * Executa uma ação de descanso para o jogador no mundo.
   *
   * @param context Contexto de descanso contendo player, world e opcionalmente o target
   * @param overrideDef Configuração declarativa opcional para sobrepor a do alvo
   */
  public rest(context: RestContext, overrideDef?: RestDefinition): RestResult {
    const { player, world, target } = context;

    // 1. Validar se o alvo permite descanso no momento (se canRest for implementado)
    if (target && target.canRest && !target.canRest(context)) {
      const result: RestResult = {
        success: false,
        code: 'CONDITIONS_NOT_MET',
        message: 'Não é possível descansar neste momento.',
        previousEnergy: player.getEnergy().getCurrent(),
        restoredEnergy: 0,
        currentEnergy: player.getEnergy().getCurrent(),
        previousDay: world.getTimeSystem().getDay(),
        currentDay: world.getTimeSystem().getDay(),
        timeAdvancedSeconds: 0,
        target,
      };
      if (this.onRest) {
        this.onRest(result, context);
      }
      return result;
    }

    // 2. Resolver a definição de descanso aplicável
    const targetDef = target?.getRestDefinition ? target.getRestDefinition(context) : undefined;
    const def: RestDefinition = {
      advanceToNextDay: overrideDef?.advanceToNextDay ?? targetDef?.advanceToNextDay ?? true,
      energyRestoreMode: overrideDef?.energyRestoreMode ?? targetDef?.energyRestoreMode ?? 'full',
      energyRestoreAmount: overrideDef?.energyRestoreAmount ?? targetDef?.energyRestoreAmount,
      wakeUpTimeOffsetSeconds: overrideDef?.wakeUpTimeOffsetSeconds ?? targetDef?.wakeUpTimeOffsetSeconds ?? 0,
    };

    const previousEnergy = player.getEnergy().getCurrent();
    const previousDay = world.getTimeSystem().getDay();
    let timeAdvancedSeconds = 0;

    // 3. Avanço controlado do tempo através da autoridade única TimeSystem
    if (def.advanceToNextDay) {
      const timeSystem = world.getTimeSystem();
      const dayLength = timeSystem.getDayLengthSeconds();
      const timeOfDay = timeSystem.getTimeOfDaySeconds();

      // Tempo necessário para alcançar exatamente o início do próximo dia
      const secondsToStartOfNextDay = dayLength - timeOfDay;
      const totalSecondsToAdvance = secondsToStartOfNextDay + (def.wakeUpTimeOffsetSeconds ?? 0);

      // Avança atomicamente o World (que sincroniza TimeSystem e TemporaryObjectSystem sem materializar chunks)
      world.advanceTime(totalSecondsToAdvance);
      timeAdvancedSeconds = totalSecondsToAdvance;
    }

    const currentDay = world.getTimeSystem().getDay();

    // 4. Restaurar a energia do Player de forma atômica e declarativa
    let restoredEnergy = 0;
    const energySystem = player.getEnergy();

    if (def.energyRestoreMode === 'full') {
      restoredEnergy = energySystem.restoreFull();
    } else if (def.energyRestoreMode === 'amount' && def.energyRestoreAmount !== undefined) {
      restoredEnergy = energySystem.restore(def.energyRestoreAmount);
    } else if (def.energyRestoreMode === 'percentage' && def.energyRestoreAmount !== undefined) {
      const amount = (def.energyRestoreAmount / 100) * energySystem.getMaximum();
      restoredEnergy = energySystem.restore(amount);
    } else {
      restoredEnergy = energySystem.restoreFull();
    }

    const currentEnergy = energySystem.getCurrent();

    const result: RestResult = {
      success: true,
      code: 'REST_SUCCESS',
      message: 'Descanso concluído. Energia restaurada.',
      previousEnergy,
      restoredEnergy,
      currentEnergy,
      previousDay,
      currentDay,
      timeAdvancedSeconds,
      target,
    };

    // 5. Notificar o RestTarget se implementado
    if (target?.onRestComplete) {
      target.onRestComplete(result, context);
    }

    // 6. Notificar ouvinte desacoplado
    if (this.onRest) {
      this.onRest(result, context);
    }

    return result;
  }
}
