import { Subject } from 'rxjs';

export interface MouseControllerConfig {
  ctx?: CanvasRenderingContext2D;
}

export default class MouseController {
  ctx: CanvasRenderingContext2D | null = null;
  x = 0;
  y = 0;

  private moveSubject = new Subject<{ x: number; y: number }>();
  private upSubject = new Subject<{ x: number; y: number }>();
  private downSubject = new Subject<{ x: number; y: number }>();

  onMouseMove = this.moveSubject.asObservable();
  onMouseUp = this.upSubject.asObservable();
  onMouseDown = this.downSubject.asObservable();

  setConfig = (config: MouseControllerConfig) => {
    const {
      ctx,
    } = config;

    if (ctx) {
      this.ctx = ctx;
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
      this.moveSubject.next({ x: this.x, y: this.y });
    });

    this.ctx.canvas.addEventListener('mouseup', (e) => {
      this.x = e.offsetX;
      this.y = e.offsetY;
      this.upSubject.next({ x: this.x, y: this.y });
    });

    this.ctx.canvas.addEventListener('mousedown', (e) => {
      this.x = e.offsetX;
      this.y = e.offsetY;
      this.downSubject.next({ x: this.x, y: this.y });
    });
  }
}
