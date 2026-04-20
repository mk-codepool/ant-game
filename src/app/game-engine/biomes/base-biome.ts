import { TerrainType } from "../world-map/terrain-generator.service";
import type { WorldMapEngine } from "../world-map/main";
import type { FloraEngine } from "../flora/main";
// Import fauna when available/needed
// import type { FaunaEngine } from "../fauna/main";

export interface BiomeCycleContext {
  terrain: WorldMapEngine;
  flora: FloraEngine;
  // fauna: FaunaEngine;
}

export abstract class BaseBiome {
  abstract name: string;
  abstract generateCell(x: number, y: number, noiseVal: number): { terrain: TerrainType, z: number };
  
  abstract doFrameCycle(dt: number, context: BiomeCycleContext): void;
  abstract doSmallCycle(context: BiomeCycleContext): void;
  abstract doBigCycle(context: BiomeCycleContext): void;
}
