import * as BABYLON from '@babylonjs/core';
import "@babylonjs/core/Meshes/instancedMesh"; // Side-effects required for instancing
import * as GUI from '@babylonjs/gui';
import GE from '../../game-engine';
import { TerrainType } from '../world-map/terrain-generator.service';
import type { DirtyRect } from '../world-map/main';

// ── Rich biome color palettes ──────────────────────────────────────────────
// Each biome has a primary gradient (low → high) driven by cell.z elevation,
// plus hue/saturation micro-variation derived from spatial noise.

interface BiomePalette {
  /** Low-elevation base color [r,g,b] (0-255) */
  low: [number, number, number];
  /** High-elevation base color [r,g,b] (0-255) */
  high: [number, number, number];
  /** Shoreline/edge tint when adjacent to another biome */
  edge: [number, number, number];
}

const BIOME_PALETTES: Record<string, BiomePalette> = {
  [TerrainType.WATER]: {
    low:  [8,   56, 120],    // deep ocean blue
    high: [45, 140, 210],    // shallow turquoise
    edge: [80, 180, 220],    // coastal foam tint
  },
  [TerrainType.SAND]: {
    low:  [180, 155,  90],   // dark wet sand
    high: [240, 220, 160],   // bright dry sand
    edge: [210, 195, 130],   // damp transition
  },
  [TerrainType.GRASS]: {
    low:  [30, 100,  50],    // dark forest green
    high: [90, 190, 100],    // bright meadow green
    edge: [70, 160,  85],    // mid transition green
  },
};

// ── Texture detail: pixels per cell side (8 → 50×8 = 400px texture) ────
const CELL_DETAIL = 8;

// ── Biome blending constants ────────────────────────────────────────────
const BLEND_RADIUS = 3; // pixels of blend zone at each cell edge

const BIOME_PRIORITY: Record<string, number> = {
  [TerrainType.WATER]: 1,  // lowest — sits below everything
  [TerrainType.SAND]:  2,  // sand drifts over water
  [TerrainType.GRASS]: 3,  // vegetation overgrows sand & shore
};

// ── Tiny deterministic spatial hash for per-pixel variation ─────────────
function pixelHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) & 0x7fffffff;
}

/** Returns a 0..1 value unique to (x,y) for micro-variation */
function pixelNoise(x: number, y: number): number {
  return (pixelHash(x, y) % 10000) / 10000;
}

/** Returns a -1..1 smooth blobby noise based on sin/cos combinations */
function smoothNoise(x: number, y: number): number {
  return Math.sin(x * 0.04 + Math.cos(y * 0.04)) * Math.cos(y * 0.04 + Math.sin(x * 0.04));
}

/**
 * Compute the raw RGB color for a single pixel of a given biome + elevation.
 * Extracted so both the base cell and blended neighbors use identical rendering.
 */
function computeBiomePixelColor(
  terrain: TerrainType, z: number, px: number, py: number
): [number, number, number] {
  const palette = BIOME_PALETTES[terrain];
  if (!palette) return [0, 0, 0];

  const elevT = Math.min(1, Math.max(0, (z || 0) / 10));
  const sNoise = smoothNoise(px, py);
  const pNoise = pixelNoise(px, py);
  
  const t = Math.min(1, Math.max(0, elevT + sNoise * 0.05));

  let r = palette.low[0] + (palette.high[0] - palette.low[0]) * t;
  let g = palette.low[1] + (palette.high[1] - palette.low[1]) * t;
  let b = palette.low[2] + (palette.high[2] - palette.low[2]) * t;

  // Gentle color variation patches rather than harsh grain
  const dither = sNoise * 4;
  r += dither;
  g += dither * 0.8;
  b += dither * 0.6;

  // ── Water wave pattern ──
  if (terrain === TerrainType.WATER) {
    const wave = Math.sin((px * 0.15 + py * 0.2) * 0.8) * 1.5;
    r += wave; g += wave * 1.2; b += wave * 0.5;
  }

  // ── Grass blade specks ──
  if (terrain === TerrainType.GRASS) {
    // Occasional very subtle grain, but much softer
    if (pNoise > 0.95) { r *= 0.95; g *= 0.97; b *= 0.92; }
  }

  // ── Sand grain specks ──
  if (terrain === TerrainType.SAND) {
    // Occasional tiny pebbles, softer contrast
    if (pNoise > 0.95) { r = Math.min(255, r + 8); g = Math.min(255, g + 5); }
  }

  return [r, g, b];
}

/**
 * Compute the normal map RGB color for a given pixel based on its biome
 */
function computeBiomePixelNormal(
  terrain: TerrainType, z: number, px: number, py: number
): [number, number, number] {
  const sNoise = smoothNoise(px, py);
  const pNoise = pixelNoise(px, py);
  
  // Base tangent space normal pointing straight up: (128, 128, 255)
  let nx = 128, ny = 128, nz = 255;
  
  if (terrain === TerrainType.WATER) {
    // Very gentle and broad ocean waves
    const waveX = Math.sin(px * 0.05 + py * 0.08);
    const waveY = Math.cos(px * 0.08 - py * 0.05);
    nx = 128 + waveX * 12;
    ny = 128 + waveY * 12;
    nz = 250;
  } else if (terrain === TerrainType.GRASS) {
    // Soft, rolling grassy mounds
    nx = 128 + sNoise * 25;
    ny = 128 + smoothNoise(px + 30, py + 30) * 25;
    // Tiny sprinkle of high-frequency for grass "fuzz"
    nx += (pNoise - 0.5) * 10;
    ny += (pixelNoise(px + 10, py + 10) - 0.5) * 10;
    nz = 240;
  } else if (terrain === TerrainType.SAND) {
    // Long, beautiful sprawling dunes
    const dune = Math.sin(px * 0.05 + py * 0.05 + sNoise * 0.5) * 15;
    nx = 128 + dune + sNoise * 15;
    ny = 128 + dune + smoothNoise(px + 50, py + 50) * 15;
    // Tiny granular speckle for sand feeling
    nx += (pNoise - 0.5) * 8;
    ny += (pixelNoise(px + 20, py + 20) - 0.5) * 8;
    nz = 245;
  }

  return [
    Math.min(255, Math.max(0, nx)),
    Math.min(255, Math.max(0, ny)),
    Math.min(255, Math.max(0, nz))
  ];
}

export class BabylonRenderer {
  private scene: BABYLON.Scene;
  private readonly fallbackMapSize = 4000;
  
  // Base meshes registry (keyed by entity `resourceName` or `speciesName`)
  private entityBases: Map<string, BABYLON.Mesh> = new Map();
  // Active instances per entity type
  private entityInstances: Map<string, BABYLON.InstancedMesh[]> = new Map();

  private entityShadows: Map<string, BABYLON.InstancedMesh[]> = new Map();
  private blobShadowBase!: BABYLON.Mesh;
  private thinShadowBases: Map<string, BABYLON.Mesh> = new Map(); // specifically for Thin Instances

  // Terrain
  private terrainGround!: BABYLON.Mesh;
  private terrainTexture!: BABYLON.DynamicTexture;
  private terrainNormalTexture!: BABYLON.DynamicTexture;
  private lastTerrainWidth = -1;
  private lastTerrainHeight = -1;

  // UI
  private uiLayer!: GUI.AdvancedDynamicTexture;
  private creatureStatsMap: Map<number, GUI.Rectangle> = new Map();

  // Performance: subscription reference for cleanup
  private mapChangedSub: { unsubscribe: () => void } | null = null;
  // Performance: coalesce multiple onMapChanged into one texture update per frame
  private pendingTextureUpdate = false;
  private pendingDirtyRect: DirtyRect | null = null;
  private fullMapUpdatePending = false;

  // Debug pointer
  private cursorMesh!: BABYLON.Mesh;
  private cursorLight!: BABYLON.PointLight;

  private sunLight!: BABYLON.DirectionalLight;

  private activeBrush: 'creature' | 'plant' | 'grass' | 'sand' | 'water' | null = null;
  private brushSize: number = 20;
  private creativePanel!: GUI.Rectangle;
  private shadowGenerator!: BABYLON.CascadedShadowGenerator;

