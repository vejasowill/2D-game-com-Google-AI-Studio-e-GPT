import { World } from './World.ts';
import { InteractiveWorldObject, InteractionResult, WorldMutation } from './InteractionTypes.ts';

/**
 * Módulo especializado na aplicação desacoplada de mutações no mundo (WorldMutations).
 *
 * Responsabilidade única:
 * Executa mutações requisitadas por resultados de interação ou outras ações do jogo,
 * garantindo que todas as modificações passem estritamente pelo WorldObjectManager
 * para preservar a integridade dos índices espaciais por chunk e a consistência global.
 */
export class WorldMutationHandler {
  /**
   * Aplica uma única mutação no mundo.
   * Retorna true se a mutação foi aplicada com sucesso.
   */
  public static applyMutation(world: World, mutation: WorldMutation): boolean {
    const objectManager = world.getObjectManager();

    switch (mutation.type) {
      case 'create_object': {
        objectManager.addObject(mutation.object);
        return true;
      }

      case 'remove_object': {
        return objectManager.removeObject(mutation.objectId);
      }

      case 'update_position': {
        return objectManager.moveObject(mutation.objectId, mutation.newPosition);
      }

      case 'update_state': {
        return objectManager.updateObjectState(mutation.objectId, mutation.statePatch);
      }

      default: {
        return false;
      }
    }
  }

  /**
   * Aplica uma lista de mutações sequenciais no mundo.
   * Retorna o número de mutações aplicadas com sucesso.
   */
  public static applyMutations(
    world: World,
    mutations: readonly WorldMutation[] = [],
  ): number {
    let successCount = 0;
    for (const mutation of mutations) {
      if (this.applyMutation(world, mutation)) {
        successCount++;
      }
    }
    return successCount;
  }

  /**
   * Aplica todas as consequências e mutações decorrentes de um InteractionResult:
   * 1. Aplica o statePatch direto no próprio objeto alvo (se fornecido);
   * 2. Aplica a lista explícita de mutações (se fornecida).
   */
  public static applyInteractionResult(
    world: World,
    target: InteractiveWorldObject,
    result: InteractionResult,
  ): boolean {
    if (!result.success) {
      return false;
    }

    const objectManager = world.getObjectManager();

    // 1. Atualizar estado direto do objeto alvo se especificado
    if (result.statePatch) {
      objectManager.updateObjectState(target.id, result.statePatch);
    }

    // 2. Aplicar mutações adicionais no mundo
    if (result.mutations && result.mutations.length > 0) {
      this.applyMutations(world, result.mutations);
    }

    return true;
  }
}
