import { Component, ElementRef, ViewChild, type AfterViewInit, type OnDestroy, NgZone } from '@angular/core';
import * as BABYLON from '@babylonjs/core';
import GE from '../game-engine';
import { BabylonRenderer } from '../game-engine/rendering/babylon-renderer';

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
      display: grid;
    }
    .the-canvas {
      display: block;
      width: 100%;
      height: 100%;
      outline: none;
      background-color: #1a1a1a;
    }
  `]
})
export class CanvasContainerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('containerRef') containerRef!: ElementRef<HTMLDivElement>;

  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private renderer!: BabylonRenderer;

  constructor(private ngZone: NgZone) { }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;

    setTimeout(async () => {
      GE.setConfig({
        borderX: 4000,
        borderY: 4000,
      });

      // Try to restore from autosave before starting
      await GE.autoRestore();

      this.ngZone.runOutsideAngular(() => {
        this.initBabylon(canvas, container.offsetWidth, container.offsetHeight);
      });
    }, 100);
  }

  ngOnDestroy(): void {
    window.removeEventListener("resize", this.onResize);
    if (this.scene) {
      this.scene.dispose();
    }
    if (this.engine) {
      this.engine.dispose();
    }
  }

  private onResize = () => {
    if (this.engine) {
      this.engine.resize();
    }
  }

  private initBabylon(canvas: HTMLCanvasElement, width: number, height: number) {
    this.engine = new BABYLON.Engine(canvas, true);
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.1, 1);

    // Setup Camera
    const mapWidth = 4000;
    const mapHeight = 4000;
    const target = new BABYLON.Vector3(mapWidth / 2, 0, mapHeight / 2);
    const camera = new BABYLON.ArcRotateCamera(
      "MainCamera",
      -Math.PI / 2, // alpha
      Math.PI / 4,  // beta
      Math.max(width, height) * 0.8, // radius
      target,
      this.scene
    );
    // Lock rotation to give StarCraft 2 isometric feel
    camera.lowerAlphaLimit = -Math.PI / 2;
    camera.upperAlphaLimit = -Math.PI / 2;
    camera.lowerBetaLimit = Math.PI / 5;
    camera.upperBetaLimit = Math.PI / 5;
    
    // Enable panning using Left Drag or Right Drag
    camera.panningSensibility = 10;
    
    // Restrict panning strictly to the X/Z ground plane (no flying into the sky)
    camera.panningAxis = new BABYLON.Vector3(1, 0, 1);
    
    // Default ArcRotateCamera uses left click to rotate, right click to pan.
    // If rotation is locked, we can assign left click (0) and right click (2) to pan.
    camera.attachControl(canvas, true);
    const pointers = camera.inputs.attached['pointers'] as any;
    if (pointers) {
       pointers.buttons = [0, 1, 2]; // All buttons can try to trigger actions, but rotation is locked
       pointers.multiTouchPanning = true;
       // We'll let left drag be handled by default since rotation is locked? 
       // Actually, ArcRotateCameraPointersInput defaults to panning on ctrl+double click or right click.
       // We can change the panning button to Left Click (0):
       pointers.panningSensibility = 10;
    }

    // However, to natively override panning to Left Click while still allowing our pointer down to fire for painting:
    // Left drag pans the camera, but click/drag also emits pointer down for painting.
    
    // Important: To make left click pan, we must change the attached pointers internal mapping
    if (pointers) {
       pointers._panningMouseButton = 0; // Force left button panning
    }

    camera.wheelPrecision = 20;
    camera.lowerRadiusLimit = 50;
    camera.upperRadiusLimit = 4000;

    // Setup Lighting
    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), this.scene);
    light.intensity = 0.8;
    light.specular = new BABYLON.Color3(0.1, 0.1, 0.1);

    // Create custom renderer to map 2D GE logic to 3D meshes
    this.renderer = new BabylonRenderer(this.scene);
    this.renderer.init();

    // Connect GE tick to Babylon's loop
    this.scene.onBeforeRenderObservable.add(() => {
      // Get delta time in seconds
      const dt = this.engine.getDeltaTime() / 1000;
      GE.tick(dt);
      this.renderer.sync();
    });

    window.addEventListener("resize", this.onResize);

    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }
}
