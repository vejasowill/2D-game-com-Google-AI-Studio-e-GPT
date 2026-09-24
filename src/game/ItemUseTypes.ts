import { EquippedItem } from './Equipment.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { WorldBounds, WorldCoord } from './types.ts';
import { WorldMutation } from './InteractionTypes.ts';
import { WorldObject } from './WorldObject.ts';

/**
 * Definição declarativa do comportamento de uso de um item.
 * Permite que qualquer item declare sua ação, alcance, cooldown e regras sem
 * que o sistema central conheça itens específicos (zero `if (itemId === 'axe')`).
 */
export interface ItemUseDefinition {
  /** Identificador abstrato da ação (ex: 'chop', 'mine', 'dig', 'water', 'plant', 'consume', 'attack') */
  readonly action: string;

  /** Alcance físico máximo de uso em pixels (opcional, padrão do sistema se omitido) */
  readonly range?: number;

  /** Tempo de recarga (cooldown) entre ativações em segundos (opcional, padrão do sistema se omitido) */
  readonly cooldown?: number;

  /** Indica se a ação exige obrigatoriamente um alvo válido ao alcance (padrão true para ferramentas de impacto) */
  readonly requiresTarget?: boolean;

  /** Domínio de alvo preferencial da ação (opcional, 'object' por padrão, ou 'tile' para solo/blocos) */
  readonly targetDomain?: 'object' | 'tile' | 'any';

  /** Indica se o uso deste item deve consumir quantidade do ItemStack no inventário (ex: sementes, comida) */
  readonly consumesItem?: boolean;

  /** Quantidade a ser consumida após a conclusão com sucesso (padrão: 1) */
  readonly consumeQuantity?: number;

  /** Duração opcional em segundos pela qual o movimento do Player é temporariamente bloqueado durante o uso */
  readonly blocksMovementDuration?: number;

  /** Parâmetros customizados adicionais declarativos */
  readonly customArgs?: Readonly<Record<string, unknown>>;
}

/**
 * Contexto imutável fornecido à ação no momento da execução de uso.
 */
export interface ItemUseContext {
  readonly player: Player;
  readonly world: World;
  readonly equippedItem: EquippedItem;
  readonly target?: (WorldObject & ItemActionTarget) | null;
  readonly action: string;
  readonly customArgs?: Readonly<Record<string, unknown>>;
}

/**
 * Resultado estruturado retornado pela execução de uma ação de uso de item.
 */
export interface ItemUseResult {
  /** Indica se a ação foi concluída com sucesso */
  readonly success: boolean;

  /** Ação executada (ex: 'chop') */
  readonly action: string;

  /** Mensagem contextual descritiva (para feedback técnico e inspeção) */
  readonly message?: string;

  /** Código de status legível por máquina para testes determinísticos e branching */
  readonly code?: string;

  /** Mutações a serem aplicadas no mundo através do WorldMutationHandler */
  readonly mutations?: readonly WorldMutation[];

  /** Modificação direta de estado para o objeto alvo (se aplicável) */
  readonly statePatch?: Readonly<Record<string, unknown>>;

  /** Cooldown efetivo aplicado em segundos */
  readonly cooldownApplied?: number;

  /** Dados extras opcionais */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Contrato implementado por qualquer entidade do mundo capaz de receber uma ação de ferramenta ou item.
 * O ItemUseSystem comunica-se estritamente por meio desta interface,
 * sem nunca inspecionar 'target.type === ...'.
 */
export interface ItemActionTarget {
  /**
   * Verifica se este alvo aceita e está apto a receber a ação no contexto fornecido.
   */
  canReceiveAction?(action: string, context?: ItemUseContext): boolean;

  /**
   * Executa a ação sobre o alvo e retorna o resultado estruturado.
   */
  receiveAction(action: string, context: ItemUseContext): ItemUseResult;

  /**
   * Limites de alcance físico customizados da ação (opcional).
   * Se omitido, utiliza a caixa física do objeto ou interactionBounds.
   */
  readonly actionBounds?: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Type guard determinístico para verificar se um objeto implementa ItemActionTarget.
 */
export function isItemActionTarget(obj: unknown): obj is (WorldObject & ItemActionTarget) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const candidate = obj as Partial<WorldObject & ItemActionTarget>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.position === 'object' &&
    candidate.position !== null &&
    typeof candidate.receiveAction === 'function'
  );
}

/**
 * Retorna os limites físicos no espaço do mundo de um alvo para cálculo de alcance de ação.
 * Desacoplado de qualquer dimensão visual de sprite.
 */
export function getObjectActionWorldBounds(obj: WorldObject & Partial<ItemActionTarget>): WorldBounds {
  if (obj.actionBounds) {
    const minX = obj.position.worldX + obj.actionBounds.offsetX;
    const minY = obj.position.worldY + obj.actionBounds.offsetY;
    return {
      minX,
      minY,
      maxX: minX + obj.actionBounds.width,
      maxY: minY + obj.actionBounds.height,
      width: obj.actionBounds.width,
      height: obj.actionBounds.height,
    };
  }

  // Verifica se o objeto possui interactionBounds do contrato Interactable
  const interactableCandidate = obj as {
    interaction?: {
      bounds?: {
        offsetX: number;
        offsetY: number;
        width: number;
        height: number;
      };
    };
  };

  if (interactableCandidate.interaction?.bounds) {
    const bounds = interactableCandidate.interaction.bounds;
    const minX = obj.position.worldX + bounds.offsetX;
    const minY = obj.position.worldY + bounds.offsetY;
    return {
      minX,
      minY,
      maxX: minX + bounds.width,
      maxY: minY + bounds.height,
      width: bounds.width,
      height: bounds.height,
    };
  }

  // Caixa física padrão do WorldObject
  return {
    minX: obj.position.worldX,
    minY: obj.position.worldY,
    maxX: obj.position.worldX + obj.width,
    maxY: obj.position.worldY + obj.height,
    width: obj.width,
    height: obj.height,
  };
}
