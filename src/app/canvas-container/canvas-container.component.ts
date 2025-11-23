import { Component, ElementRef, ViewChild, type AfterViewInit, type OnDestroy, NgZone } from '@angular/core';
import GE from '../game-engine';

@Component({
  selector: 'app-canvas-container',
  standalone: true,
  template: `
    <div class="canvas-container" #containerRef>
      <canvas #canvasRef class="the-canvas"></canvas>
    </div>
  `,
  styles: [`
    .canvas-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
      position: relative;
      display: grid; /* From original styles */
    }
    .the-canvas {
      display: block;
      background-color: #ccc; /* From original styles */
    }
  `]
})
export class CanvasContainerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('containerRef') containerRef!: ElementRef<HTMLDivElement>;

  private ctx!: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;

  constructor(private ngZone: NgZone) { }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    // Set initial size
    setTimeout(() => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;

      GE.setConfig({
        borderX: container.offsetWidth,
        borderY: container.offsetHeight,
        ctx: this.ctx,
      });

      this.ngZone.runOutsideAngular(() => {
        this.draw();
      });
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  draw = () => {
    if (!this.canvasRef?.nativeElement) {
      return;
    }

    const { faunaAndFlora } = GE;
    const { creatures, plants } = faunaAndFlora;
    const canvas = this.canvasRef.nativeElement;

    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    creatures.forEach((creature: any) => {
      if (creature.lifeEnergy > 15 && creature.lifeEnergy <= 20) {
        this.ctx.fillStyle = 'rgba(199, 0, 0, 1)';
      } else if (creature.lifeEnergy > 10 && creature.lifeEnergy <= 15) {
        this.ctx.fillStyle = 'rgba(165, 34, 34, 1)';
      } else if (creature.lifeEnergy > 5 && creature.lifeEnergy <= 10) {
        this.ctx.fillStyle = 'rgba(126, 73, 73, 1)';
      } else if (creature.lifeEnergy > 0 && creature.lifeEnergy <= 5) {
        this.ctx.fillStyle = 'rgba(26, 15, 15, 1)';
      } else if (creature.lifeEnergy <= 0) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, .05)';
      }
      this.ctx.save();
      this.ctx.fillRect(creature.x, creature.y, 4, 4);
      this.ctx.restore(); // Added restore, good practice
    });

    plants.forEach((plant: any) => {
      this.ctx.fillStyle = plant.lifeEnergy ? 'rgba(96, 154, 45, 1)' : 'rgba(0, 0, 0, 1)';
      this.ctx.save();
      this.ctx.fillRect(plant.x - 6, plant.y - 6, 11, 11);
      this.ctx.restore(); // Added restore
    });

    this.animationFrameId = requestAnimationFrame(this.draw);
  }
}
