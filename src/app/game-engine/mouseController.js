export default class MouseController {
  ctx = null;
  x = 0;
  y = 0;
  callbacks = {
    move: () => {},
    up: () => {},
    down: () => {},
  };

  setConfig = (config) => {
    const {
      ctx,
      callbacks,
    } = config;

    this.ctx = ctx;
    this.callbacks = {
      ...this.callbacks,
      ...callbacks,
    }

    if (this.ctx) {
      this.addMouseListeners();
    }
  }

  addMouseListeners = () => {
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