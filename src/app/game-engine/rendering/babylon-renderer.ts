import * as BABYLON from '@babylonjs/core';
import "@babylonjs/core/Meshes/instancedMesh"; // Side-effects required for instancing
import * as GUI from '@babylonjs/gui';
import GE from '../../game-engine';
import { BiomeType } from '../world-map/biome-generator.service';

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
  [BiomeType.WATER]: {
    low:  [8,   56, 120],    // deep ocean blue
    high: [45, 140, 210],    // shallow turquoise
    edge: [80, 180, 220],    // coastal foam tint
  },
  [BiomeType.SAND]: {
    low:  [180, 155,  90],   // dark wet sand
    high: [240, 220, 160],   // bright dry sand
    edge: [210, 195, 130],   // damp transition
  },
  [BiomeType.GRASS]: {
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
  [BiomeType.WATER]: 1,  // lowest — sits below everything
  [BiomeType.SAND]:  2,  // sand drifts over water
  [BiomeType.GRASS]: 3,  // vegetation overgrows sand & shore
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

/**
 * Compute the raw RGB color for a single pixel of a given biome + elevation.
 * Extracted so both the base cell and blended neighbors use identical rendering.
 */
function computeBiomePixelColor(
  biome: BiomeType, z: number, px: number, py: number
): [number, number, number] {
  const palette = BIOME_PALETTES[biome];
  if (!palette) return [0, 0, 0];

  const elevT = Math.min(1, Math.max(0, (z || 0) / 10));
  const pNoise = pixelNoise(px, py);
  const t = Math.min(1, Math.max(0, elevT + (pNoise - 0.5) * 0.25));

  let r = palette.low[0] + (palette.high[0] - palette.low[0]) * t;
  let g = palette.low[1] + (palette.high[1] - palette.low[1]) * t;
  let b = palette.low[2] + (palette.high[2] - palette.low[2]) * t;

  // Fine-grain brightness dithering
  const dither = (pNoise - 0.5) * 16;
  r += dither;
  g += dither * 0.8;
  b += dither * 0.6;

  // ── Water wave pattern ──
  if (biome === BiomeType.WATER) {
    const wave = Math.sin((px * 0.4 + py * 0.6) * 0.8) * 10;
    r += wave; g += wave * 1.2; b += wave * 0.5;
  }

  // ── Grass blade specks ──
  if (biome === BiomeType.GRASS) {
    if (pNoise > 0.82) { r *= 0.7; g *= 0.85; b *= 0.65; }
    if (pNoise < 0.03) { r = Math.min(255, r + 60); g = Math.min(255, g + 30); b = Math.min(255, b + 50); }
  }

  // ── Sand grain specks ──
  if (biome === BiomeType.SAND) {
    if (pNoise > 0.85) { r = Math.min(255, r + 25); g = Math.min(255, g + 20); b = Math.min(255, b + 10); }
  }

  return [r, g, b];
}

export class BabylonRenderer {
  private scene: BABYLON.Scene;
  private readonly fallbackMapSize = 4000;
  
  // Base meshes
  private floraBase!: BABYLON.Mesh;
  private faunaBase!: BABYLON.Mesh;
  
  // Instances
  private floraInstances: BABYLON.InstancedMesh[] = [];
  private faunaInstances: BABYLON.InstancedMesh[] = [];

  // Terrain
  private terrainGround!: BABYLON.Mesh;
  private terrainTexture!: BABYLON.DynamicTexture;
  private lastTerrainWidth = -1;
  private lastTerrainHeight = -1;

  // UI
  private uiLayer!: GUI.AdvancedDynamicTexture;
  private creatureStatsMap: Map<number, GUI.Rectangle> = new Map();

  // Performance: subscription reference for cleanup
  private mapChangedSub: { unsubscribe: () => void } | null = null;
  // Performance: coalesce multiple onMapChanged into one texture update per frame
  private pendingTextureUpdate = false;

  // Debug pointer
  private cursorMesh!: BABYLON.Mesh;
  private cursorLight!: BABYLON.PointLight;

  // Scene-level lighting additions
  private sunLight!: BABYLON.DirectionalLight;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  init() {
    this.initSceneLighting();
    this.initTerrain();
    this.initEntities();
    this.initUI();
    this.initCursorDebug();
    this.initInteractions();
  }

  /** Add a warm directional "sun" for better depth and material response */
  private initSceneLighting() {
    this.sunLight = new BABYLON.DirectionalLight(
      "sunLight",
      new BABYLON.Vector3(-0.4, -1, 0.6),
      this.scene
    );
    this.sunLight.intensity = 0.6;
    this.sunLight.diffuse = new BABYLON.Color3(1.0, 0.95, 0.85); // warm sun
    this.sunLight.specular = new BABYLON.Color3(0.15, 0.13, 0.10);

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

    // Add a light to illuminate the area under cursor
    this.cursorLight = new BABYLON.PointLight("cursorLight", new BABYLON.Vector3(0, 15, 0), this.scene);
    this.cursorLight.diffuse = new BABYLON.Color3(0.5, 0.9, 1.0); // cool white-blue
    this.cursorLight.intensity = 1.5;
    this.cursorLight.range = 80;
  }

  private initUI() {
    this.uiLayer = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);
  }

  private initInteractions() {
    this.scene.onPointerObservable.add((pointerInfo) => {
      // Find what the scene picks at pointer position
      const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
      
      // We only care about hitting the terrain for painting/pathing
      if (pickResult?.hit && pickResult.pickedMesh === this.terrainGround) {
        const point = pickResult.pickedPoint;
        if (!point) return;
        
        // Abstract engine uses x for X, and y for Z.
        // Also abstract engine works from top-left (0,0) instead of center, but we aligned the ground origin so point.x and point.z directly map to abstract X, Y!
        const abstractX = point.x;
        const abstractY = point.z;

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
          GE.mouseController.triggerDown(abstractX, abstractY);
        } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
          GE.mouseController.triggerUp(abstractX, abstractY);
        } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
          // Send move events or dragging events
          GE.mouseController.triggerMove(abstractX, abstractY);
          if (pointerInfo.event.buttons === 1) {
            // Mouse drag painting (trigger down too since controller might need it)
            GE.mouseController.triggerDown(abstractX, abstractY);
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

    // High-res texture: CELL_DETAIL pixels per cell for crisp intra-cell detail
    const texW = cols * CELL_DETAIL;
    const texH = rows * CELL_DETAIL;
    this.terrainTexture = new BABYLON.DynamicTexture("terrainTexture", { width: texW, height: texH }, this.scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    
    // Use PBR material for realistic lighting interaction
    const terrainMaterial = new BABYLON.PBRMaterial("terrainMat", this.scene);
    terrainMaterial.albedoTexture = this.terrainTexture;
    terrainMaterial.metallic = 0;
    terrainMaterial.roughness = 0.85;    // matte terrain look
    terrainMaterial.environmentIntensity = 0.3;
    // Subtle sheen gives a "dewy" look to grass
    terrainMaterial.sheen.isEnabled = true;
    terrainMaterial.sheen.intensity = 0.15;
    terrainMaterial.sheen.color = new BABYLON.Color3(0.6, 0.8, 0.5);
    
    this.terrainGround.material = terrainMaterial;

    // Subscribe to map changes to update the texture dynamically
    this.mapChangedSub = GE.world.terrain.onMapChanged.subscribe(() => {
      if (!this.pendingTextureUpdate) {
        this.pendingTextureUpdate = true;
        requestAnimationFrame(() => {
          this.updateTerrainTexture();
          this.pendingTextureUpdate = false;
        });
      }
    });

    this.updateTerrainTexture();
  }

  private initEntities() {
    // --- Flora base: use a tapered cylinder instead of a box for a tree-trunk look ---
    this.floraBase = BABYLON.MeshBuilder.CreateCylinder("floraBase", {
      diameterTop: 6,
      diameterBottom: 10,
      height: 12,
      tessellation: 6,
    }, this.scene);
    this.floraBase.isVisible = false; // base model is hidden, only instances show
    const floraMat = new BABYLON.PBRMaterial("floraMat", this.scene);
    floraMat.albedoColor = new BABYLON.Color3(0.2, 0.55, 0.15);
    floraMat.metallic = 0;
    floraMat.roughness = 0.9;
    floraMat.environmentIntensity = 0.2;
    this.floraBase.material = floraMat;
    
    // --- Fauna base ---
    this.faunaBase = BABYLON.MeshBuilder.CreateBox("faunaBase", { size: 6 }, this.scene);
    this.faunaBase.isVisible = false;
    this.faunaBase.registerInstancedBuffer("color", 4); 

    const faunaMat = new BABYLON.StandardMaterial("faunaMat", this.scene);
    faunaMat.diffuseColor = new BABYLON.Color3(1, 1, 1); // White base to multiply with instance color
    this.faunaBase.material = faunaMat;
  }

  public updateTerrainTexture() {
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
    const imgData = ctx.createImageData(texW, texH);
    const data = imgData.data;
    const cells = terrain.cells;

    for (let py = 0; py < texH; py++) {
      for (let px = 0; px < texW; px++) {
        // Which cell does this pixel belong to?
        const cx = Math.floor(px / CELL_DETAIL);
        const cy = Math.floor(py / CELL_DETAIL);
        // Local position within the cell (0..1)
        const lx = (px % CELL_DETAIL) / CELL_DETAIL;
        const ly = (py % CELL_DETAIL) / CELL_DETAIL;

        const cellIdx = cy * cols + cx;
        const cell = cells[cellIdx];

        let r = 0, g = 0, b = 0;

        if (cell) {
          // Base color for this cell's biome
          [r, g, b] = computeBiomePixelColor(cell.biome, cell.z, px, py);

          // ── Biome border blending ──────────────────────────────────────
          const localX = px % CELL_DETAIL;
          const localY = py % CELL_DETAIL;
          const nearEdge =
            localX < BLEND_RADIUS || localX >= CELL_DETAIL - BLEND_RADIUS ||
            localY < BLEND_RADIUS || localY >= CELL_DETAIL - BLEND_RADIUS;

          if (nearEdge) {
            const selfPriority = BIOME_PRIORITY[cell.biome] || 0;
            let totalWeight = 0;
            let blendR = 0, blendG = 0, blendB = 0;

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
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return;

              const neighbor = cells[ny * cols + nx];
              if (!neighbor || neighbor.biome === cell!.biome) return;
              if ((BIOME_PRIORITY[neighbor.biome] || 0) <= selfPriority) return;

              // Noise-perturbed weight → organic jagged border
              const noiseMod = 0.4 + pixelNoise(px + dx * 997, py + dy * 991) * 0.9;
              const weight =
                Math.max(0, Math.min(0.75, (1 - edgeDist / BLEND_RADIUS) * noiseMod))
                * diagScale;

              const [nr, ng, nb] = computeBiomePixelColor(
                neighbor.biome, neighbor.z, px, py
              );
              blendR += nr * weight;
              blendG += ng * weight;
              blendB += nb * weight;
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
                totalWeight = 0.85;
              }
              r = r * (1 - totalWeight) + blendR;
              g = g * (1 - totalWeight) + blendG;
              b = b * (1 - totalWeight) + blendB;
            }
          }
        }

        // Clamp
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));

        // Flip Y for canvas coordinate system
        const canvasY = (texH - 1) - py;
        const offset = (canvasY * texW + px) * 4;
        data[offset]     = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    this.terrainTexture.update();
  }

  private rebuildTerrainMesh(width: number, height: number) {
    if (this.terrainTexture) this.terrainTexture.dispose();
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

    // High-res texture: CELL_DETAIL pixels per cell
    const texW = cols * CELL_DETAIL;
    const texH = rows * CELL_DETAIL;
    this.terrainTexture = new BABYLON.DynamicTexture("terrainTexture", { width: texW, height: texH }, this.scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    
    // Rebuild with PBR material
    const terrainMaterial = new BABYLON.PBRMaterial("terrainMat", this.scene);
    terrainMaterial.albedoTexture = this.terrainTexture;
    terrainMaterial.metallic = 0;
    terrainMaterial.roughness = 0.85;
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
    
    while (this.floraInstances.length < plants.length) {
      this.floraInstances.push(this.floraBase.createInstance("plant_" + this.floraInstances.length));
    }
    while (this.floraInstances.length > plants.length) {
      const inst = this.floraInstances.pop();
      if (inst) inst.dispose();
    }

    plants.forEach((plant: any, index: number) => {
      const inst = this.floraInstances[index];
      inst.position.x = plant.position.x;
      // Convert abstract 2D Y coordinates to 3D Z coordinates
      inst.position.z = plant.position.y;
      inst.position.y = 6; // Half of cylinder height
      
      inst.isVisible = plant.lifeEnergy > 0;
    });

    // --- Fauna ---
    const creatures = GE.world.fauna.creatures;
    if (isFirstSync) console.log('[DEBUG] sync() - Fauna length = ' + creatures.length);
    
    while (this.faunaInstances.length < creatures.length) {
      const inst = this.faunaBase.createInstance("creature_" + this.faunaInstances.length);
      inst.instancedBuffers["color"] = new BABYLON.Color4(1, 1, 1, 1);
      this.faunaInstances.push(inst);
    }
    while (this.faunaInstances.length > creatures.length) {
      const inst = this.faunaInstances.pop();
      if (inst) inst.dispose();
    }

    if (isFirstSync) console.log('[DEBUG] sync() - Fauna instances aligned, entering loop');
    const aliveCreatureIds = new Set<number>();
    creatures.forEach((creature: any, index: number) => {
      const inst = this.faunaInstances[index];
      inst.position.x = creature.position.x;
      inst.position.z = creature.position.y;
      
      // Reset scale and rotation (in case this instance was previously dead and recycled)
      inst.scaling.setAll(1);
      inst.rotation.setAll(0);

      if (creature.lifeEnergy <= 0) {
        if (!creature.deathReason || creature.timeSinceDeath > 3) {
          inst.isVisible = false;
        } else {
          inst.isVisible = true;

          // Death animations based on timeSinceDeath
          if (creature.deathReason === 'drowned') {
             // Sink into the ground: y goes from 3 to -5 over 3 seconds
             inst.position.y = 3 - (creature.timeSinceDeath / 3) * 8;
             // scale down slightly over time
             const scale = Math.max(0.01, 1 - (creature.timeSinceDeath / 3));
             inst.scaling.setAll(scale);
          } else {
             // starve/other: tip over to 90 degrees
             const tipAngle = Math.min(Math.PI / 2, creature.timeSinceDeath * 2); // 90 deg slightly faster
             inst.rotation.x = tipAngle;
             // Sink slightly into ground so it lies flat, half size is 3
             inst.position.y = 3 - Math.sin(tipAngle) * 2;
          }
          // Turn gray
          const deadColor = inst.instancedBuffers["color"] as BABYLON.Color4;
          deadColor.r = 0.3; deadColor.g = 0.3; deadColor.b = 0.3; deadColor.a = 1;
        }
      } else {
        inst.isVisible = true;
        inst.position.y = 3;

        const maxEnergy = 250;
        const energyPercent = Math.min(1, Math.max(0, creature.lifeEnergy / maxEnergy));
        
        // HSL (0-120 hue interval for green/red) mapped to RGB
        const h = energyPercent * 120; // 0 to 120
        const s = 0.7;
        const l = 0.3 + (energyPercent * 0.2); // 0.3 to 0.5
        
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        
        let r = 0, g = 0, b = 0;
        if (0 <= h && h < 60) { r = c; g = x; b = 0; }
        else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
        
        // Mutate existing Color4 to avoid per-frame allocations
        const liveColor = inst.instancedBuffers["color"] as BABYLON.Color4;
        liveColor.r = r + m; liveColor.g = g + m; liveColor.b = b + m; liveColor.a = 1;
        
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
