import FaunaEngine from "./fauna/main";
import FloraEngine from "./flora/main";
import WorldMapEngine from "./world-map/main";

export interface WorldBorders {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
}

export interface WorldConfig {
  worldBorders?: Partial<WorldBorders>;
}

export class WorldEngine {
  fauna = FaunaEngine;
  flora = FloraEngine;
  terrain = WorldMapEngine;

  worldBorders: WorldBorders = {
    xStart: 0,
    xEnd: 0,
    yStart: 0,
    yEnd: 0,
  }

  setConfig = (config: WorldConfig) => {
    if (config.worldBorders) {
      this.worldBorders = {
        ...this.worldBorders,
        ...config.worldBorders,
      }
      this.fauna.setConfig({ worldBorders: this.worldBorders });
      this.flora.setConfig({ worldBorders: this.worldBorders });
      this.terrain.setConfig({ worldBorders: this.worldBorders });
    }
  }

  doFrameCycle = (dt: number) => {
    // Pass plants and terrain context to fauna
    this.fauna.doFrameCycle(dt, {
      plants: this.flora.plants,
      worldBorders: this.worldBorders,
      terrain: this.terrain,
    });
    
    // Flora frame cycle (e.g. handle eaten plants, growing, dying in wrong biomes)
    this.flora.doFrameCycle(dt, { terrain: this.terrain });
    this.terrain.doFrameCycle(dt);
  }

  doSmallCycle = () => {
    this.fauna.doSmallCycle();
    this.flora.doSmallCycle();
    this.terrain.doSmallCycle();
  }

  doBigCycle = () => {
    this.fauna.doBigCycle();
    this.flora.doBigCycle();
    this.terrain.doBigCycle();
  }
}

export default new WorldEngine();
