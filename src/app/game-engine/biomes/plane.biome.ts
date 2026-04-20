import { TerrainType } from "../world-map/terrain-generator.service";
import { BaseBiome, type BiomeCycleContext } from "./base-biome";

export class PlaneBiome extends BaseBiome {
  name = "Plane";

  generateCell(x: number, y: number, noiseVal: number): { terrain: TerrainType, z: number } {
    let terrain = TerrainType.WATER;
    if (noiseVal > 0.25 && noiseVal <= 0.35) {
      terrain = TerrainType.SAND;
    } else if (noiseVal > 0.35) {
      terrain = TerrainType.GRASS;
    }
    return { terrain, z: Math.floor(noiseVal * 10) };
  }

  doFrameCycle(dt: number, context: BiomeCycleContext): void {}

  private smallCycleCount = 0;

  doSmallCycle(context: BiomeCycleContext): void {
    this.smallCycleCount++;
    
    // Attempt a spawn every 10 small cycles (~10 seconds)
    if (this.smallCycleCount >= 10) {
      this.smallCycleCount = 0;
      
      const { flora, terrain } = context;
      let attempts = 0;
      let spawned = false;
      
      // 80% chance to cluster around an existing plant
      let targetCenter: { x: number, y: number } | null = null;
      if (flora.plants.length > 0 && Math.random() < 0.8) {
        const randomPlant = flora.plants[Math.floor(Math.random() * flora.plants.length)];
        targetCenter = { x: randomPlant.position.x, y: randomPlant.position.y };
      }

      while (attempts < 15 && !spawned) {
        let coords: { x: number, y: number };
        
        if (targetCenter) {
          const angle = Math.random() * Math.PI * 2;
          const distance = 15 + Math.random() * 30;
          coords = {
            x: targetCenter.x + Math.cos(angle) * distance,
            y: targetCenter.y + Math.sin(angle) * distance
          };
          coords = flora.getExactCoordinates(coords.x, coords.y);
          if (coords.x === 0 && coords.y === 0) {
            coords = flora.getRandomCoordinates();
          }
        } else {
          coords = flora.getRandomCoordinates();
        }

        const cell = terrain.getPixelCell(coords.x, coords.y);
        
        if (cell && cell.terrain === TerrainType.GRASS) {
          flora.createPlant(undefined, coords.x, coords.y);
          spawned = true;
        }
        attempts++;
      }
    }
  }

  doBigCycle(context: BiomeCycleContext): void {
    // Currently empty as spawning moved to doSmallCycle
  }
}
