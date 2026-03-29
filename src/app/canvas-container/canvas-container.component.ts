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

    const { world } = GE;
    const { fauna, flora, terrain } = world;
    const creatures = fauna.creatures;
    const plants = flora.plants;
    const cells = Object.values(terrain.cells);
    const canvas = this.canvasRef.nativeElement;

    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Terrain
    cells.forEach((cell: any) => {
      this.ctx.fillStyle = cell.color || '#000';
      this.ctx.fillRect(
        cell.cx * terrain.cellSize,
        cell.cy * terrain.cellSize,
        terrain.cellSize,
        terrain.cellSize
      );
    });

    creatures.forEach((creature: any) => {
      // Draw vision cone first (behind creature)
      this.drawVisionCone(creature);

      // Draw creature with color based on energy level
      // Use a gradient from dark red (low energy) to bright green (high energy)
      const maxEnergy = 250; // Expected max energy (a bit over plant energy for headroom)
      const energyPercent = Math.min(1, Math.max(0, creature.lifeEnergy / maxEnergy));

      if (creature.lifeEnergy <= 0) {
        // Dead - very transparent black
        this.ctx.fillStyle = 'rgba(0, 0, 0, .05)';
      } else {
        // Use HSL for smooth color gradient
        // Hue: 0 (red) at low energy → 120 (green) at high energy
        const hue = energyPercent * 120;
        // Saturation: 70% for vibrant colors
        const saturation = 70;
        // Lightness: 30% at low energy → 50% at high energy (darker when low)
        const lightness = 30 + (energyPercent * 20);

        this.ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      }

      this.ctx.save();
      this.ctx.fillRect(creature.position.x, creature.position.y, 4, 4);
      this.ctx.restore();
    });

    plants.forEach((plant: any) => {
      this.ctx.fillStyle = plant.lifeEnergy ? 'rgba(96, 154, 45, 1)' : 'rgba(0, 0, 0, 1)';
      this.ctx.save();
      this.ctx.fillRect(plant.position.x - 6, plant.position.y - 6, 11, 11);
      this.ctx.restore(); // Added restore
    });

    this.animationFrameId = requestAnimationFrame(this.draw);
  }

  /**
   * Draw the vision cone for a creature
   */
  drawVisionCone = (creature: any) => {
    if (!creature.vision || creature.lifeEnergy <= 0) return;

    const { position, vision } = creature;
    const directionAngle = vision.getDirectionAngle();
    const startAngle = directionAngle - vision.angle / 2;
    const endAngle = directionAngle + vision.angle / 2;

    this.ctx.save();

    // Set fill style based on creature energy (more transparent when low energy)
    const alpha = Math.min(0.15, creature.lifeEnergy / 100);
    this.ctx.fillStyle = `rgba(255, 255, 100, ${alpha})`;

    // Draw vision cone
    this.ctx.beginPath();
    this.ctx.moveTo(position.x + 2, position.y + 2); // Center of creature (offset for 4x4 size)
    this.ctx.arc(position.x + 2, position.y + 2, vision.range, startAngle, endAngle);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }
}
