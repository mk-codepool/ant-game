import { BaseBiome, type BiomeCycleContext } from "./base-biome";
import { PlaneBiome } from "./plane.biome";
import type { WorldConfig } from "../world.engine";

export class BiomesEngine {
  activeBiome: BaseBiome;

  constructor() {
    this.activeBiome = new PlaneBiome();
  }

  setConfig(config: WorldConfig) {
    // handled inside world engine if needed
  }

  doFrameCycle(dt: number, context: BiomeCycleContext) {
    this.activeBiome.doFrameCycle(dt, context);
  }

  doSmallCycle(context: BiomeCycleContext) {
    this.activeBiome.doSmallCycle(context);
  }

  doBigCycle(context: BiomeCycleContext) {
    this.activeBiome.doBigCycle(context);
  }
}

export default new BiomesEngine();
