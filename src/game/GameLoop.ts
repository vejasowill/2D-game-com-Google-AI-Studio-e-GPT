import { GameLoopCallbacks } from './types.ts';

export class GameLoop {
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private readonly maxDeltaTime: number = 0.1; // Cap delta time to 100ms to avoid simulation spikes

  private readonly onUpdate: (deltaTime: number) => void;
  private readonly onRender: () => void;

  constructor(callbacks: GameLoopCallbacks) {
    this.onUpdate = callbacks.update;
    this.onRender = callbacks.render;
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop = (timestamp: number): void => {
    if (!this.isRunning) return;

    // Calculate delta time in seconds
    let deltaTime = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Clamp delta time to avoid large skips (e.g., when switching tabs)
    if (deltaTime > this.maxDeltaTime) {
      deltaTime = this.maxDeltaTime;
    }

    // Step 1: Update game logic
    this.onUpdate(deltaTime);

    // Step 2: Render visual state
    this.onRender();

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.loop);
  };
}
