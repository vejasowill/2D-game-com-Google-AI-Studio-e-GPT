export enum TileType {
  GRASS = 'GRASS',
}

export interface Tile {
  type: TileType;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface GameLoopCallbacks {
  update: (deltaTime: number) => void;
  render: () => void;
}
