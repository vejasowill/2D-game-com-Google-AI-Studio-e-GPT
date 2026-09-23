import { TileType } from './types.ts';

/**
 * Razões formais de falha controlada para a tentativa de colocação de um bloco/tile.
 */
export type PlaceTileFailureReason =
  | 'NO_SELECTION'
  | 'INVALID_COORDINATES'
  | 'NO_ITEM_EQUIPPED'
  | 'NOT_PLACEABLE'
  | 'INSUFFICIENT_QUANTITY'
  | 'OUT_OF_RANGE'
  | 'ALREADY_TARGET_TYPE'
  | 'TILE_ALREADY_MODIFIED'
  | 'INVALID_SOURCE_TILE'
  | 'DISALLOWED_SOURCE_TILE'
  | 'WOULD_COLLIDE_WITH_PLAYER'
  | 'CUSTOM_VALIDATION_FAILED'
  | 'MUTATION_FAILED';

/**
 * Contexto de validação para extensões puras ou predicados customizados de colocação.
 */
export interface PlaceTileValidationContext {
  readonly tileX: number;
  readonly tileY: number;
  readonly currentTileType: TileType;
  readonly definition: PlaceableTileDefinition;
  readonly playerFootX: number;
  readonly playerFootY: number;
}

/**
 * Definição abstrata e declarativa de um tipo de bloco/terreno colocável pelo jogador.
 *
 * Princípios arquiteturais:
 * 1. Desacoplado de ItemDefinition (o item representa o recurso no inventário, o bloco representa o resultado espacial).
 * 2. Totalmente configurável: nenhuma regra hardcoded em sistemas de gameplay (sem 'if item === "wood"').
 * 3. Estruturado para permitir no futuro novos blocos (pedra, paredes, cercas, pisos decorativos).
 * 4. Contém metadados declarativos para futura remoção/quebra sem alterar sistemas de colocação.
 */
export interface PlaceableTileDefinition {
  /** Identificador único do bloco colocável (ex: 'wooden_floor', 'stone_floor') */
  readonly id: string;

  /** Tipo de tile resultante que será gravado no World */
  readonly resultingTileType: TileType;

  /** Identificador do item necessário no inventário/hotbar para a ação (ex: 'wood', 'stone') */
  readonly requiredItemId: string;

  /** Quantidade necessária por bloco (padrão: 1) */
  readonly requiredQuantity?: number;

  /** Indica se o bloco colocado permite passagem de entidades físicas */
  readonly walkable: boolean;

  /** Identificador opcional do asset visual do sprite */
  readonly spriteAssetId?: string;

  /** Alcance físico máximo de colocação a partir do jogador (em pixels). Padrão global se omitido. */
  readonly maxPlacementRange?: number;

  /**
   * Permite ou impede a sobreposição de um tile que já possui modificação registrada.
   * Por padrão é false (impede substituição arbitrária de modificações prévias).
   */
  readonly canReplaceModified?: boolean;

  /**
   * Lista branca opcional de tipos de terreno onde este bloco pode ser assentado.
   * Se indefinido, pode ser colocado sobre qualquer terreno válido não proibido.
   */
  readonly allowedSourceTileTypes?: readonly TileType[];

  /**
   * Lista negra opcional de tipos de terreno sobre os quais este bloco NÃO pode ser assentado.
   */
  readonly disallowedSourceTileTypes?: readonly TileType[];

  /**
   * Predicado customizado opcional para validações específicas futuras.
   */
  readonly customValidator?: (context: PlaceTileValidationContext) => boolean;

  // =========================================================================
  // PREPARAÇÃO ARQUITETURAL PARA FUTURA REMOÇÃO/QUEBRA DE BLOCOS (Requisito 9)
  // Permite que no futuro um sistema de quebra consulte a definição para:
  // bloco colocado -> remover -> devolver item -> restaurar tile anterior
  // =========================================================================

  /** ID do item a ser devolvido ao quebrar este bloco no futuro */
  readonly dropItemIdOnBreak?: string;

  /** Quantidade do item devolvido ao quebrar este bloco no futuro */
  readonly dropQuantityOnBreak?: number;

  /** Tipo de terreno a ser restaurado ao remover este bloco no futuro */
  readonly restoredTileTypeOnBreak?: TileType;
}

/**
 * Resultado completo e determinístico de uma tentativa de colocação de bloco.
 */
export interface PlaceTileResult {
  /** Indica se a operação foi autorizada e concluída com sucesso */
  readonly success: boolean;

  /** Coordenadas espaciais do tile alvo */
  readonly tileX: number;
  readonly tileY: number;

  /** Definição do bloco utilizado (se identificada) */
  readonly definition?: PlaceableTileDefinition;

  /** Tipo do terreno anterior no local */
  readonly previousTileType?: TileType;

  /** Tipo do terreno após a aplicação */
  readonly resultingTileType?: TileType;

  /** Item consumido do inventário */
  readonly consumedItemId?: string;

  /** Quantidade consumida */
  readonly consumedAmount?: number;

  /** Razão formal em caso de insucesso */
  readonly failureReason?: PlaceTileFailureReason;
}
