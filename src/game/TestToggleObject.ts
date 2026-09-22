import { WorldCoord } from './types.ts';
import { WorldObject } from './WorldObject.ts';
import {
  Interactable,
  InteractionBounds,
  InteractionContext,
  InteractionDefinition,
  InteractionResult,
} from './InteractionTypes.ts';

export interface TestToggleObjectState {
  readonly active: boolean;
  readonly label: string;
}

/**
 * Objeto interativo técnico que implementa uma máquina de dois estados (OFF <-> ON).
 *
 * Princípios arquiteturais:
 * - O InteractionSystem NÃO conhece os estados OFF ou ON nem o tipo 'test_toggle';
 * - A lógica de transição e a decisão de efeito pertencem inteiramente a este objeto;
 * - Retorna um InteractionResult estruturado com feedback e mutações/patches de estado;
 * - O Renderer apenas desenha o estado que o objeto expressa (sem lógica de jogo).
 */
export class TestToggleObject implements WorldObject, Interactable {
  public readonly id: string;
  public readonly type: string = 'test_toggle';
  public position: WorldCoord;
  public width: number;
  public height: number;

  public interaction: InteractionDefinition;
  public interactionBounds?: InteractionBounds;

  /** Estado interno tipado */
  public active: boolean = false;
  public state: Readonly<TestToggleObjectState>;

  /** Contador de alternâncias bem-sucedidas */
  public toggleCount: number = 0;

  /** Flag para bloquear interação temporariamente (testar canInteract) */
  public isBlocked: boolean = false;

  constructor(
    id: string,
    position: WorldCoord,
    initialActive: boolean = false,
    width: number = 24,
    height: number = 24,
    interactionBounds?: InteractionBounds,
  ) {
    this.id = id;
    this.position = { ...position };
    this.active = initialActive;
    this.width = width;
    this.height = height;
    this.interactionBounds = interactionBounds;

    this.state = {
      active: this.active,
      label: this.active ? 'ON' : 'OFF',
    };

    this.interaction = {
      id: `toggle_${id}`,
      label: 'Alternar',
      priority: 1,
    };
  }

  public canInteract(_context: InteractionContext): boolean {
    return !this.isBlocked;
  }

  public interact(_context: InteractionContext): InteractionResult {
    // Transição de estado: OFF -> ON ou ON -> OFF
    this.active = !this.active;
    this.toggleCount++;

    const newLabel = this.active ? 'ON' : 'OFF';
    this.state = {
      active: this.active,
      label: newLabel,
    };

    const feedbackMessage = `Beacon: ${newLabel}`;

    return {
      success: true,
      interactionId: this.interaction.id,
      actionLabel: this.interaction.label,
      message: feedbackMessage,
      code: this.active ? 'beacon_on' : 'beacon_off',
      statePatch: {
        active: this.active,
        label: newLabel,
      },
      data: {
        active: this.active,
        toggleCount: this.toggleCount,
        objectId: this.id,
      },
    };
  }
}
