import { getRandomNumber } from "../random";
import { Creature } from "./fauna";
import type { WorldBorders } from "../world.engine";
import type { BehaviorContext } from "./behavior";
import { BiomeType } from "../world-map/biome-generator.service";

export class FaunaEngine {
  _creatures = new Map<number, Creature>();
  private _cachedCreatures: Creature[] | null = null;
  private nextCreatureId = 1;

  worldBorders: WorldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };
  
  creaturesDef = {
    creature: Creature,
  }

  get creatures(): Creature[] {
    if (!this._cachedCreatures) {
      this._cachedCreatures = Array.from(this._creatures.values());
    }
    return this._cachedCreatures;
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

  createCreature = (newCreature?: typeof Creature, x?: number, y?: number) => {
    const CreatureClass = newCreature || this.creaturesDef.creature;
    const xy = !x || !y ? this.getRandomCoordinates() : this.getExactCoordinates(x, y);
    const id = this.nextCreatureId++;
    const speed = getRandomNumber(30, 90);
    this._creatures.set(id, new CreatureClass({ position: xy, id, speed }));
    this._cachedCreatures = null;
  }

  doFrameCycle = (dt: number, context: BehaviorContext) => {
    for (const creature of this.creatures) {
      if (!creature.isDead()) {
        creature.update(dt, context);
        
        // Check biome for drowning
        const cell = context.terrain.getPixelCell(creature.position.x, creature.position.y);
        if (cell && cell.biome === BiomeType.WATER) {
          // Instant drown
          creature.die('drowned');
        }
      } else {
        // Still call update to increase death timer
        creature.update(dt, context);
      }
    }
  }

  doSmallCycle = () => {
    this.creatures.forEach(thing => {
      thing.ageUp();
      // Keep corpse around for 3 seconds for animation
      if (thing.lifeEnergy <= 0 && (!thing.deathReason || thing.timeSinceDeath > 3)) {
        this._creatures.delete(thing.id);
        this._cachedCreatures = null;
      } else if (thing.lifeEnergy < -20) {
        // Fallback catch-all
        this._creatures.delete(thing.id);
        this._cachedCreatures = null;
      }
    });
  }

  doBigCycle = () => {
  }
}

export default new FaunaEngine();
