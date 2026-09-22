import { WorldCoord } from './types.ts';
import { WorldObject } from './WorldObject.ts';
import {
  Interactable,
  InteractionBounds,
  InteractionContext,
  InteractionDefinition,
  InteractionResult,
} from './InteractionTypes.ts';

/**
 * Objeto interativo técnico para comprovar o sistema genérico de interação.
 * Não é uma árvore, NPC ou baú definitivo; serve exclusivamente para testar a infraestrutura.
 */
export class TestInteractableObject implements WorldObject, Interactable {
  public readonly id: string;
  public readonly type: string = 'test_interactable';
  public position: WorldCoord;
  public width: number;
  public height: number;

  public interaction: InteractionDefinition;
  public interactionBounds?: InteractionBounds;

  /** Contador determinístico de quantas vezes a interação foi executada com sucesso */
  public interactionCount: number = 0;

  /** Flag para alternar a disponibilidade de interação (testes de canInteract) */
  public isEnabled: boolean = true;

  /** Mensagem customizável retornada pela interação */
  public customMessage?: string;

  constructor(
    id: string,
    position: WorldCoord,
    width: number = 24,
    height: number = 24,
    interactionLabel: string = 'Inspecionar',
    priority: number = 0,
    range?: number,
    interactionBounds?: InteractionBounds,
  ) {
    this.id = id;
    this.position = { ...position };
    this.width = width;
    this.height = height;
    this.interactionBounds = interactionBounds;
    this.interaction = {
      id: `inspect_${id}`,
      label: interactionLabel,
      priority,
      range,
    };
  }

  public canInteract(_context: InteractionContext): boolean {
    return this.isEnabled;
  }

  public interact(_context: InteractionContext): InteractionResult {
    this.interactionCount++;
    return {
      success: true,
      interactionId: this.interaction.id,
      actionLabel: this.interaction.label,
      message: this.customMessage ?? `Interagiu com ${this.id} (${this.interactionCount}x)`,
      code: 'success',
      data: {
        interactionCount: this.interactionCount,
        objectId: this.id,
        objectType: this.type,
      },
    };
  }
}
