import { ItemStack } from './ItemStack.ts';
import { WorldMutation } from './InteractionTypes.ts';
import { Tile, TileType, WorldCoord } from './types.ts';

/**
 * Contexto declarativo fornecido para uma operação genérica de alteração ou remoção de terreno.
 * Permite que qualquer ferramenta, entidade ou ação configure suas regras sem lógica hardcoded.
 */
export interface TileOperationContext {
  /** Identificador da ação, ferramenta ou sistema solicitante (ex: 'player_action', 'pickaxe', 'shovel', 'debug') */
  readonly actionId?: string;

  /** Coordenada de origem da ação no espaço do mundo (para validação geométrica de alcance) */
  readonly sourcePosition?: WorldCoord;

  /** Alcance máximo permitido em pixels a partir de sourcePosition */
  readonly maxRange?: number;

  /** Tipo de tile substituto. Se omitido, aplica a transição padrão (GRASS -> EMPTY, ou WATER/EMPTY -> GRASS) */
  readonly replacementTileType?: TileType;

  /** Predicado customizado para validar se este tile específico pode ser removido neste contexto */
  readonly canRemovePredicate?: (currentTile: Tile, tileX: number, tileY: number) => boolean;

  /** Drops ou recursos declarativos a serem gerados caso a operação seja concluída com sucesso */
  readonly drops?: readonly ItemStack[];

  /** Se verdadeiro, não instancia os drops no mundo como ItemDropObjects automaticamente */
  readonly skipWorldDropSpawn?: boolean;

  /** Argumentos customizados adicionais para extensão futura */
  readonly customArgs?: Readonly<Record<string, unknown>>;
}

/**
 * Contrato declarativo do resultado de uma operação sobre tiles.
 * Desacoplado de efeitos colaterais arbitrários e contendo todo o histórico da mutação.
 */
export interface TileModificationResult {
  /** Indica se a operação sobre o terreno foi realizada com sucesso */
  readonly success: boolean;

  /** Coordenada global X do tile alvo */
  readonly tileX: number;

  /** Coordenada global Y do tile alvo */
  readonly tileY: number;

  /** Estado do tile antes da aplicação da operação (null se coordenada inválida) */
  readonly previousTile: Tile | null;

  /** Estado resultante do tile após a operação (null se rejeitada) */
  readonly newTile: Tile | null;

  /** Motivo da rejeição em caso de falha controlada */
  readonly failureReason?: string;

  /** Lista de itens produzidos declarativamente */
  readonly drops?: readonly ItemStack[];

  /** Mutações geradas para aplicação consistente via WorldMutationHandler */
  readonly mutations?: readonly WorldMutation[];
}
