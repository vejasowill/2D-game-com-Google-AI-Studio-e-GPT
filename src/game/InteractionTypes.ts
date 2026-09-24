import { TileType, WorldBounds, WorldCoord } from './types.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';

/**
 * Definição declarativa dos metadados de uma interação.
 * Independente de tipos concretos como árvores, NPCs, baús ou itens.
 */
export interface InteractionDefinition {
  /** Identificador único do tipo de interação (ex: 'inspect', 'talk', 'open', 'harvest') */
  readonly id: string;

  /** Rótulo legível da ação para exibição em prompts ou UI (ex: 'Inspecionar', 'Falar', 'Abrir') */
  readonly label: string;

  /**
   * Alcance máximo específico para esta interação em pixels (opcional).
   * Se não for definido, o sistema utiliza o alcance padrão do Player.
   */
  readonly range?: number;

  /**
   * Prioridade de seleção para desempate quando múltiplos objetos estão ao alcance.
   * Valores maiores indicam maior prioridade (padrão: 0).
   */
  readonly priority?: number;
}

/**
 * Contexto fornecido no momento da execução ou validação da interação.
 * Fornece acesso ao Player, ao World e ao WorldObject alvo.
 * Extensível futuramente para incluir ferramentas, inventário, itens segurados, etc.
 */
export interface InteractionContext {
  readonly player: Player;
  readonly world: World;
  readonly object: WorldObject;
  /** Parâmetros ou dados arbitrários futuros */
  readonly customArgs?: Readonly<Record<string, unknown>>;
}

/**
 * Tipos de mutação controlada que uma interação ou ação de gameplay pode solicitar ao mundo.
 */
export type WorldMutationType =
  | 'create_object'
  | 'remove_object'
  | 'update_position'
  | 'update_state'
  | 'modify_tile';

/** Mutação para criar/adicionar um novo WorldObject no mundo */
export interface CreateObjectMutation {
  readonly type: 'create_object';
  readonly object: WorldObject;
}

/** Mutação para remover um WorldObject do mundo por seu ID estável */
export interface RemoveObjectMutation {
  readonly type: 'remove_object';
  readonly objectId: string;
  /** Indica se a remoção deve ser registrada como destruição permanente de objeto natural */
  readonly permanent?: boolean;
}

/** Mutação para mover um WorldObject mantendo seus índices espaciais consistentes */
export interface UpdatePositionMutation {
  readonly type: 'update_position';
  readonly objectId: string;
  readonly newPosition: WorldCoord;
}

/** Mutação para atualizar o estado de um WorldObject */
export interface UpdateStateMutation {
  readonly type: 'update_state';
  readonly objectId: string;
  readonly statePatch: Readonly<Record<string, unknown>>;
}

/** Mutação para modificar o tipo de terreno de uma célula (tile) global do mundo */
export interface ModifyTileMutation {
  readonly type: 'modify_tile';
  readonly tileX: number;
  readonly tileY: number;
  readonly newTileType: TileType;
  readonly previousTileType?: TileType;
}

/** Mutação declarativa para restaurar o terreno de uma célula global ao seu estado anterior registrado */
export interface RestoreTileMutation {
  readonly type: 'restore_tile';
  readonly tileX: number;
  readonly tileY: number;
}

/** Mutação declarativa para plantar uma cultura agrícola em uma célula de terreno */
export interface PlantCropMutation {
  readonly type: 'plant_crop';
  readonly tileX: number;
  readonly tileY: number;
  readonly cropId: string;
  readonly plantedAt: number;
}

/** Mutação declarativa para regar uma cultura agrícola em uma célula de terreno */
export interface WaterCropMutation {
  readonly type: 'water_crop';
  readonly tileX: number;
  readonly tileY: number;
  readonly wateredAt: number;
}

/** Mutação declarativa para remover uma cultura agrícola de uma célula de terreno */
export interface RemoveCropMutation {
  readonly type: 'remove_crop';
  readonly tileX: number;
  readonly tileY: number;
}

/**
 * União discriminada de todas as mutações possíveis no estado dos objetos do mundo.
 * O executor aplica essas mutações através do WorldObjectManager preservando o particionamento espacial.
 */
