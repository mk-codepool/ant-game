import { getRandomNumber } from "../random";
import { Plant } from "./flora";
import type { WorldBorders } from "../world.engine";
import { BiomeType } from "../world-map/biome-generator.service";
import type { WorldMapEngine } from "../world-map/main";

export interface FloraContext {
  terrain: WorldMapEngine;
}

export class FloraEngine {
  _plants = new Map<number, Plant>();
  private _cachedPlants: Plant[] | null = null;
  private nextPlantId = 1;

  worldBorders: WorldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };
  
  plantsDef = {
    plant: Plant,
  }

  get plants(): Plant[] {
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

  getExactCoordinates = (x: number, y: number) => ({
    x: x > this.worldBorders.xStart && x < this.worldBorders.xEnd ? x : 0,
    y: y > this.worldBorders.yStart && y < this.worldBorders.yEnd ? y : 0
  });

  getRandomCoordinates = () => ({
    x: getRandomNumber(this.worldBorders.xStart, this.worldBorders.xEnd),
    y: getRandomNumber(this.worldBorders.yStart, this.worldBorders.yEnd)
  });

  createPlant = (newPlant?: typeof Plant, x?: number, y?: number) => {
    const PlantClass = newPlant || this.plantsDef.plant;
    const xy = !x || !y ? this.getRandomCoordinates() : this.getExactCoordinates(x, y);
    const id = this.nextPlantId++;
    this._plants.set(id, new PlantClass({ position: xy, id }));
    this._cachedPlants = null;
  }

  doFrameCycle = (dt: number, context: FloraContext) => {
    // Handle environment logic first
    for (const plant of this.plants) {
      if (!plant.isDead()) {
        const cell = context.terrain.getPixelCell(plant.position.x, plant.position.y);
        // Flora dies instantly in Water or Sand
        if (cell && (cell.biome === BiomeType.WATER || cell.biome === BiomeType.SAND)) {
          plant.modifyEnergy(-plant.lifeEnergy); // Instant kill
        }
      }
    }

    // Remove consumed and dead plants
    for (const plant of this.plants) {
      if (plant.isConsumed() || plant.isDead()) {
        this._plants.delete(plant.id);
        this._cachedPlants = null;
      }
    }
  }

  doSmallCycle = () => {
    this.plants.forEach(thing => {
      thing.ageUp();
      if (thing.lifeEnergy < -20) {
        this._plants.delete(thing.id);
        this._cachedPlants = null;
      }
    });
  }

  doBigCycle = () => {
  }
}

export default new FloraEngine();
