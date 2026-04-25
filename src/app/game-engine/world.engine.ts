import FaunaEngine from "./fauna/main";
import FloraEngine from "./flora/main";
import WorldMapEngine from "./world-map/main";
import BiomesEngine from "./biomes/main";
import type { CameraBounds } from "./simulation/lod-scheduler";
import type { SimulationConfig } from "./simulation/simulation-config";

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
  biomes = BiomesEngine;

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
      this.biomes.setConfig({ worldBorders: this.worldBorders });
    }
  }

  setSimulationConfig = (config: Partial<SimulationConfig>) => {
    this.fauna.setSimulationConfig(config);
  }

  setCameraBounds = (bounds: CameraBounds) => {
    this.fauna.setCameraBounds(bounds);
  }

  doFrameCycle = (dt: number) => {
    this.fauna.doFrameCycle(dt, {
      plants: this.flora.plants,
      creatures: this.fauna.creatures,
      worldBorders: this.worldBorders,
      terrain: this.terrain,
      getNearbyPlants: (x, y, radius) => this.flora.getPlantsInRadius(x, y, radius),
      getNearbyCreatures: (x, y, radius) => this.fauna.getCreaturesInRadius(x, y, radius)
    });
    
    // Flora frame cycle (e.g. handle eaten plants, growing, dying in wrong biomes)
    this.flora.doFrameCycle(dt, { terrain: this.terrain });
    this.terrain.doFrameCycle(dt);
    
    // Biomes frame cycle
    this.biomes.doFrameCycle(dt, {
      terrain: this.terrain,
      flora: this.flora,
    });
  }

  doSmallCycle = () => {
    this.fauna.doSmallCycle({
      plants: this.flora.plants,
      creatures: this.fauna.creatures,
      worldBorders: this.worldBorders,
      terrain: this.terrain,
      getNearbyPlants: (x, y, radius) => this.flora.getPlantsInRadius(x, y, radius),
      getNearbyCreatures: (x, y, radius) => this.fauna.getCreaturesInRadius(x, y, radius)
    });
    this.flora.doSmallCycle();
    this.terrain.doSmallCycle();
    this.biomes.doSmallCycle({
      terrain: this.terrain,
      flora: this.flora,
    });
  }

  doBigCycle = () => {
    this.fauna.doBigCycle();
    this.flora.doBigCycle();
    this.terrain.doBigCycle();
    this.biomes.doBigCycle({
      terrain: this.terrain,
      flora: this.flora,
    });
  }
}

export default new WorldEngine();
