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
  private readonly initialCameraBeta = Math.PI / 3;
  private readonly initialRadiusMultiplier = 1.4;

  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private renderer!: BabylonRenderer;

  private keysState: { [key: string]: boolean } = {
    w: false,
    a: false,
    s: false,
    d: false
  };
  private cameraVelocity = BABYLON.Vector3.Zero();
  private readonly maxCameraSpeed = 800; // units per second
  private readonly cameraAcceleration = 4000; // units per second squared
  private readonly cameraDeceleration = 4000;

  constructor(private ngZone: NgZone) { }

  ngAfterViewInit(): void {
    console.log('[DEBUG] ngAfterViewInit started');
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    setTimeout(async () => {
      console.log('[DEBUG] ngAfterViewInit setTimeout triggered');
      GE.setConfig({
        borderX: 5000,
        borderY: 5000,
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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
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

  private onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (this.keysState.hasOwnProperty(key)) {
      this.keysState[key] = true;
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (this.keysState.hasOwnProperty(key)) {
      this.keysState[key] = false;
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
    camera.lowerRadiusLimit = 50;
    camera.upperRadiusLimit = 1000;

    // Ensure every full refresh starts from map center with default zoom/angle.
    this.resetCameraToMapCenter(camera, mapWidth, mapHeight, initialRadius);

    // Setup Lighting
    console.log('[DEBUG] Setting up lighting');
    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), this.scene);
    light.intensity = 0.3; // Lowered to not wash out shadows
    light.specular = new BABYLON.Color3(0.05, 0.05, 0.05);

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

      const dt = this.engine.getDeltaTime() / 1000;

      // --- WASD Camera Movement ---
      let inputX = 0;
      let inputZ = 0;
      if (this.keysState['w']) inputZ += 1;
      if (this.keysState['s']) inputZ -= 1;
      if (this.keysState['a']) inputX -= 1;
      if (this.keysState['d']) inputX += 1;

      const inputVector = new BABYLON.Vector3(inputX, 0, inputZ);
      if (inputVector.length() > 0) {
        inputVector.normalize();
      }

      const zoomRatio = camera.radius / 600;
      const scaledMaxSpeed = this.maxCameraSpeed * zoomRatio;
      const targetVelocity = inputVector.scale(scaledMaxSpeed);

      const velocityDiff = targetVelocity.subtract(this.cameraVelocity);
      const diffLength = velocityDiff.length();
      const accel = inputVector.length() > 0 ? this.cameraAcceleration : this.cameraDeceleration;
      const maxDelta = accel * zoomRatio * dt;

      if (diffLength <= maxDelta || diffLength === 0) {
        this.cameraVelocity.copyFrom(targetVelocity);
      } else {
        this.cameraVelocity.addInPlace(velocityDiff.scale(maxDelta / diffLength));
      }

      if (this.cameraVelocity.lengthSquared() > 0.001) {
        const forwardDir = new BABYLON.Vector3(-Math.cos(camera.alpha), 0, -Math.sin(camera.alpha)).normalize();
        const rightDir = new BABYLON.Vector3(-Math.sin(camera.alpha), 0, Math.cos(camera.alpha)).normalize();

        const moveX = rightDir.scale(this.cameraVelocity.x * dt);
        const moveZ = forwardDir.scale(this.cameraVelocity.z * dt);

        camera.target.addInPlace(moveX).addInPlace(moveZ);

        const { mapWidth, mapHeight } = this.getCurrentMapDimensions();
        camera.target.x = Math.max(0, Math.min(mapWidth, camera.target.x));
        camera.target.z = Math.max(0, Math.min(mapHeight, camera.target.z));
      }
      // ----------------------------

      (window as any)._debug_frame_count = ((window as any)._debug_frame_count || 0) + 1;
      if ((window as any)._debug_frame_count === 1) console.log('[DEBUG] First onBeforeRenderObservable fired');

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
