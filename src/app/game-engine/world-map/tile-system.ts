export interface TileCoord {
  tx: number;
  ty: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export class TileSystem {
  private _cellSize: number;
  private _width: number;
  private _height: number;

  constructor(cellSize: number, width = 0, height = 0) {
    this._cellSize = TileSystem.normalizeCellSize(cellSize);
    this._width = Math.max(0, width);
    this._height = Math.max(0, height);
  }

  get cellSize(): number {
    return this._cellSize;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get cols(): number {
    return Math.ceil(this._width / this._cellSize);
  }

  get rows(): number {
    return Math.ceil(this._height / this._cellSize);
  }

  setCellSize(cellSize: number): void {
    this._cellSize = TileSystem.normalizeCellSize(cellSize);
  }

  setMapSize(width: number, height: number): void {
    this._width = Math.max(0, width);
    this._height = Math.max(0, height);
  }

  worldToTile(x: number, y: number): TileCoord {
    return {
      tx: Math.floor(x / this._cellSize),
      ty: Math.floor(y / this._cellSize),
    };
  }

  tileToWorld(tx: number, ty: number): WorldPoint {
    return {
      x: tx * this._cellSize,
      y: ty * this._cellSize,
    };
  }

  getTileCenter(tx: number, ty: number): WorldPoint {
    return {
      x: (tx * this._cellSize) + (this._cellSize / 2),
      y: (ty * this._cellSize) + (this._cellSize / 2),
    };
  }

  isInside(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }

  getNeighbors(tx: number, ty: number, includeDiagonals = false): TileCoord[] {
    const orthogonal = [
      { tx: tx + 1, ty },
      { tx: tx - 1, ty },
      { tx, ty: ty + 1 },
      { tx, ty: ty - 1 },
    ];

    const diagonals = includeDiagonals
      ? [
          { tx: tx + 1, ty: ty + 1 },
          { tx: tx + 1, ty: ty - 1 },
          { tx: tx - 1, ty: ty + 1 },
          { tx: tx - 1, ty: ty - 1 },
        ]
      : [];

    return [...orthogonal, ...diagonals].filter((coord) => this.isInside(coord.tx, coord.ty));
  }

  forEachTileInWorldRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    callback: (coord: TileCoord) => void
  ): void {
    if (this.cols <= 0 || this.rows <= 0) return;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const start = this.clampToBounds(this.worldToTile(minX, minY));
    const end = this.clampToBounds(this.worldToTile(maxX, maxY));

    for (let tx = start.tx; tx <= end.tx; tx++) {
      for (let ty = start.ty; ty <= end.ty; ty++) {
        callback({ tx, ty });
      }
    }
  }

  private clampToBounds(coord: TileCoord): TileCoord {
    const maxTx = Math.max(0, this.cols - 1);
    const maxTy = Math.max(0, this.rows - 1);

    return {
      tx: Math.min(maxTx, Math.max(0, coord.tx)),
      ty: Math.min(maxTy, Math.max(0, coord.ty)),
    };
  }

  private static normalizeCellSize(cellSize: number): number {
    return Math.max(1, Math.floor(cellSize));
  }
}
