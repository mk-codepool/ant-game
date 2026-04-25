import { getRandomNumber } from "../random";
import { BaseFauna } from "./entities/base-fauna";
import { Ant } from "./entities/ant";
import type { WorldBorders } from "../world.engine";
import type { BehaviorContext } from "./behavior";
import { TerrainType } from "../world-map/terrain-generator.service";
import { DEFAULT_SIMULATION_CONFIG, type SimulationConfig } from "../simulation/simulation-config";
import { SpatialIndex } from "../simulation/spatial-index";
import { LodScheduler, type CameraBounds } from "../simulation/lod-scheduler";

export class FaunaEngine {
  _creatures = new Map<number, BaseFauna>();
  private _cachedCreatures: BaseFauna[] | null = null;
  private readonly spatialIndex = new SpatialIndex<BaseFauna>(
    DEFAULT_SIMULATION_CONFIG.spatialCellSize
  );
  private readonly lodScheduler = new LodScheduler();
  private nextCreatureId = 1;

  worldBorders: WorldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };
  
  creaturesDef = {
    ant: Ant,
  }

  get creatures(): BaseFauna[] {
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

  setSimulationConfig(config: Partial<SimulationConfig>) {
    this.lodScheduler.setConfig(config);
  }

  setCameraBounds(bounds: CameraBounds) {
    this.lodScheduler.setCameraBounds(bounds);
  }

  getCreaturesInRadius(x: number, y: number, radius: number): BaseFauna[] {
    return this.spatialIndex.queryRadius(x, y, radius, []);
  }

  getCreaturesInBounds(minX: number, maxX: number, minY: number, maxY: number): BaseFauna[] {
    return this.spatialIndex.queryBounds(minX, maxX, minY, maxY, []);
  }

  rebuildSpatialIndex() {
    this.spatialIndex.clear();
    for (const creature of this.creatures) {
      this.spatialIndex.insert(creature);
    }
  }

  clearCreatures() {
    this._creatures.clear();
    this.spatialIndex.clear();
    this._cachedCreatures = null;
  }

  removeCreature(id: number) {
    if (!this._creatures.has(id)) return;
    this._creatures.delete(id);
    this.spatialIndex.remove(id);
    this._cachedCreatures = null;
  }

  getExactCoordinates = (x: number, y: number) => ({
    x: x > this.worldBorders.xStart && x < this.worldBorders.xEnd ? x : 0,
    y: y > this.worldBorders.yStart && y < this.worldBorders.yEnd ? y : 0
  });

  getRandomCoordinates = () => ({
    x: getRandomNumber(this.worldBorders.xStart, this.worldBorders.xEnd),
    y: getRandomNumber(this.worldBorders.yStart, this.worldBorders.yEnd)
  });

  createCreature = <T extends BaseFauna>(newCreature?: new (props: any) => T, x?: number, y?: number) => {
    const CreatureClass = newCreature || this.creaturesDef.ant;
    const dummyCreature = new CreatureClass({ position: {x: 0, y: 0}, id: 0 });
    const hitbox = dummyCreature.hitboxRadius;

    const isTooClose = (testX: number, testY: number) => {
      const nearby = this.getCreaturesInRadius(testX, testY, hitbox * 4);
      for (const c of nearby) {
        const dx = c.position.x - testX;
        const dy = c.position.y - testY;
        const minRadius = c.hitboxRadius + hitbox;
        if (dx * dx + dy * dy < minRadius * minRadius) return true;
      }
      return false;
    };

    let xy = { x: 0, y: 0 };
    if (x === undefined || y === undefined) {
      let attempts = 0;
      do {
        xy = this.getRandomCoordinates();
        attempts++;
      } while (isTooClose(xy.x, xy.y) && attempts < 20);
    } else {
      xy = this.getExactCoordinates(x, y);
      if (isTooClose(xy.x, xy.y)) return;
    }

    const id = this.nextCreatureId++;
    const speed = getRandomNumber(30, 90);
    const creature = new CreatureClass({ position: xy, id, speed });
    this._creatures.set(id, creature);
    this.spatialIndex.insert(creature);
    this._cachedCreatures = null;
  }

  doFrameCycle = (dt: number, context: BehaviorContext) => {
    for (const creature of this.creatures) {
      const oldPosition = { x: creature.position.x, y: creature.position.y };

      if (!creature.isDead()) {
        const tier = this.lodScheduler.classify(creature.position.x, creature.position.y);
        const decision = this.lodScheduler.shouldRun(tier, dt, creature.lodState);
        if (!decision.run) continue;

        creature.update(decision.dt, context);
        this.spatialIndex.update(creature, oldPosition);
        
        // Check biome for drowning
        const cell = context.terrain.getPixelCell(creature.position.x, creature.position.y);
        if (cell && cell.terrain === TerrainType.WATER) {
          // Instant drown
          creature.die('drowned');
        }
      } else {
        // Still call update to increase death timer
        creature.update(dt, context);
        this.spatialIndex.update(creature, oldPosition);
      }
    }
  }

  doSmallCycle = (context?: BehaviorContext) => {
    this.creatures.forEach(thing => {
      thing.ageUp();
      // Keep corpse around for 3 seconds for animation
      if (thing.lifeEnergy <= 0 && (!thing.deathReason || thing.timeSinceDeath > 3)) {
        this.removeCreature(thing.id);
      } else if (thing.lifeEnergy < -20) {
        // Fallback catch-all
        this.removeCreature(thing.id);
      }
    });
  }

  doBigCycle = () => {
  }
}

export default new FaunaEngine();
