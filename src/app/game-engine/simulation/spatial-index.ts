import type { Vector2 } from '../shared/life';

export interface SpatialEntity {
  id: number;
  position: Vector2;
}

interface BucketEntry<T extends SpatialEntity> {
  entity: T;
  key: number;
}

export class SpatialIndex<T extends SpatialEntity> {
  private readonly buckets = new Map<number, Set<number>>();
  private readonly entries = new Map<number, BucketEntry<T>>();

  constructor(private readonly cellSize = 64) {}

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.buckets.clear();
    this.entries.clear();
  }

  insert(entity: T): void {
    const key = this.keyForWorld(entity.position.x, entity.position.y);
    this.entries.set(entity.id, { entity, key });
    this.getOrCreateBucket(key).add(entity.id);
  }

  update(entity: T, oldPosition?: Vector2): void {
    const existing = this.entries.get(entity.id);
    if (!existing) {
      this.insert(entity);
      return;
    }

    const oldKey = oldPosition
      ? this.keyForWorld(oldPosition.x, oldPosition.y)
      : existing.key;
    const nextKey = this.keyForWorld(entity.position.x, entity.position.y);

    existing.entity = entity;
    if (oldKey === nextKey) {
      existing.key = nextKey;
      return;
    }

    const oldBucket = this.buckets.get(oldKey);
    oldBucket?.delete(entity.id);
    if (oldBucket?.size === 0) {
      this.buckets.delete(oldKey);
    }

    this.getOrCreateBucket(nextKey).add(entity.id);
    existing.key = nextKey;
  }

  remove(id: number): boolean {
    const existing = this.entries.get(id);
    if (!existing) return false;

    const bucket = this.buckets.get(existing.key);
    bucket?.delete(id);
    if (bucket?.size === 0) {
      this.buckets.delete(existing.key);
    }

    return this.entries.delete(id);
  }

  queryRadius(x: number, y: number, radius: number, out: T[] = []): T[] {
    const radiusSquared = radius * radius;
    this.forEachBucketInWorldRect(
      x - radius,
      y - radius,
      x + radius,
      y + radius,
      (entry) => {
        const dx = entry.position.x - x;
        const dy = entry.position.y - y;
        if (dx * dx + dy * dy <= radiusSquared) {
          out.push(entry);
        }
      }
    );
    return out;
  }

  queryBounds(minX: number, maxX: number, minY: number, maxY: number, out: T[] = []): T[] {
    this.forEachBucketInWorldRect(minX, minY, maxX, maxY, (entry) => {
      const { x, y } = entry.position;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        out.push(entry);
      }
    });
    return out;
  }

  private forEachBucketInWorldRect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    callback: (entry: T) => void
  ): void {
    if (!Number.isFinite(minX) || !Number.isFinite(minY) ||
        !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      for (const { entity } of this.entries.values()) {
        callback(entity);
      }
      return;
    }

    const startX = Math.floor(Math.min(minX, maxX) / this.cellSize);
    const endX = Math.floor(Math.max(minX, maxX) / this.cellSize);
    const startY = Math.floor(Math.min(minY, maxY) / this.cellSize);
    const endY = Math.floor(Math.max(minY, maxY) / this.cellSize);

    for (let cy = startY; cy <= endY; cy++) {
      for (let cx = startX; cx <= endX; cx++) {
        const bucket = this.buckets.get(this.keyForCell(cx, cy));
        if (!bucket) continue;

        for (const id of bucket) {
          const entry = this.entries.get(id);
          if (entry) callback(entry.entity);
        }
      }
    }
  }

  private getOrCreateBucket(key: number): Set<number> {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Set<number>();
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private keyForWorld(x: number, y: number): number {
    return this.keyForCell(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  private keyForCell(cx: number, cy: number): number {
    return ((cx & 0xffff) << 16) ^ (cy & 0xffff);
  }
}
