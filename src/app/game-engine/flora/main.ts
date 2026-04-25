import { getRandomNumber } from "../random";
import type { WorldBorders } from "../world.engine";
import { TerrainType } from "../world-map/terrain-generator.service";
import terrainEngine, { type WorldMapEngine } from "../world-map/main";
import { DEFAULT_SIMULATION_CONFIG } from "../simulation/simulation-config";
import { SpatialIndex } from "../simulation/spatial-index";
import { BaseFlora } from "./entities/base-flora";
import { Bush } from "./entities/bush";
import { Tree } from "./entities/tree";

export interface FloraContext {
  terrain: WorldMapEngine;
}

export class FloraEngine {
  _plants = new Map<number, BaseFlora>();
  private _cachedPlants: BaseFlora[] | null = null;
  private readonly spatialIndex = new SpatialIndex<BaseFlora>(
    DEFAULT_SIMULATION_CONFIG.spatialCellSize
  );
  private nextPlantId = 1;

  worldBorders: WorldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };
  
  plantsDef = {
    bush: Bush,
    tree: Tree,
  }

  get plants(): BaseFlora[] {
    if (!this._cachedPlants) {
      this._cachedPlants = Array.from(this._plants.values());
    }
    return this._cachedPlants;
  }

  setConfig = (config: { worldBorders?: WorldBorders }) => {
    if (config.worldBorders) {
       this.worldBorders = config.worldBorders;
    }
  }

  getPlantsInRadius(x: number, y: number, radius: number): BaseFlora[] {
    return this.spatialIndex.queryRadius(x, y, radius, []);
  }

  getPlantsInBounds(minX: number, maxX: number, minY: number, maxY: number): BaseFlora[] {
    return this.spatialIndex.queryBounds(minX, maxX, minY, maxY, []);
  }

  rebuildSpatialIndex() {
    this.spatialIndex.clear();
    for (const p of this.plants) {
      if (p.lifeEnergy <= 0) continue;
      this.spatialIndex.insert(p);
    }
  }

  clearPlants() {
    this._plants.clear();
    this.spatialIndex.clear();
    this._cachedPlants = null;
  }

  getExactCoordinates = (x: number, y: number) => ({
    x: x > this.worldBorders.xStart && x < this.worldBorders.xEnd ? x : 0,
    y: y > this.worldBorders.yStart && y < this.worldBorders.yEnd ? y : 0
  });

  getRandomCoordinates = () => ({
    x: getRandomNumber(this.worldBorders.xStart, this.worldBorders.xEnd),
    y: getRandomNumber(this.worldBorders.yStart, this.worldBorders.yEnd)
  });

  createPlant = <T extends BaseFlora>(newPlant?: new (props: any) => T, x?: number, y?: number) => {
    const defaultPlantClass = Math.random() < 0.2 ? this.plantsDef.tree : this.plantsDef.bush;
    const PlantClass = newPlant || defaultPlantClass;
    const dummyPlant = new PlantClass({ position: {x: 0, y: 0}, id: 0 }); // to check hitbox radius easily
    const hitbox = dummyPlant.hitboxRadius;

    const isTooClose = (testX: number, testY: number) => {
      const searchRadius = hitbox + 50; // Add some margin for nearby plants' hitboxes
      const nearbyPlants = this.getPlantsInRadius(testX, testY, searchRadius);
      for (const p of nearbyPlants) {
        const dx = p.position.x - testX;
        const dy = p.position.y - testY;
        const minRadius = p.hitboxRadius + hitbox;
        if (dx * dx + dy * dy < minRadius * minRadius) return true;
      }
      return false;
    };

    let xy = { x: 0, y: 0 };
    if (x === undefined || y === undefined) {
      let attempts = 0;
      let valid = false;
      do {
        xy = this.getRandomCoordinates();
        const cell = terrainEngine.getPixelCell(xy.x, xy.y);
        const isGrass = cell ? cell.terrain === TerrainType.GRASS : false;
        valid = isGrass && !isTooClose(xy.x, xy.y);
        attempts++;
      } while (!valid && attempts < 20);

      if (!valid) return;
    } else {
      xy = this.getExactCoordinates(x, y);
      const cell = terrainEngine.getPixelCell(xy.x, xy.y);
      if (!cell || cell.terrain !== TerrainType.GRASS) return;
      if (isTooClose(xy.x, xy.y)) return; // prevent spawning if too close
    }

    const id = this.nextPlantId++;
    const plant = new PlantClass({ position: xy, id });
    this._plants.set(id, plant);
    this.spatialIndex.insert(plant);
    this._cachedPlants = null;
  }

  removePlant(id: number) {
    if (this._plants.has(id)) {
      this._plants.delete(id);
      this.spatialIndex.remove(id);
      this._cachedPlants = null;
    }
  }

  clearInvalidPlants(terrain: WorldMapEngine, centerX: number, centerY: number, radius: number) {
    const radiusSquared = radius * radius;
    const plants = this.getPlantsInRadius(centerX, centerY, radius);
    for (const plant of plants) {
      const dx = plant.position.x - centerX;
      const dy = plant.position.y - centerY;
      if (dx * dx + dy * dy <= radiusSquared) {
         // Plant is inside the modified brush circle, check if it was overwritten by Sand or Water
         const cell = terrain.getPixelCell(plant.position.x, plant.position.y);
         if (cell && (cell.terrain === TerrainType.WATER || cell.terrain === TerrainType.SAND)) {
             this.removePlant(plant.id);
         }
      }
    }
  }

  doFrameCycle = (dt: number, context: FloraContext) => {
    // Intentionally left empty as per optimization logic:
    // Plats do not recalculate their live states every frame. They wait for external events to modify stats.
  }

  doSmallCycle = () => {
    // Intentionally left empty - no aging calculation tick needed
  }

  doBigCycle = () => {
    // Very infrequent lazy cleanup in case external methods missed garbage collecting dead flora
    for (const plant of this.plants) {
      if (plant.isConsumed() || plant.isDead()) {
        this.removePlant(plant.id);
      }
    }
  }
}

export default new FloraEngine();
