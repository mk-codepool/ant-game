export interface MouseCallbacks {
  move?: () => void;
  up?: (coords: { x: number; y: number }) => void;
  down?: (coords: { x: number; y: number }) => void;
}

export interface MouseControllerConfig {
  ctx?: CanvasRenderingContext2D;
  callbacks?: MouseCallbacks;
}

export default class MouseController {
  ctx: CanvasRenderingContext2D | null = null;
  x = 0;
  y = 0;
  callbacks: Required<MouseCallbacks> = {
    move: () => { },
    up: () => { },
    down: () => { },
  };

  setConfig = (config: MouseControllerConfig) => {
    const {
      ctx,
      callbacks,
    } = config;

    if (ctx) {
      this.ctx = ctx;
    }

    if (callbacks) {
      this.callbacks = {
        ...this.callbacks,
        ...callbacks,
      };
    }

    if (this.ctx) {
      this.addMouseListeners();
    }
  }

  addMouseListeners = () => {
    if (!this.ctx) return;

    this.ctx.canvas.addEventListener('mousemove', (e) => {
      this.x = e.offsetX;
      this.y = e.offsetY;
      this.callbacks.move();
    });

    this.ctx.canvas.addEventListener('mouseup', (e) => {
      this.x = e.offsetX;
      this.y = e.offsetY;
      this.callbacks.up({
        x: e.offsetX,
        y: e.offsetY,
      });
    });

    this.ctx.canvas.addEventListener('mousedown', (e) => {
      this.x = e.offsetX;
      this.y = e.offsetY;
      this.callbacks.down({
        x: e.offsetX,
        y: e.offsetY,
      });
    });
  }
}