  // Entity 3D preview system
  private previewMeshes: Map<string, BABYLON.Mesh> = new Map();
  private previewRTTs: Map<string, BABYLON.RenderTargetTexture> = new Map();
  private previewImages: Map<string, GUI.Image> = new Map();
  private previewCanvases: Map<string, HTMLCanvasElement> = new Map();
  private previewFrameCounter = 0;
  private isUpdatingPreviews = false;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  init() {
    this.initSceneLighting();
    this.initTerrain();
    this.initEntities();
    this.initUI();
    this.initCursorDebug();
    this.initEntityPreviews();
    this.initInteractions();
  }

  /** Add a warm directional "sun" for better depth and material response */
  private initSceneLighting() {
    this.sunLight = new BABYLON.DirectionalLight(
      "sunLight",
      new BABYLON.Vector3(-0.4, -1, 0.6),
      this.scene
    );
    this.sunLight.intensity = 1.6; // Bump intensity to provide contrast over the 0.3 ambient
    this.sunLight.diffuse = new BABYLON.Color3(1.0, 0.95, 0.85); // warm sun
    this.sunLight.specular = new BABYLON.Color3(0.15, 0.13, 0.10);
    this.sunLight.direction = new BABYLON.Vector3(-0.15, -1, 0.15); // Adjust angle to be more top-down but still slight offset
    this.sunLight.position = new BABYLON.Vector3(500, 1000, 500);

    // Cascaded shadows are ideal for broad ortho maps
    this.shadowGenerator = new BABYLON.CascadedShadowGenerator(2048, this.sunLight);
    this.shadowGenerator.usePercentageCloserFiltering = true;
    this.shadowGenerator.autoCalcDepthBounds = true;
    this.shadowGenerator.setDarkness(0.15); // make shadows much darker


    // Slightly tint ambient via fog – gives atmospheric depth
    this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.00008;
    this.scene.fogColor = new BABYLON.Color3(0.56, 0.78, 0.96); // match clearColor
  }

  private initCursorDebug() {
    // Create a visual sphere for the cursor
    this.cursorMesh = BABYLON.MeshBuilder.CreateSphere("cursorMesh", { diameter: 8 }, this.scene);
    const cursorMat = new BABYLON.StandardMaterial("cursorMat", this.scene);
    cursorMat.emissiveColor = new BABYLON.Color3(0.4, 0.85, 1.0); // soft cyan glow
    cursorMat.disableLighting = true;
    cursorMat.alpha = 0.7;
    this.cursorMesh.material = cursorMat;
    this.cursorMesh.position.y = 2; // Slightly above ground
    this.cursorMesh.isPickable = false; // Prevent blocking the raycast!
    this.cursorMesh.scaling.setAll(this.brushSize / 4);

    // Add a light to illuminate the area under cursor
    this.cursorLight = new BABYLON.PointLight("cursorLight", new BABYLON.Vector3(0, 15, 0), this.scene);
    this.cursorLight.diffuse = new BABYLON.Color3(0.5, 0.9, 1.0); // cool white-blue
    this.cursorLight.intensity = 1.5;
    this.cursorLight.range = 80;
  }

  private initUI() {
    this.uiLayer = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);
    this.createCreativePanel();

    // FPS Counter
    const fpsText = new GUI.TextBlock();
    fpsText.text = "0 FPS";
    fpsText.color = "#0ea5e9";
    fpsText.fontSize = 18;
    fpsText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    fpsText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    fpsText.paddingTop = "10px";
    fpsText.paddingLeft = "10px";
    fpsText.width = "150px";
    fpsText.height = "40px";
    fpsText.fontFamily = "Roboto, Arial, sans-serif";
    fpsText.fontWeight = "bold";
    // Adding solid outline for readability against any background
    fpsText.outlineColor = "#0f172a";
    fpsText.outlineWidth = 3;
    
    this.uiLayer.addControl(fpsText);

