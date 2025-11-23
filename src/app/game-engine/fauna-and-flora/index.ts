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
  _creatures: { [id: string]: Creature } = {};
  _plants: { [id: string]: Plant } = {};
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
    return Array.from(Object.values(this._creatures));
  }

  get plants() {
    return Array.from(Object.values(this._plants));
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
    const id = `${xy.x}${xy.y}`;
    this._creatures[id] = new CreatureClass({ x: xy.x, y: xy.y, id });
  }

  createPlant = (newPlant?: typeof Plant, x?: number, y?: number) => {
    const PlantClass = newPlant || this.plantsDef.plant;
    const xy = !x || !y ? this.getRandomCoordinates() : this.getExactCoordinates(x, y);
    const id = `${xy.x}${xy.y}`;
    this._plants[id] = new PlantClass({ x: xy.x, y: xy.y, id });
  }

  doFrameCycle = () => {
    [...this.creatures, ...this.plants].filter(thing => thing.lifeEnergy > 0).forEach(thing => {
      const randomNumber = getRandomNumber(0, 100);
      thing.move();
      if (randomNumber > 98) {
        thing.setTarget(this.getRandomCoordinates());
      }
    });
  }

  doSmallCycle = () => {
    [...this.creatures, ...this.plants].forEach(thing => {
      thing.ageUp();
      if (thing.lifeEnergy < -20) {
        // console.log(thing.lifeEnergy)
        if (thing instanceof Creature) {
          delete this._creatures[thing.id];
        } else if (thing instanceof Plant) {
          delete this._plants[thing.id];
        }
      }
    });
  }

  doBigCycle = () => {
  }
}
