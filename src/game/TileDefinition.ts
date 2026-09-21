import { TileType } from './types.ts';

/**
 * Propriedades estáticas de um tipo de terreno no jogo.
 * Separadas do estado individual de cada célula do World para escalabilidade de memória.
 */
export interface TileDefinition {
  readonly type: TileType;
  readonly walkable: boolean;
  readonly movementCost: number;
  readonly color: string;
  readonly borderColor?: string;
}

/**
 * Definição estática do tipo de terreno GRASS (grama).
 */
export const GRASS_TILE_DEFINITION: TileDefinition = {
  type: TileType.GRASS,
  walkable: true,
  movementCost: 1.0,
  color: '#2e7d32',
  borderColor: '#256629',
};

/**
 * Definição estática do tipo de terreno WATER (água).
 * Não caminhável por padrão.
 */
export const WATER_TILE_DEFINITION: TileDefinition = {
  type: TileType.WATER,
  walkable: false,
  movementCost: Infinity,
  color: '#0284c7',
  borderColor: '#0369a1',
};
