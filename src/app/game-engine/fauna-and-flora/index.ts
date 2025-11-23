import { getRandomNumber } from "../random";
import { Creature } from "./fauna";
import { Plant } from "./flora";

export interface WorldBorders {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
}

export interface FaunaAndFloraConfig {
  worldBorders?: Partial<WorldBorders>;
}

export default class FaunaAndFlora {
  _creatures = new Map<number, Creature>();
  _plants = new Map<number, Plant>();
  private nextCreatureId = 1;
  private nextPlantId = 1;

  randomNumber = 0;
  worldBorders: WorldBorders = {
    xStart: 0,
    xEnd: 0,
    yStart: 0,
    yEnd: 0,
  }
  creaturesDef = {
    creature: Creature,
  }
  plantsDef = {
    plant: Plant,
  }

  get creatures() {
    return Array.from(this._creatures.values());
  }

  get plants() {
    return Array.from(this._plants.values());
  }

  setConfig = (config: FaunaAndFloraConfig) => {
    const { worldBorders } = config;
    if (worldBorders) {
      this.worldBorders = {
        ...this.worldBorders,
        ...worldBorders,
      }
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

  createCreature = (newCreature?: typeof Creature, x?: number, y?: number) => {
    const CreatureClass = newCreature || this.creaturesDef.creature;
    const xy = !x || !y ? this.getRandomCoordinates() : this.getExactCoordinates(x, y);
    const id = this.nextCreatureId++;
    this._creatures.set(id, new CreatureClass({ x: xy.x, y: xy.y, id }));
  }

  createPlant = (newPlant?: typeof Plant, x?: number, y?: number) => {
    const PlantClass = newPlant || this.plantsDef.plant;
    const xy = !x || !y ? this.getRandomCoordinates() : this.getExactCoordinates(x, y);
    const id = this.nextPlantId++;
    this._plants.set(id, new PlantClass({ x: xy.x, y: xy.y, id }));
  }

  doFrameCycle = (dt: number) => {
    const things = [...this.creatures, ...this.plants];
    for (const thing of things) {
      if (thing.lifeEnergy > 0) {
        const randomNumber = getRandomNumber(0, 100);
        thing.move(dt);
        if (randomNumber > 98) {
          thing.setTarget(this.getRandomCoordinates());
        }
      }
    }
  }

  doSmallCycle = () => {
    [...this.creatures, ...this.plants].forEach(thing => {
      thing.ageUp();
      if (thing.lifeEnergy < -20) {
        if (thing instanceof Creature) {
          this._creatures.delete(thing.id);
        } else if (thing instanceof Plant) {
          this._plants.delete(thing.id);
        }
      }
    });
  }

  doBigCycle = () => {
  }
}
