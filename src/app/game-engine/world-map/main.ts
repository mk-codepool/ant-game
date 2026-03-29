import { BiomeGenerator, BiomeType } from './biome-generator.service';

export interface WorldCell {
  cx: number;
  cy: number;
  biome: BiomeType;
  z: number;
  color?: string;
}

export const BiomeColors: Record<BiomeType, [number, number, number]> = {
  [BiomeType.WATER]: [30, 144, 255], // DodgerBlue
  [BiomeType.SAND]: [238, 221, 130], // LightGoldenrod
  [BiomeType.GRASS]: [60, 179, 113], // MediumSeaGreen
};

export interface WorldMapConfig {
  worldBorders?: {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  }
}

export class WorldMapEngine {
  cells: Record<string, WorldCell> = {};
  generator = new BiomeGenerator();

  width = 0;
  height = 0;
  cellSize = 20;

  worldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };

  setConfig = (config: WorldMapConfig) => {
    if (config.worldBorders) {
      this.worldBorders = config.worldBorders;
      this.width = this.worldBorders.xEnd;
      this.height = this.worldBorders.yEnd;
      this.generateMap();
    }
  }

  generateMap() {
    if (this.width <= 0 || this.height <= 0) return;
    
    // Clear old map completely when generating anew
    this.cells = {};

    const cols = Math.ceil(this.width / this.cellSize);
    const rows = Math.ceil(this.height / this.cellSize);

    // Scale controls the zoom level of the noise
    const scale = 0.05;

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        // Range 0 to ~1
        const noiseVal = this.generator.fractalNoise(x * scale, y * scale);
        
        // Thresholding
        let biome = BiomeType.WATER;
        if (noiseVal > 0.45 && noiseVal <= 0.55) {
            biome = BiomeType.SAND;
        } else if (noiseVal > 0.55) {
            biome = BiomeType.GRASS;
        }

        // Z scale mapping (0 to 10 for example)
        this.setCell(x, y, { cx: x, cy: y, biome, z: Math.floor(noiseVal * 10) });
      }
    }

    // Second pass: Update colors to blend borders
    this.recalculateColors();
  }

  recalculateColors() {
    const cols = Math.ceil(this.width / this.cellSize);
    const rows = Math.ceil(this.height / this.cellSize);

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        this.updateCellColor(x, y);
      }
    }
  }

  blurFactor = 0.5; // 0 = no blur, 1 = full 3x3 blur

  updateCellColor(cx: number, cy: number) {
    const cell = this.getCell(cx, cy);
    if (!cell) return;

    let r = 0, g = 0, b = 0;
    let count = 0;

    // Look at 3x3 area for blending
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbor = this.getCell(cx + dx, cy + dy);
        // If out of bounds, count as the same biome to keep edges solid
        const biome = neighbor ? neighbor.biome : cell.biome;
        const color = BiomeColors[biome];
        r += color[0];
        g += color[1];
        b += color[2];
        count++;
      }
    }

    const blurredR = r / count;
    const blurredG = g / count;
    const blurredB = b / count;
    
    const baseColor = BiomeColors[cell.biome];

    // Interpolate between the completely raw cell color and the blurred average
    const finalR = Math.round(baseColor[0] * (1 - this.blurFactor) + blurredR * this.blurFactor);
    const finalG = Math.round(baseColor[1] * (1 - this.blurFactor) + blurredG * this.blurFactor);
    const finalB = Math.round(baseColor[2] * (1 - this.blurFactor) + blurredB * this.blurFactor);

    cell.color = `rgb(${finalR}, ${finalG}, ${finalB})`;
  }

  reseedMap() {
      this.generator.reseed();
      this.generateMap();
  }

  getHash(cx: number, cy: number) {
      return `${cx}_${cy}`;
  }

  setPixelBiome(px: number, py: number, biome: BiomeType) {
      const cx = Math.floor(px / this.cellSize);
      const cy = Math.floor(py / this.cellSize);
      
      const c = this.getCell(cx, cy);
      if (c) {
          c.biome = biome;
      } else {
          this.setCell(cx, cy, { cx, cy, biome, z: 1 });
      }

      // Update color for this cell and its neighbors so blending updates in real-time
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          this.updateCellColor(cx + dx, cy + dy);
        }
      }
  }

  getPixelCell(px: number, py: number): WorldCell | undefined {
      const cx = Math.floor(px / this.cellSize);
      const cy = Math.floor(py / this.cellSize);
      return this.getCell(cx, cy);
  }

  getCell(cx: number, cy: number): WorldCell | undefined {
      return this.cells[this.getHash(cx, cy)];
  }

  setCell(cx: number, cy: number, cell: WorldCell) {
      this.cells[this.getHash(cx, cy)] = cell;
  }

  doFrameCycle = (dt: number) => {
    // Terrain doesn't need much logic yet
  }

  doSmallCycle = () => {}
  doBigCycle = () => {}
}

export default new WorldMapEngine();
