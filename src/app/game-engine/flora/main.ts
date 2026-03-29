import { getRandomNumber } from "../random";
import { Plant } from "./flora";
import type { WorldBorders } from "../world.engine";

export class FloraEngine {
  _plants = new Map<number, Plant>();
  private nextPlantId = 1;

  worldBorders: WorldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };
  
  plantsDef = {
    plant: Plant,
  }

  get plants() {
    return Array.from(this._plants.values());
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
  }

  doFrameCycle = (dt: number) => {
    // Remove consumed plants
    for (const plant of this.plants) {
      if (plant.isConsumed()) {
        this._plants.delete(plant.id);
      }
    }
  }

  doSmallCycle = () => {
    this.plants.forEach(thing => {
      thing.ageUp();
      if (thing.lifeEnergy < -20) {
        this._plants.delete(thing.id);
      }
    });
  }

  doBigCycle = () => {
  }
}

export default new FloraEngine();
