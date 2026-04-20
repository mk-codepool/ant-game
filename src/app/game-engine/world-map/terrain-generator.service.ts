export enum TerrainType {
  GRASS = 'Grass',
  SAND = 'Sand',
  WATER = 'Water'
}

export class TerrainGenerator {
  // A simple value noise generator
  private seed: number[] = [];

  constructor(private seedLength = 256) {
    this.reseed();
  }

  public reseed() {
    this.seed = Array.from({ length: this.seedLength }, () => Math.random());
  }

  // Linear interpolation
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  // Smoothstep
  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private noise2D(x: number, y: number): number {
    const size = this.seed.length;
    
    // Grid cell coordinates
    let x0 = Math.floor(x);
    let y0 = Math.floor(y);
    let x1 = x0 + 1;
    let y1 = y0 + 1;

    // Local coordinates inside the cell
    let sx = x - x0;
    let sy = y - y0;

    // Wrap coordinates to stay within the seed size
    x0 = x0 % size;
    y0 = y0 % size;
    x1 = x1 % size;
    y1 = y1 % size;

    // Handle negative numbers
    if (x0 < 0) x0 += size;
    if (y0 < 0) y0 += size;
    if (x1 < 0) x1 += size;
    if (y1 < 0) y1 += size;

    // Pseudo-random hashing based on coordinates
    const hash2 = (ix: number, iy: number) => {
        return this.seed[(ix * 137 + iy * 239) % size];
    };

    const n00 = hash2(x0, y0);
    const n10 = hash2(x1, y0);
    const n01 = hash2(x0, y1);
    const n11 = hash2(x1, y1);

    const u = this.smoothstep(sx);
    const v = this.smoothstep(sy);

    const nx0 = this.lerp(n00, n10, u);
    const nx1 = this.lerp(n01, n11, u);
    
    return this.lerp(nx0, nx1, v);
  }

  // Fractal noise
  public fractalNoise(x: number, y: number, octaves = 4, persistence = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxVal = 0;
    
    for(let i=0; i<octaves; i++) {
        total += this.noise2D(x * frequency, y * frequency) * amplitude;
        maxVal += amplitude;
        amplitude *= persistence;
        frequency *= 2;
    }
    
    return total / maxVal;
  }
}
