import { getRandomNumber } from "../random";
import type { WorldBorders } from "../world.engine";
import { TerrainType } from "../world-map/terrain-generator.service";
import type { WorldMapEngine } from "../world-map/main";
import { BaseFlora } from "./entities/base-flora";
import { Bush } from "./entities/bush";

export interface FloraContext {
  terrain: WorldMapEngine;
}

export class FloraEngine {
  _plants = new Map<number, BaseFlora>();
  private _cachedPlants: BaseFlora[] | null = null;
  private nextPlantId = 1;

  worldBorders: WorldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };
  
  plantsDef = {
    bush: Bush,
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

  getExactCoordinates = (x: number, y: number) => ({
    x: x > this.worldBorders.xStart && x < this.worldBorders.xEnd ? x : 0,
    y: y > this.worldBorders.yStart && y < this.worldBorders.yEnd ? y : 0
  });

  getRandomCoordinates = () => ({
    x: getRandomNumber(this.worldBorders.xStart, this.worldBorders.xEnd),
    y: getRandomNumber(this.worldBorders.yStart, this.worldBorders.yEnd)
  });

  createPlant = <T extends BaseFlora>(newPlant?: new (props: any) => T, x?: number, y?: number) => {
    const PlantClass = newPlant || this.plantsDef.bush;
    const dummyPlant = new PlantClass({ position: {x: 0, y: 0}, id: 0 }); // to check hitbox radius easily
    const hitbox = dummyPlant.hitboxRadius;

    const isTooClose = (testX: number, testY: number) => {
      for (const p of this.plants) {
        const dx = p.position.x - testX;
        const dy = p.position.y - testY;
        const minRadius = p.hitboxRadius + hitbox;
        if (dx * dx + dy * dy < minRadius * minRadius) return true;
      }
      return false;
    };

    let xy = { x: 0, y: 0 };
    if (!x || !y) {
      let attempts = 0;
      do {
        xy = this.getRandomCoordinates();
        attempts++;
      } while (isTooClose(xy.x, xy.y) && attempts < 20);
    } else {
      xy = this.getExactCoordinates(x, y);
      if (isTooClose(xy.x, xy.y)) return; // prevent spawning if too close
    }

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
        if (cell && (cell.terrain === TerrainType.WATER || cell.terrain === TerrainType.SAND)) {
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