    this.scene.onBeforeRenderObservable.add(() => {
      fpsText.text = `${this.scene.getEngine().getFps().toFixed()} FPS`;
    });
  }

  private applyActiveBrush(x: number, y: number) {
    if (!this.activeBrush) return;

    if (this.activeBrush === 'grass' || this.activeBrush === 'sand' || this.activeBrush === 'water') {
        const terrain = this.activeBrush === 'grass' ? TerrainType.GRASS : 
                        this.activeBrush === 'sand' ? TerrainType.SAND : 
                        TerrainType.WATER;
        
        GE.world.terrain.paintBiomeCircle(x, y, this.brushSize, terrain);
        
        // Remove plants that are overwritten by Water or Sand brushing
        GE.world.flora.clearInvalidPlants(GE.world.terrain, x, y, this.brushSize);
    } else {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.brushSize;
        const dx = Math.cos(angle) * r;
        const dy = Math.sin(angle) * r;
        const px = x + dx;
        const py = y + dy;

        switch (this.activeBrush) {
          case 'creature': 
             GE.world.fauna.createCreature(GE.world.fauna.creaturesDef.ant, px, py); 
             break;
          case 'plant': 
             const cell = GE.world.terrain.getPixelCell(px, py);
             if (cell && cell.terrain === TerrainType.GRASS) {
                 GE.world.flora.createPlant(GE.world.flora.plantsDef.bush, px, py); 
             }
             break;
        }
    }
  }

  private createCreativePanel() {
    this.creativePanel = new GUI.Rectangle();
    this.creativePanel.width = "250px";
    this.creativePanel.height = "100%";
    this.creativePanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.creativePanel.background = "rgba(15, 23, 42, 0.85)";
    this.creativePanel.color = "transparent";
    this.uiLayer.addControl(this.creativePanel);

    const rootStack = new GUI.StackPanel();
    rootStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    rootStack.width = "100%";
    rootStack.paddingTop = "20px";
    rootStack.paddingLeft = "10px";
    rootStack.paddingRight = "10px";
    this.creativePanel.addControl(rootStack);

    // Title
    const title = new GUI.TextBlock();
    title.text = "Creative Mode";
    title.color = "white";
    title.fontSize = 20;
    title.height = "40px";
    title.fontFamily = "Roboto, Arial, sans-serif";
    rootStack.addControl(title);

    // Tabs Container
    const tabsContainer = new GUI.Grid();
    tabsContainer.addColumnDefinition(0.5);
    tabsContainer.addColumnDefinition(0.5);
    tabsContainer.height = "40px";
    tabsContainer.paddingBottom = "10px";
    tabsContainer.width = "100%";
    rootStack.addControl(tabsContainer);

    // Tab content containers
    const brushesPanel = new GUI.StackPanel();
    brushesPanel.width = "100%";
    const liveOptionsPanel = new GUI.StackPanel();
    liveOptionsPanel.width = "100%";
    liveOptionsPanel.isVisible = false;

    // Helper to create buttons
    const createButton = (text: string, onClick: () => void, isTab = false) => {
      const btn = GUI.Button.CreateSimpleButton("btn_" + text, text);
      btn.height = "35px";
      btn.color = "white";
      btn.background = isTab ? "#334155" : "#475569";
      btn.thickness = 0;
      btn.cornerRadius = 3;
      btn.paddingBottom = "5px";
      if (isTab) btn.width = "100%"; // Changed from 50% as Grid cell takes 50%
      btn.onPointerUpObservable.add(onClick);
      return btn;
    };

    // Tabs
    const brushesTab = createButton("Brushes", () => {
      brushesPanel.isVisible = true;
      liveOptionsPanel.isVisible = false;
      brushesTab.background = "#475569";
      liveOptionsTab.background = "#334155";
    }, true);
    
    const liveOptionsTab = createButton("System", () => {
      brushesPanel.isVisible = false;
      liveOptionsPanel.isVisible = true;
      brushesTab.background = "#334155";
      liveOptionsTab.background = "#475569";
    }, true);
    
    brushesTab.background = "#475569";
    tabsContainer.addControl(brushesTab, 0, 0);
    tabsContainer.addControl(liveOptionsTab, 0, 1);

    // Fill panels
    rootStack.addControl(brushesPanel);
    rootStack.addControl(liveOptionsPanel);

    // Brushes Content
    const createHeader = (text: string) => {
      const header = new GUI.TextBlock();
      header.text = text;
      header.color = "#94a3b8";
      header.fontSize = 14;
      header.height = "30px";
      header.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      return header;
    };

    brushesPanel.addControl(createHeader("Entities"));

    let activeBtn: GUI.Button | null = null;
    let activeIsPreview = false;
    const selectBrush = (type: string | null, btn: GUI.Button | null, isPreview = false) => {
      this.activeBrush = type as any;
      if (activeBtn) {
        if (activeIsPreview) {
          activeBtn.background = "#1e293b";
          activeBtn.color = "#334155";
        } else {
          activeBtn.background = "#475569";
        }
      }
      activeBtn = btn;
      activeIsPreview = isPreview;
      if (activeBtn) {
        if (isPreview) {
          activeBtn.background = "#0c4a6e";
          activeBtn.color = "#0ea5e9";
        } else {
          activeBtn.background = "#0284c7";
        }
      }
    };

    // 2-column grid for Fauna / Flora entity previews
    const entityGrid = new GUI.Grid();
    entityGrid.addColumnDefinition(0.5);
    entityGrid.addColumnDefinition(0.5);
    entityGrid.addRowDefinition(24, true);
    entityGrid.addRowDefinition(100, true);
    entityGrid.height = "130px";
    entityGrid.paddingBottom = "8px";

    const faunaLabel = new GUI.TextBlock("faunaLabel", "Fauna");
    faunaLabel.color = "#cbd5e1";
    faunaLabel.fontSize = 12;
    faunaLabel.fontFamily = "Roboto, Arial, sans-serif";
    entityGrid.addControl(faunaLabel, 0, 0);

    const floraLabel = new GUI.TextBlock("floraLabel", "Flora");
    floraLabel.color = "#cbd5e1";
    floraLabel.fontSize = 12;
    floraLabel.fontFamily = "Roboto, Arial, sans-serif";
    entityGrid.addControl(floraLabel, 0, 1);

    // Fauna preview button (Ant)
    const faunaBtn = new GUI.Button("faunaPreviewBtn");
    faunaBtn.thickness = 2;
    faunaBtn.color = "#334155";
    faunaBtn.background = "#1e293b";
    faunaBtn.cornerRadius = 6;
    faunaBtn.paddingLeft = "4px";
    faunaBtn.paddingRight = "4px";
    faunaBtn.paddingTop = "2px";
    faunaBtn.paddingBottom = "2px";
    const faunaImage = new GUI.Image("faunaPreviewImg", "");
    faunaImage.stretch = GUI.Image.STRETCH_UNIFORM;
    faunaBtn.addControl(faunaImage);
    faunaBtn.onPointerUpObservable.add(() => selectBrush('creature', faunaBtn, true));
    entityGrid.addControl(faunaBtn, 1, 0);
    this.previewImages.set("Ant", faunaImage);

    // Flora preview button (Bush)
    const floraBtn = new GUI.Button("floraPreviewBtn");
    floraBtn.thickness = 2;
    floraBtn.color = "#334155";
    floraBtn.background = "#1e293b";
    floraBtn.cornerRadius = 6;
    floraBtn.paddingLeft = "4px";
    floraBtn.paddingRight = "4px";
    floraBtn.paddingTop = "2px";
    floraBtn.paddingBottom = "2px";
    const floraImage = new GUI.Image("floraPreviewImg", "");
    floraImage.stretch = GUI.Image.STRETCH_UNIFORM;
    floraBtn.addControl(floraImage);
    floraBtn.onPointerUpObservable.add(() => selectBrush('plant', floraBtn, true));
    entityGrid.addControl(floraBtn, 1, 1);
    this.previewImages.set("Bush", floraImage);

    brushesPanel.addControl(entityGrid);

    brushesPanel.addControl(createHeader("Brush Size"));
    
    const sizePanel = new GUI.StackPanel();
    sizePanel.isVertical = false;
    sizePanel.height = "30px";
    sizePanel.paddingBottom = "10px";
    
    const sizeSlider = new GUI.Slider();
    sizeSlider.minimum = 4;
    sizeSlider.maximum = 100;
    sizeSlider.value = this.brushSize;
    sizeSlider.height = "20px";
    sizeSlider.width = "180px";
    sizeSlider.color = "#0ea5e9";
    sizeSlider.background = "#334155";
    
    const sizeLabel = new GUI.TextBlock();
    sizeLabel.text = this.brushSize.toFixed(0);
    sizeLabel.color = "white";
    sizeLabel.width = "40px";
    sizeLabel.fontSize = 14;

    sizeSlider.onValueChangedObservable.add((value) => {
      this.brushSize = value;
      sizeLabel.text = Math.floor(value).toString();
      if (this.cursorMesh) {
        this.cursorMesh.scaling.setAll(value / 4);
      }
    });
    
    sizePanel.addControl(sizeSlider);
    sizePanel.addControl(sizeLabel);
    brushesPanel.addControl(sizePanel);

    brushesPanel.addControl(createHeader("Terrain"));
    const brushGrassBtn = createButton("Grass", () => selectBrush('grass', brushGrassBtn));
    const brushSandBtn = createButton("Sand", () => selectBrush('sand', brushSandBtn));
    const brushWaterBtn = createButton("Water", () => selectBrush('water', brushWaterBtn));
    brushesPanel.addControl(brushGrassBtn);
    brushesPanel.addControl(brushSandBtn);
    brushesPanel.addControl(brushWaterBtn);
    
    const disableBrushBtn = createButton("Disable Brush", () => selectBrush(null, disableBrushBtn));
    disableBrushBtn.paddingTop = "10px";
    brushesPanel.addControl(disableBrushBtn);

    // Live Options Content
    liveOptionsPanel.addControl(createHeader("Actions"));
    liveOptionsPanel.addControl(createButton("Pool (Spawn 10)", () => {
      const { world } = GE;
      Array.from({ length: 10 }).forEach(() => world.flora.createPlant());
      Array.from({ length: 10 }).forEach(() => world.fauna.createCreature());
    }));
    liveOptionsPanel.addControl(createButton("Reset Biomes", () => {
      GE.world.terrain.reseedMap();
    }));
    liveOptionsPanel.addControl(createButton("Generate Map", () => {
      GE.world.terrain.generateMap();
    }));
  }

  private initEntityPreviews() {
    const PREVIEW_LAYER = 0x10000000;
    const PREVIEW_SIZE = 128;

    // Dedicated preview lighting
    const previewLight = new BABYLON.HemisphericLight(
      "previewHemiLight", new BABYLON.Vector3(0.3, 1, -0.2), this.scene
    );
    previewLight.intensity = 1.2;
    previewLight.diffuse = new BABYLON.Color3(1, 0.97, 0.92);
    previewLight.groundColor = new BABYLON.Color3(0.15, 0.18, 0.25);

    const allPreviewMeshes: BABYLON.AbstractMesh[] = [];

    // --- Bush preview ---
    const bushPos = new BABYLON.Vector3(-30, -1000, 0);
    const bushPreview = this.createPreviewBushMesh(bushPos, PREVIEW_LAYER);
    this.previewMeshes.set("Bush", bushPreview);
    allPreviewMeshes.push(bushPreview);

    const bushTarget = new BABYLON.Vector3(bushPos.x, bushPos.y + 1.5, bushPos.z);
    const bushCam = new BABYLON.ArcRotateCamera(
      "bushPreviewCam", -Math.PI / 4, Math.PI / 3, 10, bushTarget, this.scene
    );
    bushCam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    const bushOrthoSize = 3.5;
    bushCam.orthoLeft = -bushOrthoSize;
    bushCam.orthoRight = bushOrthoSize;
    bushCam.orthoTop = bushOrthoSize;
    bushCam.orthoBottom = -bushOrthoSize;
    bushCam.layerMask = PREVIEW_LAYER;

    const bushRTT = new BABYLON.RenderTargetTexture("bushRTT", PREVIEW_SIZE, this.scene);
    bushRTT.activeCamera = bushCam;
    bushRTT.clearColor = new BABYLON.Color4(0.059, 0.090, 0.165, 1);
    bushRTT.renderList!.push(bushPreview);
    this.scene.customRenderTargets.push(bushRTT);
    this.previewRTTs.set("Bush", bushRTT);

    // --- Ant preview ---
    const antPos = new BABYLON.Vector3(30, -1000, 0);
    const antPreview = this.createPreviewAntMesh(antPos, PREVIEW_LAYER);
    this.previewMeshes.set("Ant", antPreview);
    allPreviewMeshes.push(antPreview);

    const antTarget = new BABYLON.Vector3(antPos.x, antPos.y + 1, antPos.z);
    const antCam = new BABYLON.ArcRotateCamera(
      "antPreviewCam", -Math.PI / 4, Math.PI / 3, 12, antTarget, this.scene
    );
    antCam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    const antOrthoSize = 4.5;
    antCam.orthoLeft = -antOrthoSize;
    antCam.orthoRight = antOrthoSize;
    antCam.orthoTop = antOrthoSize;
    antCam.orthoBottom = -antOrthoSize;
    antCam.layerMask = PREVIEW_LAYER;

    const antRTT = new BABYLON.RenderTargetTexture("antRTT", PREVIEW_SIZE, this.scene);
    antRTT.activeCamera = antCam;
    antRTT.clearColor = new BABYLON.Color4(0.059, 0.090, 0.165, 1);
    antRTT.renderList!.push(antPreview);
    this.scene.customRenderTargets.push(antRTT);
    this.previewRTTs.set("Ant", antRTT);

    // Only affect preview meshes
    previewLight.includedOnlyMeshes = allPreviewMeshes;

    // Offscreen canvases for RTT -> GUI.Image transfer
    for (const name of ["Bush", "Ant"]) {
      const canvas = document.createElement("canvas");
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      this.previewCanvases.set(name, canvas);
    }

    // Rotate previews and update GUI images
    this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      for (const [, mesh] of this.previewMeshes) {
        mesh.rotation.y += dt * 0.5;
      }
      this.previewFrameCounter++;
      if (this.previewFrameCounter >= 3 && this.previewFrameCounter % 3 === 0) {
        this.updatePreviewImages();
      }
    });
  }

  private createPreviewBushMesh(pos: BABYLON.Vector3, layerMask: number): BABYLON.Mesh {
    const leafMat = new BABYLON.PBRMaterial("pvLeafMat", this.scene);
    leafMat.albedoColor = new BABYLON.Color3(0.05, 0.15, 0.02);
    leafMat.metallic = 0;
    leafMat.roughness = 0.5;
    leafMat.environmentIntensity = 0.2;
    leafMat.sheen.isEnabled = true;
    leafMat.sheen.intensity = 0.5;
    leafMat.sheen.color = new BABYLON.Color3(0.5, 0.9, 0.4);

    const woodMat = new BABYLON.PBRMaterial("pvWoodMat", this.scene);
    woodMat.albedoColor = new BABYLON.Color3(0.4, 0.25, 0.1);
    woodMat.metallic = 0;
    woodMat.roughness = 0.9;
    woodMat.environmentIntensity = 0.2;

    const parts: BABYLON.Mesh[] = [];

    const trunk = BABYLON.MeshBuilder.CreateCylinder("pvTrunk", { height: 1.8, diameterTop: 0.4, diameterBottom: 0.6 }, this.scene);
    trunk.position = new BABYLON.Vector3(0, 0.9, 0);
    trunk.material = woodMat;
    parts.push(trunk);

    const br1 = BABYLON.MeshBuilder.CreateCylinder("pvBr1", { height: 1.5, diameterTop: 0.2, diameterBottom: 0.3 }, this.scene);
    br1.position = new BABYLON.Vector3(0.5, 1.6, 0.2);
    br1.rotation = new BABYLON.Vector3(0.3, 0, -0.5);
    br1.material = woodMat;
    parts.push(br1);

    const br2 = BABYLON.MeshBuilder.CreateCylinder("pvBr2", { height: 1.4, diameterTop: 0.2, diameterBottom: 0.3 }, this.scene);
    br2.position = new BABYLON.Vector3(-0.5, 1.5, -0.3);
    br2.rotation = new BABYLON.Vector3(-0.3, 0, 0.4);
    br2.material = woodMat;
    parts.push(br2);

    const b1 = BABYLON.MeshBuilder.CreatePolyhedron("pvB1", { type: 1, size: 1.2 }, this.scene);
    b1.position = new BABYLON.Vector3(0, 2.6, 0);
    b1.material = leafMat;
    parts.push(b1);
    const b2 = BABYLON.MeshBuilder.CreatePolyhedron("pvB2", { type: 1, size: 0.9 }, this.scene);
    b2.position = new BABYLON.Vector3(1.2, 2.3, 0.6);
    b2.material = leafMat;
    parts.push(b2);
    const b3 = BABYLON.MeshBuilder.CreatePolyhedron("pvB3", { type: 1, size: 1.0 }, this.scene);
    b3.position = new BABYLON.Vector3(-1.1, 2.2, -0.8);
    b3.material = leafMat;
    parts.push(b3);
    const b4 = BABYLON.MeshBuilder.CreatePolyhedron("pvB4", { type: 1, size: 0.8 }, this.scene);
    b4.position = new BABYLON.Vector3(0.7, 2.0, -1.2);
    b4.material = leafMat;
    parts.push(b4);
    const b5 = BABYLON.MeshBuilder.CreatePolyhedron("pvB5", { type: 1, size: 0.9 }, this.scene);
    b5.position = new BABYLON.Vector3(-0.8, 2.1, 1.0);
    b5.material = leafMat;
    parts.push(b5);

    const merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, true, true) as BABYLON.Mesh;
    merged.isVisible = true;
    merged.position = pos.clone();
    merged.layerMask = layerMask;
    return merged;
  }

  private createPreviewAntMesh(pos: BABYLON.Vector3, layerMask: number): BABYLON.Mesh {
    const antMat = new BABYLON.PBRMaterial("pvAntMat", this.scene);
    antMat.albedoColor = new BABYLON.Color3(0.45, 0.2, 0.08);
    antMat.metallic = 0.1;
    antMat.roughness = 0.6;
    antMat.environmentIntensity = 0.3;

    const head = BABYLON.MeshBuilder.CreateSphere("pvHead", { diameter: 2.5 }, this.scene);
    head.position.z = 2.5;
    const thorax = BABYLON.MeshBuilder.CreateSphere("pvThorax", { diameter: 2 }, this.scene);
    const abdomen = BABYLON.MeshBuilder.CreateSphere("pvAbdomen", { diameter: 3.5 }, this.scene);
    abdomen.position.z = -3;
    abdomen.scaling.z = 1.3;

    const merged = BABYLON.Mesh.MergeMeshes([head, thorax, abdomen], true, true, undefined, false, true) as BABYLON.Mesh;
    merged.material = antMat;
    merged.isVisible = true;
    merged.position = pos.clone();
    merged.layerMask = layerMask;
    return merged;
  }

  private updatePreviewImages() {
    if (this.isUpdatingPreviews) return;
    this.isUpdatingPreviews = true;

    const updates: Promise<void>[] = [];

    for (const [name, rtt] of this.previewRTTs) {
      const canvas = this.previewCanvases.get(name);
      const image = this.previewImages.get(name);
      if (!canvas || !image) continue;

      const size = rtt.getSize();
      const readResult = rtt.readPixels();
      if (!readResult) continue;

      updates.push(
        readResult.then((pixels: ArrayBufferView) => {
          if (!pixels) return;
          const ctx = canvas.getContext('2d')!;
          const imgData = ctx.createImageData(size.width, size.height);

          const src = new Uint8Array((pixels as any).buffer ?? pixels);
          const dst = imgData.data;
          const w = size.width;
          const h = size.height;
          const rowBytes = w * 4;

          // Flip vertically (WebGL reads bottom-to-top)
          for (let y = 0; y < h; y++) {
            const srcOff = (h - 1 - y) * rowBytes;
            const dstOff = y * rowBytes;
            for (let i = 0; i < rowBytes; i++) {
              dst[dstOff + i] = src[srcOff + i];
            }
          }

          ctx.putImageData(imgData, 0, 0);
          image.source = canvas.toDataURL("image/jpeg", 0.8);
        }).catch(() => {})
      );
    }

    Promise.all(updates).finally(() => {
      this.isUpdatingPreviews = false;
    });
  }

  private initInteractions() {
    this.scene.onPointerObservable.add((pointerInfo) => {
      // Find what the scene picks at pointer position
      const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
      
      if (pickResult?.hit && pickResult.pickedMesh === this.terrainGround) {
        // Prevent painting if hovering over the right 250px UI panel
        const canvasWidth = this.scene.getEngine().getRenderWidth();
        if (this.scene.pointerX > canvasWidth - 250) {
          return;
        }

        const point = pickResult.pickedPoint;
        if (!point) return;
        
        // Abstract engine uses x for X, and y for Z.
        // Also abstract engine works from top-left (0,0) instead of center, but we aligned the ground origin so point.x and point.z directly map to abstract X, Y!
        const abstractX = point.x;
        const abstractY = point.z;

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
          GE.mouseController.triggerDown(abstractX, abstractY);
          this.applyActiveBrush(abstractX, abstractY);
        } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
          GE.mouseController.triggerUp(abstractX, abstractY);
        } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
          // Send move events or dragging events
          GE.mouseController.triggerMove(abstractX, abstractY);
          if (pointerInfo.event.buttons === 1) {
            // Mouse drag painting (trigger down too since controller might need it)
            GE.mouseController.triggerDown(abstractX, abstractY);
            this.applyActiveBrush(abstractX, abstractY);
          }
        }
      }
    });
  }

  private initTerrain() {
    const { width, height } = this.getRenderableMapDimensions();
    this.lastTerrainWidth = width;
    this.lastTerrainHeight = height;

    const terrain = GE.world.terrain;
    const cols = terrain.tiles.cols || 1;
    const rows = terrain.tiles.rows || 1;

    this.terrainGround = BABYLON.MeshBuilder.CreateGround("terrain", {
      width: width,
      height: height,
      subdivisions: 1
    }, this.scene);
    
    // Abstract system uses (0,0) as top left.
    // So the center of the ground should be (width/2, height/2).
    this.terrainGround.position.x = width / 2;
    this.terrainGround.position.z = height / 2;
    this.terrainGround.receiveShadows = true;

    // High-res texture: CELL_DETAIL pixels per cell for crisp intra-cell detail
    const texW = cols * CELL_DETAIL;
    const texH = rows * CELL_DETAIL;
    this.terrainTexture = new BABYLON.DynamicTexture("terrainTexture", { width: texW, height: texH }, this.scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    this.terrainNormalTexture = new BABYLON.DynamicTexture("terrainNormalTexture", { width: texW, height: texH }, this.scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);

    // Use PBR material for realistic lighting interaction
    const terrainMaterial = new BABYLON.PBRMaterial("terrainMat", this.scene);
    terrainMaterial.albedoTexture = this.terrainTexture;
    terrainMaterial.bumpTexture = this.terrainNormalTexture;
    terrainMaterial.bumpTexture.level = 4.0; // Force strong bumps!
    terrainMaterial.metallic = 0.05;
    terrainMaterial.roughness = 0.55;    // Lower roughness so bumps cast distinct specular highlights
    terrainMaterial.environmentIntensity = 0.3;
    // Subtle sheen gives a "dewy" look to grass
    terrainMaterial.sheen.isEnabled = true;
    terrainMaterial.sheen.intensity = 0.15;
    terrainMaterial.sheen.color = new BABYLON.Color3(0.6, 0.8, 0.5);
    
    this.terrainGround.material = terrainMaterial;

    // Subscribe to map changes to update the texture dynamically
    this.mapChangedSub = GE.world.terrain.onMapChanged.subscribe((dirtyRect: DirtyRect | null) => {
      if (!dirtyRect) {
        this.fullMapUpdatePending = true;
      } else if (!this.fullMapUpdatePending) {
        if (!this.pendingDirtyRect) {
          this.pendingDirtyRect = { ...dirtyRect };
        } else {
          this.pendingDirtyRect.minTx = Math.min(this.pendingDirtyRect.minTx, dirtyRect.minTx);
          this.pendingDirtyRect.minTy = Math.min(this.pendingDirtyRect.minTy, dirtyRect.minTy);
          this.pendingDirtyRect.maxTx = Math.max(this.pendingDirtyRect.maxTx, dirtyRect.maxTx);
          this.pendingDirtyRect.maxTy = Math.max(this.pendingDirtyRect.maxTy, dirtyRect.maxTy);
        }
      }

      if (!this.pendingTextureUpdate) {
        this.pendingTextureUpdate = true;
        requestAnimationFrame(() => {
          this.updateTerrainTexture(this.fullMapUpdatePending ? null : this.pendingDirtyRect);
          this.pendingTextureUpdate = false;
          this.fullMapUpdatePending = false;
          this.pendingDirtyRect = null;
        });
      }
    });

    this.updateTerrainTexture();
  }

  private initEntities() {
    // --- Blob Shadow Base ---
    const shadowTexSize = 128;
    const shadowTexture = new BABYLON.DynamicTexture("shadowTex", shadowTexSize, this.scene, false);
    const shadowCtx = shadowTexture.getContext();
    const cx = shadowTexSize / 2;
    const cy = shadowTexSize / 2;
    
    // Radial gradient from 85% opacity black to 0
    const radialGrad = shadowCtx.createRadialGradient(cx, cy, 0, cx, cy, cx);
    radialGrad.addColorStop(0, "rgba(0, 0, 0, 0.85)");
    radialGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.4)");
    radialGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

    shadowCtx.fillStyle = radialGrad;
    shadowCtx.fillRect(0, 0, shadowTexSize, shadowTexSize);
    shadowTexture.update();

    const shadowMaterial = new BABYLON.StandardMaterial("blobShadowMat", this.scene);
    shadowMaterial.diffuseTexture = shadowTexture;
    shadowMaterial.diffuseTexture.hasAlpha = true;
    shadowMaterial.useAlphaFromDiffuseTexture = true;
    shadowMaterial.disableLighting = true; // purely unlit
    shadowMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);

    this.blobShadowBase = BABYLON.MeshBuilder.CreatePlane("blobShadowBase", { size: 4 }, this.scene);
    this.blobShadowBase.rotation.x = Math.PI / 2; // Lie flat on ground
    this.blobShadowBase.material = shadowMaterial;
    this.blobShadowBase.isVisible = false;

    // --- Flora base: Low-poly stylized bush with branches ---
    const floraLeafMat = new BABYLON.PBRMaterial("floraLeafMat", this.scene);
    floraLeafMat.albedoColor = new BABYLON.Color3(0.05, 0.15, 0.02);
    floraLeafMat.metallic = 0;
    floraLeafMat.roughness = 0.5;
    floraLeafMat.environmentIntensity = 0.2;
    floraLeafMat.sheen.isEnabled = true;
    floraLeafMat.sheen.intensity = 0.5;
    floraLeafMat.sheen.color = new BABYLON.Color3(0.5, 0.9, 0.4);

    const floraWoodMat = new BABYLON.PBRMaterial("floraWoodMat", this.scene);
    floraWoodMat.albedoColor = new BABYLON.Color3(0.4, 0.25, 0.1);
    floraWoodMat.metallic = 0;
    floraWoodMat.roughness = 0.9;
    floraWoodMat.environmentIntensity = 0.2;

    const parts: BABYLON.Mesh[] = [];

    // Branches (Brown)
    const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk", { height: 1.8, diameterTop: 0.4, diameterBottom: 0.6 }, this.scene);
    trunk.position = new BABYLON.Vector3(0, 0.9, 0);
    trunk.material = floraWoodMat;
    parts.push(trunk);

    const br1 = BABYLON.MeshBuilder.CreateCylinder("br1", { height: 1.5, diameterTop: 0.2, diameterBottom: 0.3 }, this.scene);
    br1.position = new BABYLON.Vector3(0.5, 1.6, 0.2);
    br1.rotation = new BABYLON.Vector3(0.3, 0, -0.5);
    br1.material = floraWoodMat;
    parts.push(br1);

    const br2 = BABYLON.MeshBuilder.CreateCylinder("br2", { height: 1.4, diameterTop: 0.2, diameterBottom: 0.3 }, this.scene);
    br2.position = new BABYLON.Vector3(-0.5, 1.5, -0.3);
    br2.rotation = new BABYLON.Vector3(-0.3, 0, 0.4);
    br2.material = floraWoodMat;
    parts.push(br2);

    // Leaves (Green)
    const b1 = BABYLON.MeshBuilder.CreatePolyhedron("b1", { type: 1, size: 1.2 }, this.scene);
    b1.position = new BABYLON.Vector3(0, 2.6, 0);
    const b2 = BABYLON.MeshBuilder.CreatePolyhedron("b2", { type: 1, size: 0.9 }, this.scene);
    b2.position = new BABYLON.Vector3(1.2, 2.3, 0.6);
    const b3 = BABYLON.MeshBuilder.CreatePolyhedron("b3", { type: 1, size: 1.0 }, this.scene);
    b3.position = new BABYLON.Vector3(-1.1, 2.2, -0.8);
    const b4 = BABYLON.MeshBuilder.CreatePolyhedron("b4", { type: 1, size: 0.8 }, this.scene);
    b4.position = new BABYLON.Vector3(0.7, 2.0, -1.2);
    const b5 = BABYLON.MeshBuilder.CreatePolyhedron("b5", { type: 1, size: 0.9 }, this.scene);
    b5.position = new BABYLON.Vector3(-0.8, 2.1, 1.0);

    for (const leaf of [b1, b2, b3, b4, b5]) {
      leaf.material = floraLeafMat;
      parts.push(leaf);
    }

    // Merge all meshes. Set subdivideWithSubMeshes=true and multiMultiMaterials=true to preserve textures!
    const bushMesh = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, true, true) as BABYLON.Mesh;
    bushMesh.isVisible = false;
    this.shadowGenerator.addShadowCaster(bushMesh, true);
    this.entityBases.set("Bush", bushMesh);
    this.entityInstances.set("Bush", []);
    
    // --- Fauna base: Ant-like segmented body ---
    const head = BABYLON.MeshBuilder.CreateSphere("head", { diameter: 2.5 }, this.scene);
    head.position.z = 2.5; // Front

    const thorax = BABYLON.MeshBuilder.CreateSphere("thorax", { diameter: 2 }, this.scene);
    thorax.position.z = 0; // Middle

    const abdomen = BABYLON.MeshBuilder.CreateSphere("abdomen", { diameter: 3.5 }, this.scene);
    abdomen.position.z = -3; // Rear
    abdomen.scaling.z = 1.3; // Elongate abdomen

    // Merge into a single base
    const antMesh = BABYLON.Mesh.MergeMeshes([head, thorax, abdomen], true, true, undefined, false, true) as BABYLON.Mesh;
    antMesh.isVisible = false;
    antMesh.registerInstancedBuffer("color", 4); 
    this.shadowGenerator.addShadowCaster(antMesh, true);

    const faunaMat = new BABYLON.StandardMaterial("faunaMat", this.scene);
    faunaMat.diffuseColor = new BABYLON.Color3(1, 1, 1); // White base to multiply with instance color
    faunaMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3); // Slight bug shell shine
    faunaMat.specularPower = 32;
    antMesh.material = faunaMat;
    
    this.entityBases.set("Ant", antMesh);
    this.entityInstances.set("Ant", []);
  }

  public updateTerrainTexture(dirtyRect: DirtyRect | null = null) {
    if (!this.terrainTexture) return;

    let { width, height } = this.getRenderableMapDimensions();
    
    if (width <= 0 || height <= 0) return;

    if (this.lastTerrainWidth !== width || this.lastTerrainHeight !== height) {
      if ((this as any)._rebuildCounter > 10) {
         throw new Error("Infinite loop detected in rebuildTerrainMesh! Width: " + width + " Height: " + height);
      }
      (this as any)._rebuildCounter = ((this as any)._rebuildCounter || 0) + 1;
      this.lastTerrainWidth = width;
      this.lastTerrainHeight = height;
      this.rebuildTerrainMesh(width, height);
      return; 
    }
    (this as any)._rebuildCounter = 0;

    const terrain = GE.world.terrain;
    const cols = terrain.tiles.cols || 1;
    const rows = terrain.tiles.rows || 1;

    if (cols * rows > 10000000) {
       throw new Error(`Safety guard: Array size ${cols * rows} is too large and will freeze the browser`);
    }

    const texW = cols * CELL_DETAIL;
    const texH = rows * CELL_DETAIL;
    const ctx = this.terrainTexture.getContext() as CanvasRenderingContext2D;
    const nCtx = this.terrainNormalTexture.getContext() as CanvasRenderingContext2D;

    let startX = 0;
    let endX = texW;
    let startY = 0;
    let endY = texH;

    if (dirtyRect) {
      const minTx = Math.max(0, dirtyRect.minTx - 1);
      const minTy = Math.max(0, dirtyRect.minTy - 1);
      const maxTx = Math.min(cols - 1, dirtyRect.maxTx + 1);
      const maxTy = Math.min(rows - 1, dirtyRect.maxTy + 1);

      startX = minTx * CELL_DETAIL;
      startY = minTy * CELL_DETAIL;
      endX = (maxTx + 1) * CELL_DETAIL;
      endY = (maxTy + 1) * CELL_DETAIL;
    }

    const dirtyW = endX - startX;
    const dirtyH = endY - startY;

    if (dirtyW <= 0 || dirtyH <= 0) return;

    const imgData = ctx.createImageData(dirtyW, dirtyH);
    const data = imgData.data;
    const nImgData = nCtx.createImageData(dirtyW, dirtyH);
    const nData = nImgData.data;
    const cells = terrain.cells;

    for (let py = startY; py < endY; py++) {
      for (let px = startX; px < endX; px++) {
        // Which cell does this pixel belong to?
        const cx = Math.floor(px / CELL_DETAIL);
        const cy = Math.floor(py / CELL_DETAIL);

        const cellIdx = cy * cols + cx;
        const cell = cells[cellIdx];

        let r = 0, g = 0, b = 0;
        let nr = 128, ng = 128, nb = 255;

        if (cell) {
          // Base color for this cell's biome
          [r, g, b] = computeBiomePixelColor(cell.terrain, cell.z, px, py);
          [nr, ng, nb] = computeBiomePixelNormal(cell.terrain, cell.z, px, py);

          // ── Biome border blending ──────────────────────────────────────
          const localX = px % CELL_DETAIL;
          const localY = py % CELL_DETAIL;
          const nearEdge =
            localX < BLEND_RADIUS || localX >= CELL_DETAIL - BLEND_RADIUS ||
            localY < BLEND_RADIUS || localY >= CELL_DETAIL - BLEND_RADIUS;

          if (nearEdge) {
            const selfPriority = BIOME_PRIORITY[cell.terrain] || 0;
            let totalWeight = 0;
            let blendR = 0, blendG = 0, blendB = 0;
            let blendNR = 0, blendNG = 0, blendNB = 0;

            // Distance from each cell edge (in pixels)
            const distL = localX;
            const distR = CELL_DETAIL - 1 - localX;
            const distT = localY;
            const distB = CELL_DETAIL - 1 - localY;

            // Inline helper: sample one neighbor direction
            const sampleNeighbor = (
              dx: number, dy: number, edgeDist: number, diagScale: number
            ) => {
              if (edgeDist >= BLEND_RADIUS) return;
              const nx_n = cx + dx;
              const ny_n = cy + dy;
              if (nx_n < 0 || nx_n >= cols || ny_n < 0 || ny_n >= rows) return;

              const neighbor = cells[ny_n * cols + nx_n];
              if (!neighbor || neighbor.terrain === cell!.terrain) return;
              if ((BIOME_PRIORITY[neighbor.terrain] || 0) <= selfPriority) return;

              // Noise-perturbed weight → organic jagged border
              const noiseMod = 0.4 + pixelNoise(px + dx * 997, py + dy * 991) * 0.9;
              const weight =
                Math.max(0, Math.min(0.75, (1 - edgeDist / BLEND_RADIUS) * noiseMod))
                * diagScale;

              const [nc_r, nc_g, nc_b] = computeBiomePixelColor(
                neighbor.terrain, neighbor.z, px, py
              );
              blendR += nc_r * weight;
              blendG += nc_g * weight;
              blendB += nc_b * weight;
              
              const [nn_r, nn_g, nn_b] = computeBiomePixelNormal(
                neighbor.terrain, neighbor.z, px, py
              );
              blendNR += nn_r * weight;
              blendNG += nn_g * weight;
              blendNB += nn_b * weight;
              
              totalWeight += weight;
            };

            // 4 cardinal neighbors
            sampleNeighbor(-1,  0, distL, 1.0);
            sampleNeighbor( 1,  0, distR, 1.0);
            sampleNeighbor( 0, -1, distT, 1.0);
            sampleNeighbor( 0,  1, distB, 1.0);
            // 4 diagonal neighbors (half weight for softer corners)
            sampleNeighbor(-1, -1, Math.max(distL, distT), 0.5);
            sampleNeighbor( 1, -1, Math.max(distR, distT), 0.5);
            sampleNeighbor(-1,  1, Math.max(distL, distB), 0.5);
            sampleNeighbor( 1,  1, Math.max(distR, distB), 0.5);

            // Composite: mix neighbor colors into self
            if (totalWeight > 0) {
              if (totalWeight > 0.85) {
                const scale = 0.85 / totalWeight;
                blendR *= scale;
                blendG *= scale;
                blendB *= scale;
                blendNR *= scale;
                blendNG *= scale;
                blendNB *= scale;
                totalWeight = 0.85;
              }
              r = r * (1 - totalWeight) + blendR;
              g = g * (1 - totalWeight) + blendG;
              b = b * (1 - totalWeight) + blendB;
              nr = nr * (1 - totalWeight) + blendNR;
              ng = ng * (1 - totalWeight) + blendNG;
              nb = nb * (1 - totalWeight) + blendNB;
            }
          }
        }

        // Clamp
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));
        nr = Math.min(255, Math.max(0, nr));
        ng = Math.min(255, Math.max(0, ng));
        nb = Math.min(255, Math.max(0, nb));

        // Flip Y for canvas coordinate system
        const canvasY = (texH - 1) - py;
        const imgY = canvasY - (texH - endY);
        const imgX = px - startX;
        
        const offset = (imgY * dirtyW + imgX) * 4;
        data[offset]     = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
        
        nData[offset]     = nr;
        nData[offset + 1] = ng;
        nData[offset + 2] = nb;
        nData[offset + 3] = 255;
      }
    }

    ctx.putImageData(imgData, startX, texH - endY);
    this.terrainTexture.update();
    nCtx.putImageData(nImgData, startX, texH - endY);
    this.terrainNormalTexture.update();
  }

  private rebuildTerrainMesh(width: number, height: number) {
    if (this.terrainTexture) this.terrainTexture.dispose();
    if (this.terrainNormalTexture) this.terrainNormalTexture.dispose();
    if (this.terrainGround) this.terrainGround.dispose();

    const terrain = GE.world.terrain;
    const cols = terrain.tiles.cols || 1;
    const rows = terrain.tiles.rows || 1;

    this.terrainGround = BABYLON.MeshBuilder.CreateGround("terrain", {
      width: width,
      height: height,
      subdivisions: 1
    }, this.scene);
    
    this.terrainGround.position.x = width / 2;
    this.terrainGround.position.z = height / 2;
    this.terrainGround.receiveShadows = true;

    // High-res texture: CELL_DETAIL pixels per cell
    const texW = cols * CELL_DETAIL;
    const texH = rows * CELL_DETAIL;
    this.terrainTexture = new BABYLON.DynamicTexture("terrainTexture", { width: texW, height: texH }, this.scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    this.terrainNormalTexture = new BABYLON.DynamicTexture("terrainNormalTexture", { width: texW, height: texH }, this.scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    
    // Rebuild with PBR material
    const terrainMaterial = new BABYLON.PBRMaterial("terrainMat", this.scene);
    terrainMaterial.albedoTexture = this.terrainTexture;
    terrainMaterial.bumpTexture = this.terrainNormalTexture;
    terrainMaterial.bumpTexture.level = 4.0; // Force strong bumps!
    terrainMaterial.metallic = 0.05;
    terrainMaterial.roughness = 0.55;
    terrainMaterial.environmentIntensity = 0.3;
    terrainMaterial.sheen.isEnabled = true;
    terrainMaterial.sheen.intensity = 0.15;
    terrainMaterial.sheen.color = new BABYLON.Color3(0.6, 0.8, 0.5);
    
    this.terrainGround.material = terrainMaterial;
    
    setTimeout(() => {
      this.updateTerrainTexture();
    }, 0);
  }

  private getRenderableMapDimensions(): { width: number; height: number } {
    return {
      width: Number(GE.world.terrain.width || GE.world.worldBorders.xEnd || this.fallbackMapSize),
      height: Number(GE.world.terrain.height || GE.world.worldBorders.yEnd || this.fallbackMapSize),
    };
  }

  sync() {
    if ((window as any)._debug_sync_count === undefined) {
      (window as any)._debug_sync_count = 0;
    }
    (window as any)._debug_sync_count++;
    const isFirstSync = (window as any)._debug_sync_count === 1;

    if (isFirstSync) console.log('[DEBUG] sync() started');

    // Update visual debug cursor to avoid frame delay / chasing effect
    if (this.cursorMesh && this.cursorLight) {
      const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
      if (pickResult?.hit && pickResult.pickedMesh === this.terrainGround && pickResult.pickedPoint) {
        this.cursorMesh.isVisible = true;
        this.cursorLight.setEnabled(true);
        this.cursorMesh.position.x = pickResult.pickedPoint.x;
        this.cursorMesh.position.z = pickResult.pickedPoint.z;
        this.cursorLight.position.x = pickResult.pickedPoint.x;
        this.cursorLight.position.z = pickResult.pickedPoint.z;
      } else {
        this.cursorMesh.isVisible = false;
        this.cursorLight.setEnabled(false);
      }
    }

    // --- Flora ---
    const plants = GE.world.flora.plants;
    if (isFirstSync) console.log('[DEBUG] sync() - Flora length = ' + plants.length);
    
    const plantsByType = new Map<string, any[]>();
    for (const plant of plants) {
      if (plant.lifeEnergy <= 0) continue; // Dead flora doesn't render
      const type = plant.resourceName;
      if (!plantsByType.has(type)) plantsByType.set(type, []);
      plantsByType.get(type)!.push(plant);
    }

    for (const [type, typePlants] of plantsByType) {
       const base = this.entityBases.get(type);
       if (!base) continue;

       let shadowBase = this.thinShadowBases.get(type);
       if (!shadowBase) {
           shadowBase = this.blobShadowBase.clone(type + "_thinShadowBase");
           this.thinShadowBases.set(type, shadowBase);
       }

       // For Thin Instances, the base mesh MUST be visible to render the instances.
       // We toggle it to false if there are 0 plants to prevent drawing the base mesh itself.
       base.isVisible = typePlants.length > 0;
       base.alwaysSelectAsActiveMesh = true; // Prevents the instanced batch from being frustum-culled
       
       shadowBase.isVisible = typePlants.length > 0;
       shadowBase.alwaysSelectAsActiveMesh = true;

       // We use a property to cache count so we only rebuild the float array when a plant spawns/dies
       const lastCount = (base as any)._lastThinCount;
       
       if (lastCount !== typePlants.length) {
         if (lastCount === undefined) {
             this.shadowGenerator.addShadowCaster(base, true); // true = include thin instances
         }

         const buffer = new Float32Array(typePlants.length * 16);
         const shadowBuffer = new Float32Array(typePlants.length * 16);
         
         const rotAxis = BABYLON.Vector3.Up();
         const quatIdentity = BABYLON.Quaternion.Identity();
         
         for (let i = 0; i < typePlants.length; i++) {
           const plant = typePlants[i];
           const baseEnergy = typeof plant.getInitialEnergy === "function" ? plant.getInitialEnergy() : 200;
           let scale = Math.max(0.3, Math.min(3.0, baseEnergy / 80));
           if (type === "Bush") scale *= 1.4;
           
           const rotY = plant.id * 1.618;
           
           const matrix = BABYLON.Matrix.Compose(
             new BABYLON.Vector3(scale, scale, scale),
             BABYLON.Quaternion.RotationAxis(rotAxis, rotY),
             new BABYLON.Vector3(plant.position.x, 0, plant.position.y)
           );
           matrix.copyToArray(buffer, i * 16);
           
           const shadowMatrix = BABYLON.Matrix.Compose(
             new BABYLON.Vector3(scale * 0.7, scale * 0.7, scale * 0.7),
             quatIdentity,
             new BABYLON.Vector3(plant.position.x, 0.05, plant.position.y)
           );
           shadowMatrix.copyToArray(shadowBuffer, i * 16);
         }
         
         base.thinInstanceSetBuffer("matrix", buffer, 16, false);
         shadowBase.thinInstanceSetBuffer("matrix", shadowBuffer, 16, false);
         (base as any)._lastThinCount = typePlants.length;
       }
    }

    // --- Fauna ---
    const creatures = GE.world.fauna.creatures;
    if (isFirstSync) console.log('[DEBUG] sync() - Fauna length = ' + creatures.length);
    
    const creaturesByType = new Map<string, any[]>();
    for (const creature of creatures) {
      const type = creature.speciesName;
      if (!creaturesByType.has(type)) creaturesByType.set(type, []);
      creaturesByType.get(type)!.push(creature);
    }

    const aliveCreatureIds = new Set<number>();

    for (const [type, typeCreatures] of creaturesByType) {
       const base = this.entityBases.get(type);
       if (!base) continue;

       let instances = this.entityInstances.get(type);
       if (!instances) {
         instances = [];
         this.entityInstances.set(type, instances);
       }
       let shadowInstances = this.entityShadows.get(type);
       if (!shadowInstances) {
         shadowInstances = [];
         this.entityShadows.set(type, shadowInstances);
       }

       while (instances.length < typeCreatures.length) {
         const inst = base.createInstance(type + "_inst_" + instances.length);
         inst.instancedBuffers["color"] = new BABYLON.Color4(1, 1, 1, 1);
         this.shadowGenerator.addShadowCaster(inst, false);
         instances.push(inst);
         shadowInstances.push(this.blobShadowBase.createInstance(type + "_shd_" + shadowInstances.length));
       }
       while (instances.length > typeCreatures.length) {
         const inst = instances.pop();
         if (inst) {
           this.shadowGenerator.removeShadowCaster(inst);
           inst.dispose();
         }
         const shd = shadowInstances.pop();
         if (shd) shd.dispose();
       }

       typeCreatures.forEach((creature: any, index: number) => {
         const inst = instances![index];
         const shdInst = shadowInstances![index];
         inst.position.x = creature.position.x;
         inst.position.z = creature.position.y;
         
         inst.scaling.setAll(1);
         inst.rotation.setAll(0);

         if (creature.lifeEnergy <= 0) {
           if (!creature.deathReason || creature.timeSinceDeath > 3) {
             inst.isVisible = false;
             shdInst.isVisible = false;
           } else {
             inst.isVisible = true;
             shdInst.isVisible = true;
             shdInst.position.x = inst.position.x;
             shdInst.position.z = inst.position.z;
             shdInst.position.y = 0.05;

             if (creature.deathReason === 'drowned') {
                inst.position.y = 3 - (creature.timeSinceDeath / 3) * 8;
                const scale = Math.max(0.01, 1 - (creature.timeSinceDeath / 3));
                inst.scaling.setAll(scale);
                shdInst.scaling.setAll(scale * 0.6); // Scale down blob with drowning
             } else {
                const tipAngle = Math.min(Math.PI / 2, creature.timeSinceDeath * 2);
                inst.rotation.x = tipAngle;
                inst.position.y = 3 - Math.sin(tipAngle) * 2;
                shdInst.scaling.setAll(0.6); // keep blob scaled down
             }
             
             if (inst.instancedBuffers["color"]) {
               const deadColor = inst.instancedBuffers["color"] as BABYLON.Color4;
               deadColor.r = 0.3; deadColor.g = 0.3; deadColor.b = 0.3; deadColor.a = 1;
             }
           }
         } else {
           inst.isVisible = true;
           shdInst.isVisible = true;
           shdInst.position.x = inst.position.x;
           shdInst.position.z = inst.position.z;
           shdInst.position.y = 0.05;
           shdInst.scaling.setAll(0.6); // Contact shadow matches bug body

           const dx = creature.target.x - creature.position.x;
           const MathDz = creature.target.y - creature.position.y;
           if (Math.abs(dx) > 0.1 || Math.abs(MathDz) > 0.1) {
             inst.rotation.y = Math.atan2(dx, MathDz);
           }

           const walkCycle = (creature.position.x + creature.position.y) * 0.4;
           inst.position.y = 2 + Math.abs(Math.sin(walkCycle)) * 1.0;

           const maxEnergy = 250;
           const energyPercent = Math.min(1, Math.max(0, creature.lifeEnergy / maxEnergy));
           
           const h = energyPercent * 120;
           const s = 0.7;
           const l = 0.3 + (energyPercent * 0.2);
           
           const c = (1 - Math.abs(2 * l - 1)) * s;
           const x = c * (1 - Math.abs((h / 60) % 2 - 1));
           const m = l - c / 2;
           
           let r = 0, g = 0, b = 0;
           if (0 <= h && h < 60) { r = c; g = x; b = 0; }
           else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
           
           if (inst.instancedBuffers["color"]) {
             const liveColor = inst.instancedBuffers["color"] as BABYLON.Color4;
             liveColor.r = r + m; liveColor.g = g + m; liveColor.b = b + m; liveColor.a = 1;
           }
           
           aliveCreatureIds.add(creature.id);
           
           // SYNC UI
           let statBox = this.creatureStatsMap.get(creature.id);
           if (!statBox) {
             statBox = this.createStatBox();
             this.uiLayer.addControl(statBox);
             statBox.linkWithMesh(inst);
             statBox.linkOffsetY = -30;
             this.creatureStatsMap.set(creature.id, statBox);
           }

           const newText = `ID: ${creature.id}\nEng: ${Math.round(creature.lifeEnergy)}\nAge: ${Math.round(creature.age)}\nAct: ${creature.currentBehavior?.name || 'idle'}`;
           const textBlock = statBox.children[0] as GUI.TextBlock;
           if (textBlock.text !== newText) {
             textBlock.text = newText;
           }
         }
       });
    }

    // Cleanup dead UI — O(1) Set lookup instead of O(n) .find()
    if (isFirstSync) console.log('[DEBUG] sync() - Cleaning up dead UI');
    for (const [id, box] of this.creatureStatsMap) {
      if (!aliveCreatureIds.has(id)) {
        box.dispose();
        this.creatureStatsMap.delete(id);
      }
    }
    if (isFirstSync) console.log('[DEBUG] sync() - Completed successfully');
  }

  private createStatBox(): GUI.Rectangle {
    const rect = new GUI.Rectangle();
    rect.width = "70px";
    rect.height = "55px";
    rect.cornerRadius = 4;
    rect.color = "rgba(56, 189, 248, 0.5)"; // cyan border
    rect.thickness = 1;
    rect.background = "rgba(15, 23, 42, 0.75)";
    
    const textBlock = new GUI.TextBlock();
    textBlock.text = "Loading...";
    textBlock.color = "white";
    textBlock.fontSize = 10;
    textBlock.fontFamily = "Roboto, Arial, sans-serif";
    textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    textBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    textBlock.paddingTop = "4px";
    textBlock.paddingLeft = "4px";
    
    rect.addControl(textBlock);
    return rect;
  }

  /** Clean up subscriptions and resources */
  dispose() {
    if (this.mapChangedSub) {
      this.mapChangedSub.unsubscribe();
      this.mapChangedSub = null;
    }
    for (const [, box] of this.creatureStatsMap) {
      box.dispose();
    }
    this.creatureStatsMap.clear();
  }
}
