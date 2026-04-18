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

  private readonly fallbackMapSize = 1000;
  private readonly initialCameraAlpha = -Math.PI / 4;
  private readonly initialCameraBeta = Math.PI / 4;
  private readonly initialRadiusMultiplier = 1.4;

  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private renderer!: BabylonRenderer;

  constructor(private ngZone: NgZone) { }

  ngAfterViewInit(): void {
    console.log('[DEBUG] ngAfterViewInit started');
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;

    setTimeout(async () => {
      console.log('[DEBUG] ngAfterViewInit setTimeout triggered');
      GE.setConfig({
        borderX: 1000,
        borderY: 1000,
      });

      // Try to restore from autosave before starting
      console.log('[DEBUG] Calling GE.autoRestore()');
      await GE.autoRestore();
      console.log('[DEBUG] GE.autoRestore() completed');

      this.ngZone.runOutsideAngular(() => {
        console.log('[DEBUG] Running outside angular to init Babylon');
        this.initBabylon(canvas, container.offsetWidth, container.offsetHeight);
      });
    }, 100);
  }

  ngOnDestroy(): void {
    window.removeEventListener("resize", this.onResize);
    if (this.renderer) {
      this.renderer.dispose();
    }
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
    console.log(`[DEBUG] initBabylon started: width=${width}, height=${height}`);
    this.engine = new BABYLON.Engine(canvas, true);
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.56, 0.78, 0.96, 1);

    console.log('[DEBUG] Scene and Engine created');
    // Setup Camera
    const { mapWidth, mapHeight } = this.getCurrentMapDimensions();
    const maxMapDimension = Math.max(mapWidth, mapHeight);
    const target = new BABYLON.Vector3(mapWidth / 2, 0, mapHeight / 2);
    const savedZoom = localStorage.getItem('ant-game-zoom');
    const defaultZoom = savedZoom ? parseInt(savedZoom, 10) : 600;
    const initialRadius = Math.min(Math.max(defaultZoom, 400), 1000);
    const camera = new BABYLON.ArcRotateCamera(
      "MainCamera",
      this.initialCameraAlpha, // alpha
      this.initialCameraBeta,  // beta
      initialRadius, // radius
      target,
      this.scene
    );
    (GE as any).camera = camera;
    // Lock rotation to give StarCraft 2 isometric feel
    camera.lowerAlphaLimit = this.initialCameraAlpha;
    camera.upperAlphaLimit = this.initialCameraAlpha;
    camera.lowerBetaLimit = this.initialCameraBeta;
    camera.upperBetaLimit = this.initialCameraBeta;

    // Switch to orthographic to eliminate perspective distortion
    camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

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

    camera.wheelPrecision = .2;
    camera.lowerRadiusLimit = 400;
    camera.upperRadiusLimit = 1000;

    // Ensure every full refresh starts from map center with default zoom/angle.
    this.resetCameraToMapCenter(camera, mapWidth, mapHeight, initialRadius);

    // Setup Lighting
    console.log('[DEBUG] Setting up lighting');
    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), this.scene);
    light.intensity = 0.8;
    light.specular = new BABYLON.Color3(0.1, 0.1, 0.1);

    // Create custom renderer to map 2D GE logic to 3D meshes
    console.log('[DEBUG] Initializing BabylonRenderer');
    this.renderer = new BabylonRenderer(this.scene);
    this.renderer.init();
    console.log('[DEBUG] BabylonRenderer Initialized');

    // Connect GE tick to Babylon's loop
    this.scene.onBeforeRenderObservable.add(() => {
      // Maintain orthographic projection zoom based on radius
      const aspect = this.engine.getRenderWidth() / this.engine.getRenderHeight();
      const orthoZoom = camera.radius / 2;
      camera.orthoLeft = -orthoZoom * aspect;
      camera.orthoRight = orthoZoom * aspect;
      camera.orthoBottom = -orthoZoom;
      camera.orthoTop = orthoZoom;

      (window as any)._debug_frame_count = ((window as any)._debug_frame_count || 0) + 1;
      if ((window as any)._debug_frame_count === 1) console.log('[DEBUG] First onBeforeRenderObservable fired');
      
      const dt = this.engine.getDeltaTime() / 1000;
      GE.tick(dt);
      this.renderer.sync();
    });

    window.addEventListener("resize", this.onResize);

    console.log('[DEBUG] Starting runRenderLoop');
    this.engine.runRenderLoop(() => {
      if ((window as any)._debug_render_loop === undefined) {
         (window as any)._debug_render_loop = true;
         console.log('[DEBUG] First runRenderLoop execution');
      }
      this.scene.render();
    });
  }

  private getCurrentMapDimensions(): { mapWidth: number; mapHeight: number } {
    return {
      mapWidth: GE.world.terrain.width || GE.world.worldBorders.xEnd || this.fallbackMapSize,
      mapHeight: GE.world.terrain.height || GE.world.worldBorders.yEnd || this.fallbackMapSize,
    };
  }

  private resetCameraToMapCenter(
    camera: BABYLON.ArcRotateCamera,
    mapWidth: number,
    mapHeight: number,
    radius: number
  ): void {
    camera.setTarget(new BABYLON.Vector3(mapWidth / 2, 0, mapHeight / 2));
    camera.alpha = this.initialCameraAlpha;
    camera.beta = this.initialCameraBeta;
    camera.radius = radius;
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  }
}
