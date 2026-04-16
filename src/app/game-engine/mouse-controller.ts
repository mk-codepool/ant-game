import { Subject } from 'rxjs';

export interface MouseControllerConfig {
  // Config properties if needed later
}

export default class MouseController {
  x = 0;
  y = 0;

  private moveSubject = new Subject<{ x: number; y: number }>();
  private upSubject = new Subject<{ x: number; y: number }>();
  private downSubject = new Subject<{ x: number; y: number }>();

  onMouseMove = this.moveSubject.asObservable();
  onMouseUp = this.upSubject.asObservable();
  onMouseDown = this.downSubject.asObservable();

  setConfig = (config: MouseControllerConfig) => {
    // Config no longer requires DOM context
  }

  triggerMove = (x: number, y: number) => {
    this.x = x;
    this.y = y;
    this.moveSubject.next({ x, y });
  }

  triggerUp = (x: number, y: number) => {
    this.x = x;
    this.y = y;
    this.upSubject.next({ x, y });
  }

  triggerDown = (x: number, y: number) => {
    this.x = x;
    this.y = y;
    this.downSubject.next({ x, y });
  }
}
