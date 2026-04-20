import { Subject } from 'rxjs';
import * as EasyStar from 'easystarjs';
import { TerrainGenerator, TerrainType } from './terrain-generator.service';
import { TileSystem, type TileCoord, type WorldPoint } from './tile-system';
import biomesEngine from '../biomes/main';

export interface WorldCell {
  cx: number;
  cy: number;
  terrain: TerrainType;
  z: number;
  color?: string;
}

export const TerrainColors: Record<TerrainType, [number, number, number]> = {
  [TerrainType.WATER]: [30, 144, 255], // DodgerBlue
  [TerrainType.SAND]: [238, 221, 130], // LightGoldenrod
  [TerrainType.GRASS]: [60, 179, 113], // MediumSeaGreen
};

const TerrainPathCodes: Record<TerrainType, number> = {
  [TerrainType.GRASS]: 1,
  [TerrainType.SAND]: 2,
  [TerrainType.WATER]: 3,
};

export interface WorldMapConfig {
  worldBorders?: {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  }
}

export interface TilePathOptions {
  walkableBiomes?: TerrainType[];
  allowDiagonals?: boolean;
  iterationsPerCalculation?: number;
  tileCosts?: Partial<Record<TerrainType, number>>;
}

export interface DirtyRect {
  minTx: number;
  minTy: number;
  maxTx: number;
  maxTy: number;
}

export class WorldMapEngine {
  cells: WorldCell[] = [];
  generator = new TerrainGenerator();
  onMapChanged = new Subject<DirtyRect | null>();

  width = 0;
  height = 0;
  cellSize = 20;
  tiles = new TileSystem(this.cellSize, this.width, this.height);

