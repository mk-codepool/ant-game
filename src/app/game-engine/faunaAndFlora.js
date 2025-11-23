import { getRandomNumber } from "./random";

class Life {
  id = '';
  age = 0;
  lifeEnergy = 0;
  target = {
    x: 0,
    y: 0,
  };
  x = 0;
  y = 0;

  constructor(props) {
    const { x, y, id } = props;
    this.setPosition({ x, y });
    this.id = id;
  }

  ageUp = () => {
    this.age++;
    this.lifeEnergy--;
  }

  move = () => {}

  setPosition = ({ x, y }) => {
    this.x = x;
    this.y = y;
  }

  setTarget = ({ x, y }) => {
    this.target = {
      x,
      y
    }
  }
}

class Creature extends Life {
  constructor(props) {
    super(props);
    this.lifeEnergy = 20;
  }

  move = () => {
    this.x = this.x > this.target.x ? this.x - 1 : this.x + 1;
    this.y = this.y > this.target.y ? this.y - 1 : this.y + 1;
  }
}

class Plant extends Life {
  constructor(props) {
    super(props);
    this.lifeEnergy = 200;
  }
}

export default class FaunaAndFlora {
  _creatures = {};
  _plants = {};
  randomNumber = 0;
  worldBorders = {
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

  setConfig = (config) => {
    const { worldBorders } = config;
    this.worldBorders = {
      ...this.worldBorders,
      ...worldBorders,
    }
  }

  getExactCoordinates = (x, y) => ({
    x: x > this.worldBorders.xStart && x < this.worldBorders.xEnd ? x : 0,
    y: y > this.worldBorders.yStart && y < this.worldBorders.yEnd ? y : 0
  });

  getRandomCoordinates = () => ({
    x: getRandomNumber(this.worldBorders.xStart, this.worldBorders.xEnd),
    y: getRandomNumber(this.worldBorders.yStart, this.worldBorders.yEnd)
  });

  createCreature = (newCreature, x, y) => {
    const Creature = newCreature || this.creaturesDef.creature;
    const xy = !x || !y ? this.getRandomCoordinates() : this.getExactCoordinates(x, y);
    const id = `${xy.x}${xy.y}`;
    this._creatures[id] = new Creature({ x: xy.x, y: xy.y, id });
  }

  createPlant = (newPlant, x, y) => {
    const Plant = newPlant || this.plantsDef.plant;
    const xy = !x || !y ? this.getRandomCoordinates() : this.getExactCoordinates(x, y);
    const id = `${xy.x}${xy.y}`;
    this._plants[id] = new Plant({ x: xy.x, y: xy.y, id });
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
        console.log(thing.lifeEnergy)
        delete this._creatures[thing.id];
      }
    });
  }
  
  doBigCycle = () => {
  }
}
