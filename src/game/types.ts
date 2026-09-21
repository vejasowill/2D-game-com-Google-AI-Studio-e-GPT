export interface ViewportSize {
  width: number;
  height: number;
}

export interface GameLoopCallbacks {
  update: (deltaTime: number) => void;
  render: () => void;
}
