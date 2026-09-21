export enum TileType {
  GRASS = 'GRASS',
  WATER = 'WATER',
}

export type { TileDefinition } from './TileDefinition.ts';

export interface Tile {
  type: TileType;
}

/**
 * Coordenadas de grade do tile (índices inteiros na matriz, ex: 0..width-1, 0..height-1)
 */
export interface TileCoord {
  tileX: number;
  tileY: number;
}

/**
 * Coordenadas contínuas no espaço do mundo em pixels (ex: 0..width*TILE_SIZE)
 */
export interface WorldCoord {
  worldX: number;
  worldY: number;
}

/**
 * Coordenadas no espaço da tela/viewport em pixels (ex: 0..canvas.width)
 */
export interface ScreenCoord {
  screenX: number;
  screenY: number;
}

/**
 * Limites espaciais no sistema de coordenadas do mundo (em pixels)
 */
export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface Vector2D {
  x: number;
  y: number;
}

/**
 * Interface abstrata para provedores de entrada (Teclado, Toque, Joystick Virtual, etc.)
 */
export interface InputSource {
  getMovementDirection(): Vector2D;
  destroy?(): void;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface GameLoopCallbacks {
  update: (deltaTime: number) => void;
  render: () => void;
}
