import * as BABYLON from '@babylonjs/core';
import "@babylonjs/core/Meshes/instancedMesh"; // Side-effects required for instancing
import * as GUI from '@babylonjs/gui';
import GE from '../../game-engine';

export class BabylonRenderer {
  private scene: BABYLON.Scene;
  
  // Base meshes
  private floraBase!: BABYLON.Mesh;
  private faunaBase!: BABYLON.Mesh;
  
  // Instances
  private floraInstances: BABYLON.InstancedMesh[] = [];
  private faunaInstances: BABYLON.InstancedMesh[] = [];

  // Terrain
  private terrainGround!: BABYLON.Mesh;
  private terrainTexture!: BABYLON.DynamicTexture;

  // UI
  private uiLayer!: GUI.AdvancedDynamicTexture;
  private creatureStatsMap: Map<number, GUI.Rectangle> = new Map();

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  init() {
    this.initTerrain();
    this.initEntities();
    this.initUI();
    this.initInteractions();
  }

  private initUI() {
    this.uiLayer = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);
  }

  private initInteractions() {
    this.scene.onPointerObservable.add((pointerInfo) => {
      // We only care about hitting the terrain for painting/pathing
      if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh === this.terrainGround) {
        const point = pointerInfo.pickInfo.pickedPoint;
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
    const borders = GE.world.worldBorders;
    const width = borders.xEnd;
    const height = borders.yEnd;

    this.terrainGround = BABYLON.MeshBuilder.CreateGround("terrain", {
      width: width,
      height: height,
      subdivisions: 1
    }, this.scene);
    
    // Abstract system uses (0,0) as top left.
    // So the center of the ground should be (width/2, height/2).
    this.terrainGround.position.x = width / 2;
    this.terrainGround.position.z = height / 2;

    // invertY: true is default for Babylon DynamicTexture, but our canvas logic is topside down.
    this.terrainTexture = new BABYLON.DynamicTexture("terrainTexture", { width, height }, this.scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    
    const terrainMaterial = new BABYLON.StandardMaterial("terrainMat", this.scene);
    terrainMaterial.diffuseTexture = this.terrainTexture;
    terrainMaterial.specularColor = new BABYLON.Color3(0, 0, 0); // No shine
    
    this.terrainGround.material = terrainMaterial;

    // Subscribe to map changes to update the texture dynamically
    GE.world.terrain.onMapChanged.subscribe(() => {
      this.updateTerrainTexture();
    });

    this.updateTerrainTexture();
  }

  private initEntities() {
    // --- Flora base ---
    this.floraBase = BABYLON.MeshBuilder.CreateBox("floraBase", { size: 10 }, this.scene);
    this.floraBase.isVisible = false; // base model is hidden, only instances show
    const floraMat = new BABYLON.StandardMaterial("floraMat", this.scene);
    floraMat.diffuseColor = new BABYLON.Color3(0.3, 0.8, 0.2); // Green
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

    const ctx = this.terrainTexture.getContext();
    const width = GE.world.worldBorders.xEnd;
    const height = GE.world.worldBorders.yEnd;
    
    if (width <= 0) return;

    ctx.clearRect(0, 0, width, height);

    const terrain = GE.world.terrain;
    const cells = Object.values(terrain.cells);
    
    cells.forEach((cell: any) => {
      ctx.fillStyle = cell.color || '#000';
      ctx.fillRect(
        cell.cx * terrain.cellSize,
        cell.cy * terrain.cellSize,
        terrain.cellSize,
        terrain.cellSize
      );
    });

    this.terrainTexture.update();
  }

  sync() {
    // Update Terrain if sizes change, usually it's static after init unless resized
    // For now we don't clear/redraw terrain every frame, it's inefficient.
    // If biome painting happens, we should trigger `this.updateTerrainTexture()` from the mouse controller.

    // --- Flora ---
    const plants = GE.world.flora.plants;
    
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
      inst.position.y = 5; // Half of box size
      
      inst.isVisible = plant.lifeEnergy > 0;
    });

    // --- Fauna ---
    const creatures = GE.world.fauna.creatures;
    
    while (this.faunaInstances.length < creatures.length) {
      const inst = this.faunaBase.createInstance("creature_" + this.faunaInstances.length);
      inst.instancedBuffers["color"] = new BABYLON.Color4(1, 1, 1, 1);
      this.faunaInstances.push(inst);
    }
    while (this.faunaInstances.length > creatures.length) {
      const inst = this.faunaInstances.pop();
      if (inst) inst.dispose();
    }

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
          inst.instancedBuffers["color"] = new BABYLON.Color4(0.3, 0.3, 0.3, 1);
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
        
        // Ensure "color" is applied
        inst.instancedBuffers["color"] = new BABYLON.Color4(r + m, g + m, b + m, 1);
        
        // SYNC UI
        let statBox = this.creatureStatsMap.get(creature.id);
        if (!statBox) {
          statBox = this.createStatBox();
          this.uiLayer.addControl(statBox);
          statBox.linkWithMesh(inst);
          statBox.linkOffsetY = -30;
          this.creatureStatsMap.set(creature.id, statBox);
        }

        const textBlock = statBox.children[0] as GUI.TextBlock;
        textBlock.text = `ID: ${creature.id}\nEng: ${Math.round(creature.lifeEnergy)}\nAge: ${Math.round(creature.age)}\nAct: ${creature.currentBehavior?.name || 'idle'}`;
        
      }
    });

    // Cleanup dead UI
    for (const [id, box] of Array.from(this.creatureStatsMap.entries())) {
      const exists = creatures.find((c: any) => c.id === id && c.lifeEnergy > 0);
      if (!exists) {
        box.dispose();
        this.creatureStatsMap.delete(id);
      }
    }
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
}
