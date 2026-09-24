import { WorldBounds, WorldCoord } from './types.ts';
import { WorldObject } from './WorldObject.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { EquippedItem } from './Equipment.ts';
import { ToolDefinition } from './ToolDefinition.ts';
import { WorldMutation } from './InteractionTypes.ts';

/**
 * Categoria semântica de um alvo de ferramenta no mundo do jogo.
 * Suporta alvos existentes (world_object) e alvos futuros preparados (tile, entity, creature).
 */
export type ToolTargetType = 'world_object' | 'tile' | 'entity' | 'creature' | 'custom';

/**
 * Contexto de execução fornecido ao alvo e à ação da ferramenta no momento do impacto.
 */
export interface ToolExecutionContext {
  readonly player: Player;
  readonly world: World;
  readonly tool: ToolDefinition;
  readonly equippedItem: EquippedItem;
  readonly target?: ToolTarget | null;
  readonly customParams?: Readonly<Record<string, unknown>>;
}

/**
 * Contrato estruturado e genérico para o resultado de execução de uma ação de ferramenta.
 *
 * Preparado para representar:
 * - ação recusada / aceita;
 * - alvo atingido;
 * - mutações produzidas no mundo;
 * - itens produzidos;
 * - feedback amigável;
 * - alteração de estado de objetos ou tiles;
 * - dano ou durabilidade futuros.
 */
export interface ToolExecutionResult {
  /** Indica se a ação foi executada e concluída com sucesso */
  readonly success: boolean;

  /** Ação formal executada (ex: 'chop', 'mine', 'dig', 'till', 'water') */
  readonly action: string;

  /** Código legível por máquina para verificação determinística e testes */
  readonly code?: string;

  /** Mensagem contextual descritiva para feedback */
  readonly message?: string;

  /** Alvo atingido durante a execução (se houver) */
  readonly target?: ToolTarget | null;

  /** Mutações a serem aplicadas no mundo através do WorldMutationHandler */
  readonly mutations?: readonly WorldMutation[];

  /** Modificação de estado direta para o objeto alvo (se aplicável) */
  readonly statePatch?: Readonly<Record<string, unknown>>;

  /** Cooldown efetivo a ser aplicado em segundos (se omitido, utiliza tool.cooldown) */
  readonly cooldownApplied?: number;

  /** Duração efetiva de bloqueio de movimento em segundos (se omitido, utiliza tool.actionDuration) */
  readonly actionDurationApplied?: number;

  /** Itens produzidos declarativamente como resultado da ação */
  readonly producedItems?: readonly { readonly itemId: string; readonly quantity: number }[];

  /** Dados extras opcionais imutáveis */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Abstração genérica de alvo de ferramenta.
 *
 * Princípios arquiteturais:
 * 1. Desacopla o ItemUseSystem de qualquer classe concreta (ex: NaturalTreeObject).
 * 2. Permite que árvores, rochas, plantações, animais ou blocos implementem este contrato.
 * 3. Seleção baseada em geometria física AABB pura, independente de tamanho visual de sprites.
 * 4. Determinístico e seguro contra materialização acidental de chunks.
 */
export interface ToolTarget {
  /** Tipo semântico de alvo */
  readonly targetType: ToolTargetType;

  /** Identificador único do alvo */
  readonly targetId: string;

  /** Posição física central ou âncora do alvo em coordenadas de mundo */
  readonly targetPosition: WorldCoord;

  /** Retorna a caixa AABB delimitadora para teste de alcance físico */
  getTargetBounds(): WorldBounds;

  /** Verifica se o alvo aceita a ação da ferramenta no contexto fornecido */
  canReceiveToolAction(tool: ToolDefinition, context: ToolExecutionContext): boolean;

  /** Executa a ação da ferramenta sobre o alvo e retorna o resultado estruturado */
  receiveToolAction(tool: ToolDefinition, context: ToolExecutionContext): ToolExecutionResult;

  /** Referência ao WorldObject subjacente (quando o alvo for um WorldObject) */
  readonly underlyingObject?: WorldObject;
}

/**
 * Guarda de tipo para verificar se um objeto implementa a interface ToolTarget.
 */
export function isToolTarget(obj: unknown): obj is ToolTarget {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.targetType === 'string' &&
    typeof candidate.targetId === 'string' &&
    typeof candidate.getTargetBounds === 'function' &&
    typeof candidate.canReceiveToolAction === 'function' &&
    typeof candidate.receiveToolAction === 'function'
  );
}
