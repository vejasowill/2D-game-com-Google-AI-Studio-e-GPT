export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;

  // Visual constants for the initial beta verification
  private readonly clearColor: string = '#121316';
  private readonly squareColor: string = '#22c55e';
  private readonly squareSize: number = 64;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to obtain CanvasRenderingContext2D.');
    }
    this.ctx = context;
    this.resize();
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    const displayWidth = parent ? parent.clientWidth : window.innerWidth;
    const displayHeight = parent ? parent.clientHeight : window.innerHeight;

    // Support devicePixelRatio for sharp rendering on mobile / high-DPI screens
    const dpr = window.devicePixelRatio || 1;
    this.width = displayWidth;
    this.height = displayHeight;

    this.canvas.width = Math.floor(displayWidth * dpr);
    this.canvas.height = Math.floor(displayHeight * dpr);
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public render(): void {
    // 1. Clear background
    this.ctx.fillStyle = this.clearColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 2. Render centered 64x64 green square
    const centerX = Math.floor((this.width - this.squareSize) / 2);
    const centerY = Math.floor((this.height - this.squareSize) / 2);

    this.ctx.fillStyle = this.squareColor;
    this.ctx.fillRect(centerX, centerY, this.squareSize, this.squareSize);
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }
}