  worldBorders = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };

  setConfig = (config: WorldMapConfig) => {
    if (config.worldBorders) {
      this.worldBorders = config.worldBorders;
      this.setMapDimensions(this.worldBorders.xEnd, this.worldBorders.yEnd);
      this.generateMap();
    }
  }

  setCellSize = (cellSize: number) => {
    this.cellSize = Math.max(1, Math.floor(cellSize));
    this.tiles.setCellSize(this.cellSize);
  }

  setMapDimensions = (width: number, height: number) => {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.tiles.setMapSize(this.width, this.height);
  }

  getTileAtWorld = (x: number, y: number): TileCoord => {
    return this.tiles.worldToTile(x, y);
  }

  getTileCenter = (tx: number, ty: number): WorldPoint => {
    return this.tiles.getTileCenter(tx, ty);
  }

  getTileNeighbors = (tx: number, ty: number, includeDiagonals = false): TileCoord[] => {
    return this.tiles.getNeighbors(tx, ty, includeDiagonals);
  }

  forEachTileInWorldRect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    callback: (coord: TileCoord) => void
  ) => {
    this.tiles.forEachTileInWorldRect(x1, y1, x2, y2, callback);
  }

  setTileBiome = (tx: number, ty: number, terrain: TerrainType, emitChange = true): boolean => {
    if (!this.tiles.isInside(tx, ty)) return false;

    const current = this.getCell(tx, ty);
    if (current) {
      const color = TerrainColors[terrain];
      current.terrain = terrain;
      current.color = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    } else {
      this.setCell(tx, ty, { cx: tx, cy: ty, terrain, z: 1 });
    }

    if (emitChange) {
      this.onMapChanged.next({ minTx: tx, minTy: ty, maxTx: tx, maxTy: ty });
    }
    return true;
  }

  paintBiomeCircle = (centerX: number, centerY: number, radius: number, terrain: TerrainType): number => {
    if (radius <= 0) return 0;

    const radiusSquared = radius * radius;
    let changedTiles = 0;

    let minTx = Infinity, minTy = Infinity, maxTx = -Infinity, maxTy = -Infinity;

    this.forEachTileInWorldRect(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius,
      ({ tx, ty }) => {
        const center = this.getTileCenter(tx, ty);
        const dx = center.x - centerX;
        const dy = center.y - centerY;

        if ((dx * dx) + (dy * dy) <= radiusSquared) {
          const changed = this.setTileBiome(tx, ty, terrain, false);
          if (changed) {
            changedTiles++;
            if (tx < minTx) minTx = tx;
            if (ty < minTy) minTy = ty;
            if (tx > maxTx) maxTx = tx;
            if (ty > maxTy) maxTy = ty;
          }
        }
      }
    );

    if (changedTiles > 0) {
      this.onMapChanged.next({ minTx, minTy, maxTx, maxTy });
    }

    return changedTiles;
  }

  findTilePath = async (
    start: TileCoord,
    end: TileCoord,
    options: TilePathOptions = {}
  ): Promise<TileCoord[]> => {
    if (!this.tiles.isInside(start.tx, start.ty) || !this.tiles.isInside(end.tx, end.ty)) {
      return [];
    }

    const pathfinder = this.createPathfinder(options);

    return new Promise<TileCoord[]>((resolve) => {
      pathfinder.findPath(start.tx, start.ty, end.tx, end.ty, (path) => {
        if (!path || path.length === 0) {
          resolve([]);
          return;
        }

        resolve(path.map((node) => ({ tx: node.x, ty: node.y })));
      });

      pathfinder.calculate();
    });
  }

  findWorldPath = async (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    options: TilePathOptions = {}
  ): Promise<WorldPoint[]> => {
    const startTile = this.getTileAtWorld(startX, startY);
    const endTile = this.getTileAtWorld(endX, endY);
    const tilePath = await this.findTilePath(startTile, endTile, options);
    return tilePath.map((tile) => this.getTileCenter(tile.tx, tile.ty));
  }

  generateMap() {
    if (this.width <= 0 || this.height <= 0) return;

    const cols = this.tiles.cols;
    const rows = this.tiles.rows;

    if (cols * rows > 10000000 || isNaN(cols) || isNaN(rows)) {
      throw new Error(`Safety guard: Invalid map dimensions requested (cols=${cols}, rows=${rows}). Freezing prevented.`);
    }

    // Clear old map completely when generating anew
    this.cells = new Array(cols * rows);

    // Scale controls the zoom level of the noise
    const scale = 0.05;

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        // Range 0 to ~1
        const noiseVal = this.generator.fractalNoise(x * scale, y * scale);
        
        const cellData = biomesEngine.activeBiome.generateCell(x, y, noiseVal);

        this.setCell(x, y, { 
          cx: x, 
          cy: y, 
          terrain: cellData.terrain, 
          z: cellData.z 
        });
      }
    }

    this.onMapChanged.next(null);
  }

  reseedMap() {
    this.generator.reseed();
    this.generateMap();
  }

  private getIndex(cx: number, cy: number): number {
    return cy * this.tiles.cols + cx;
  }

  setPixelBiome(px: number, py: number, terrain: TerrainType) {
    const { tx, ty } = this.getTileAtWorld(px, py);
    this.setTileBiome(tx, ty, terrain, true);
  }

  getPixelCell(px: number, py: number): WorldCell | undefined {
    const { tx, ty } = this.getTileAtWorld(px, py);
    return this.getCell(tx, ty);
  }

  getCell(cx: number, cy: number): WorldCell | undefined {
    if (!this.tiles.isInside(cx, cy)) return undefined;
    return this.cells[this.getIndex(cx, cy)];
  }

  setCell(cx: number, cy: number, cell: WorldCell) {
    if (!this.tiles.isInside(cx, cy)) return;
    const color = TerrainColors[cell.terrain];
    cell.color = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    this.cells[this.getIndex(cx, cy)] = cell;
  }

  private createPathfinder(options: TilePathOptions): EasyStar.js {
    const pathfinder = new EasyStar.js();
    pathfinder.setGrid(this.buildPathfindingGrid());

    const walkableBiomes = options.walkableBiomes || [TerrainType.GRASS, TerrainType.SAND];
    const acceptableCodes = walkableBiomes.map((biome) => TerrainPathCodes[biome]);
    pathfinder.setAcceptableTiles(acceptableCodes);

    if (options.allowDiagonals !== false) {
      pathfinder.enableDiagonals();
    } else {
      pathfinder.disableDiagonals();
    }

    if (options.iterationsPerCalculation && options.iterationsPerCalculation > 0) {
      pathfinder.setIterationsPerCalculation(options.iterationsPerCalculation);
    }

    const tileCosts = options.tileCosts || {};
    const allBiomes = Object.values(TerrainType);
    allBiomes.forEach((biome) => {
      const cost = tileCosts[biome] || 1;
      pathfinder.setTileCost(TerrainPathCodes[biome], cost);
    });

    return pathfinder;
  }

  private buildPathfindingGrid(): number[][] {
    const rows = this.tiles.rows;
    const cols = this.tiles.cols;
    const grid: number[][] = [];

    for (let ty = 0; ty < rows; ty++) {
      const row: number[] = [];
      for (let tx = 0; tx < cols; tx++) {
        const biome = this.getCell(tx, ty)?.terrain || TerrainType.WATER;
        row.push(TerrainPathCodes[biome]);
      }
      grid.push(row);
    }

    return grid;
  }

  doFrameCycle = (dt: number) => {
    // Terrain doesn't need much logic yet
  }

  doSmallCycle = () => { }
  doBigCycle = () => { }
}

export default new WorldMapEngine();
