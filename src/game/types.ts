export enum TileType {
  GRASS = 'GRASS',
  WATER = 'WATER',
  EMPTY = 'EMPTY',
  WOOD_FLOOR = 'WOOD_FLOOR',
}

export type { TileDefinition } from './TileDefinition.ts';

export interface Tile {
  type: TileType;
}

/**
 * Dados ambientais contínuos associados a uma coordenada global do mundo.
 * Todos os valores são estritamente normalizados no intervalo contínuo [0, 1).
 *
 * - temperature: 0.0 (frio/ártico) a ~0.999 (muito quente/árido).
 * - humidity: 0.0 (muito seco/árido) a ~0.999 (muito úmido/pluvioso).
 * - elevation: 0.0 (baixo/depressão/oceânico) a ~0.999 (altiplano/pico montanhoso).
 *   (Nota: 'elevation' é puramente um valor escalar ambiental top-down, sem dimensão Z visual).
 */
export interface EnvironmentalData {
  readonly temperature: number;
  readonly humidity: number;
  readonly elevation: number;
}

/**
 * Coordenadas de grade do tile (índices inteiros na matriz, ex: 0..width-1, 0..height-1)
 */
export interface TileCoord {
  tileX: number;
  tileY: number;
}

/**
 * Coordenadas de grade do chunk (índices inteiros no grid de chunks, ex: 0,0, -1,0)
 */
export interface ChunkCoord {
  chunkX: number;
  chunkY: number;
}

/**
 * Mapeamento de um tile para as coordenadas de seu Chunk e a posição local correspondente dentro dele.
 */
export interface ChunkTileCoord {
  chunkCoord: ChunkCoord;
  localX: number;
  localY: number;
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
  isActionPressed?(action: string): boolean;
  isActionJustPressed?(action: string): boolean;
  clearFrameState?(): void;
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
