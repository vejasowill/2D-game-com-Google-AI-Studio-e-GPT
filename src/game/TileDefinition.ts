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

/**
 * Definição estática do tipo de terreno EMPTY (terreno removido/vazio/buraco).
 * Não caminhável por padrão.
 */
export const EMPTY_TILE_DEFINITION: TileDefinition = {
  type: TileType.EMPTY,
  walkable: false,
  movementCost: Infinity,
  color: '#18181b',
  borderColor: '#09090b',
};

/**
 * Definição estática do tipo de terreno WOOD_FLOOR (assoalho/piso de madeira colocado).
 * Caminhável por padrão com custo de movimento regular.
 */
export const WOOD_FLOOR_TILE_DEFINITION: TileDefinition = {
  type: TileType.WOOD_FLOOR,
  walkable: true,
  movementCost: 1.0,
  color: '#854d0e',
  borderColor: '#713f12',
};

/**
 * Definição estática do tipo de terreno TILLED_SOIL (solo arado/preparado para cultivo).
 * Caminhável por padrão com custo de movimento regular.
 */
export const TILLED_SOIL_TILE_DEFINITION: TileDefinition = {
  type: TileType.TILLED_SOIL,
  walkable: true,
  movementCost: 1.0,
  color: '#5c3d1e',
  borderColor: '#42280d',
};


