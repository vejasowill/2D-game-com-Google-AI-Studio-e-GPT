import {
  EMPTY_TILE_DEFINITION,
  GRASS_TILE_DEFINITION,
  TileDefinition,
  TILLED_SOIL_TILE_DEFINITION,
  WATER_TILE_DEFINITION,
  WOOD_FLOOR_TILE_DEFINITION,
} from './TileDefinition.ts';
import { TileType } from './types.ts';

/**
 * Registro centralizado de definições de tiles.
 * Permite que Renderer, World, Player e futuros sistemas (como Colisão,
 * Pathfinding e Biomas) consultem as propriedades de um TileType
 * sem duplicação de regras ou acoplamento indevido.
 */
export class TileRegistry {
  private static readonly definitions: Map<TileType, TileDefinition> = new Map();
  private static isInitialized = false;

  private static ensureInitialized(): void {
    if (this.isInitialized) {
      return;
    }
    this.register(GRASS_TILE_DEFINITION);
    this.register(WATER_TILE_DEFINITION);
    this.register(EMPTY_TILE_DEFINITION);
    this.register(WOOD_FLOOR_TILE_DEFINITION);
    this.register(TILLED_SOIL_TILE_DEFINITION);
    this.isInitialized = true;
  }

  /**
   * Registra uma nova definição de tile.
   */
  public static register(definition: TileDefinition): void {
    this.definitions.set(definition.type, definition);
  }

  /**
   * Obtém a definição estática associada a um determinado TileType.
   */
  public static get(type: TileType): TileDefinition {
    this.ensureInitialized();
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new Error(`TileDefinition not registered for TileType: ${type}`);
    }
    return definition;
  }

  /**
   * Verifica se determinado TileType possui registro de definição.
   */
  public static has(type: TileType): boolean {
    this.ensureInitialized();
    return this.definitions.has(type);
  }
}