export type WorldMutation =
  | CreateObjectMutation
  | RemoveObjectMutation
  | UpdatePositionMutation
  | UpdateStateMutation
  | ModifyTileMutation
  | RestoreTileMutation
  | PlantCropMutation
  | WaterCropMutation
  | RemoveCropMutation;

/**
 * Estrutura extensível de resultado da execução de uma interação.
 * Nunca limitada a um simples booleano.
 */
export interface InteractionResult {
  /** Indica se a interação foi executada com sucesso */
  readonly success: boolean;

  /** ID da interação executada */
  readonly interactionId: string;

  /** Rótulo da ação que foi executada */
  readonly actionLabel?: string;

  /** Mensagem contextual resultante (ex: feedback para o jogador ou logs de debug) */
  readonly message?: string;

  /** Categoria ou código do resultado para branching futuro (ex: 'inspected', 'dialogue_started', etc.) */
  readonly code?: string;

  /** Mutações no mundo que devem ser aplicadas como consequência desta interação */
  readonly mutations?: readonly WorldMutation[];

  /** Patch direto de estado para o próprio objeto alvo interagido (atalho conveniente) */
  readonly statePatch?: Readonly<Record<string, unknown>>;

  /** Payload de dados arbitrários retornados pelo comportamento do objeto */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Limites geométricos customizados para a área de interação física do objeto.
 * Permite que a área de interação seja completamente desacoplada da hitbox física e do sprite.
 */
export interface InteractionBounds {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Contrato genérico para qualquer objeto interativo no mundo.
 * O Player e o InteractionSystem interagem exclusivamente através desta interface,
 * sem nunca verificar 'object.type === ...'.
 */
export interface Interactable {
  /** Metadados declarativos da interação */
  readonly interaction: InteractionDefinition;

  /**
   * Caixa delimitadora de interação opcional.
   * Se não for fornecida, utiliza os limites físicos padrão do WorldObject (position, width, height).
   */
  readonly interactionBounds?: InteractionBounds;

  /**
   * Verifica se a interação está disponível no momento atual.
   * Permite condições futuras como "precisa de ferramenta", "está trancado", "NPC ocupado", etc.
   * Se não for implementado, assume-se que está sempre disponível (true).
   */
  canInteract?(context: InteractionContext): boolean;

  /**
   * Executa a interação e retorna o resultado estruturado.
   */
  interact(context: InteractionContext): InteractionResult;
}

/**
 * União de um WorldObject que implementa o contrato Interactable.
 */
export type InteractiveWorldObject = WorldObject & Interactable;

/**
 * Type guard puro para verificar deterministicamente se um objeto satisfaz o contrato Interactable.
 */
export function isInteractable(obj: unknown): obj is InteractiveWorldObject {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const candidate = obj as Partial<InteractiveWorldObject>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.position === 'object' &&
    candidate.position !== null &&
    typeof candidate.interact === 'function' &&
    typeof candidate.interaction === 'object' &&
    candidate.interaction !== null &&
    typeof candidate.interaction.id === 'string' &&
    typeof candidate.interaction.label === 'string'
  );
}

/**
 * Obtém os limites espaciais mundiais (AABB) da área de interação de um WorldObject.
 */
export function getObjectInteractionWorldBounds(obj: WorldObject): WorldBounds {
  const candidate = obj as Partial<InteractiveWorldObject>;
  if (candidate.interactionBounds) {
    const minX = obj.position.worldX + candidate.interactionBounds.offsetX;
    const minY = obj.position.worldY + candidate.interactionBounds.offsetY;
    const width = candidate.interactionBounds.width;
    const height = candidate.interactionBounds.height;
    return {
      minX,
      minY,
      maxX: minX + width,
      maxY: minY + height,
      width,
      height,
    };
  }

  return {
    minX: obj.position.worldX,
    minY: obj.position.worldY,
    maxX: obj.position.worldX + obj.width,
    maxY: obj.position.worldY + obj.height,
    width: obj.width,
    height: obj.height,
  };
}
