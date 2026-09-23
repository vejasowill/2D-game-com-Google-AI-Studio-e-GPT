import { PlaceableTileDefinition } from './PlaceableTileDefinition.ts';
import { TileType } from './types.ts';

/**
 * Bloco técnico padrão para piso de madeira inicial (atende ao requisito de exemplo real funcional).
 */
export const WOODEN_FLOOR_PLACEABLE: PlaceableTileDefinition = Object.freeze({
  id: 'wooden_floor',
  resultingTileType: TileType.WOOD_FLOOR,
  requiredItemId: 'wood',
  requiredQuantity: 1,
  walkable: true,
  maxPlacementRange: 64, // 2 tiles de alcance (TILE_SIZE = 32)
  canReplaceModified: false,
  dropItemIdOnBreak: 'wood',
  dropQuantityOnBreak: 1,
  restoredTileTypeOnBreak: TileType.GRASS,
});

/**
 * Registro central e estático de definições de blocos colocáveis.
 *
 * Responsabilidades:
 * 1. Mapeamento de id -> PlaceableTileDefinition;
 * 2. Mapeamento de requiredItemId -> PlaceableTileDefinition (para lookup O(1) com base no item da hotbar);
 * 3. Impedir duplicações e assegurar determinismo;
 * 4. Permitir extensões no futuro (pedra, paredes, móveis) sem alterar sistemas lógicos.
 */
export class PlaceableTileRegistry {
  private static readonly byId: Map<string, PlaceableTileDefinition> = new Map();
  private static readonly byItemId: Map<string, PlaceableTileDefinition> = new Map();
  private static isInitialized = false;

  public static ensureInitialized(): void {
    if (this.isInitialized) {
      return;
    }
    this.register(WOODEN_FLOOR_PLACEABLE);
    this.isInitialized = true;
  }

  /**
   * Registra uma nova definição de bloco colocável.
   */
  public static register(definition: PlaceableTileDefinition): void {
    if (!definition || !definition.id || !definition.requiredItemId) {
      throw new Error('[PlaceableTileRegistry] Definição de bloco inválida.');
    }
    this.byId.set(definition.id, definition);
    this.byItemId.set(definition.requiredItemId, definition);
  }

  /**
   * Consulta uma definição pelo ID do bloco.
   */
  public static get(id: string): PlaceableTileDefinition | null {
    this.ensureInitialized();
    return this.byId.get(id) || null;
  }

  /**
   * Consulta a definição de bloco colocável associada a determinado item do inventário.
   */
  public static getByItemId(itemId: string): PlaceableTileDefinition | null {
    this.ensureInitialized();
    return this.byItemId.get(itemId) || null;
  }

  /**
   * Verifica se existe um bloco colocável para determinado item.
   */
  public static hasPlaceableForItem(itemId: string): boolean {
    this.ensureInitialized();
    return this.byItemId.has(itemId);
  }

  /**
   * Retorna todas as definições registradas.
   */
  public static getAll(): readonly PlaceableTileDefinition[] {
    this.ensureInitialized();
    return Array.from(this.byId.values());
  }

  /**
   * Limpa todos os registros (utilizado prioritariamente em testes unitários isolados).
   */
  public static clear(): void {
    this.byId.clear();
    this.byItemId.clear();
    this.isInitialized = false;
  }
}
