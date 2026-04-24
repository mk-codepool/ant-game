import { TerrainType } from "../world-map/terrain-generator.service";
import { TileSystem } from "../world-map/tile-system";
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

  private scanTimerTicks = 0;
  private scanState: 'idle' | 'build_heatmap' | 'process_tiles' = 'idle';
  private currentTileIndex = 0;
  private densityTiles: TileSystem | null = null;
  private heatmap: Int16Array | null = null;

  // Process a chunk of tiles each cycle to prevent lag spikes
  private readonly TILES_PER_CYCLE = 200;

  doSmallCycle(context: BiomeCycleContext): void {
    if (this.scanState === 'idle') {
      this.scanTimerTicks++;
      // Wait for 10 small cycles before initiating a new full-map scan
      if (this.scanTimerTicks >= 10) {
        this.scanTimerTicks = 0;
        this.scanState = 'build_heatmap';
      }
    }

    if (this.scanState === 'build_heatmap') {
      const { flora, terrain } = context;
      
      if (!this.densityTiles) {
        this.densityTiles = new TileSystem(100, terrain.width, terrain.height);
      } else if (this.densityTiles.width !== terrain.width || this.densityTiles.height !== terrain.height) {
        this.densityTiles.setMapSize(terrain.width, terrain.height);
      }

      this.heatmap = new Int16Array(this.densityTiles.cols * this.densityTiles.rows);
      for (const plant of flora.plants) {
        const coord = this.densityTiles.worldToTile(plant.position.x, plant.position.y);
        if (this.densityTiles.isInside(coord.tx, coord.ty)) {
          this.heatmap[coord.ty * this.densityTiles.cols + coord.tx]++;
        }
      }

      this.currentTileIndex = 0;
      this.scanState = 'process_tiles';
    }

    if (this.scanState === 'process_tiles') {
      if (!this.densityTiles || !this.heatmap) {
        this.scanState = 'idle';
        return;
      }

      const { flora, terrain } = context;
      const totalTiles = this.densityTiles.cols * this.densityTiles.rows;
      let processed = 0;

      while (processed < this.TILES_PER_CYCLE && this.currentTileIndex < totalTiles) {
        const tx = this.currentTileIndex % this.densityTiles.cols;
        const ty = Math.floor(this.currentTileIndex / this.densityTiles.cols);
        
        const count = this.heatmap[this.currentTileIndex];
        let chance = 0;

        if (count === 0) chance = 0.005;         // Extra small chance for empty space
        else if (count <= 3) chance = 0.05;      // Small chance for 1-3
        else if (count <= 20) chance = 0.4;      // Normal chance for 3-20
        else if (count <= 40) chance = 0.8;      // Big chance for 20-40
        else chance = 1.0;                       // 100% chance for 40+ bushes
        
        if (Math.random() < chance) {
          let attempts = 0;
          let spawned = false;
          
          const tileStart = this.densityTiles.tileToWorld(tx, ty);

          while (attempts < 10 && !spawned) {
            const px = tileStart.x + Math.random() * this.densityTiles.cellSize;
            const py = tileStart.y + Math.random() * this.densityTiles.cellSize;
            
            const coords = flora.getExactCoordinates(px, py);
            if (coords.x !== 0 || coords.y !== 0) {
              const cell = terrain.getPixelCell(coords.x, coords.y);
              if (cell && cell.terrain === TerrainType.GRASS) {
                flora.createPlant(undefined, coords.x, coords.y);
                spawned = true;
              }
            }
            attempts++;
          }
        }
        
        this.currentTileIndex++;
        processed++;
      }

      // If we've processed all tiles, reset back to idle
      if (this.currentTileIndex >= totalTiles) {
        this.heatmap = null;
        this.scanState = 'idle';
      }
    }
  }

  doBigCycle(context: BiomeCycleContext): void {
    // Left empty: biome events moved to doSmallCycle
  }
}
