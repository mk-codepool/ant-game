import { Vision } from './perception';
import type { BaseFlora } from '../flora/entities/base-flora';

describe('Vision', () => {
  it('keeps cone visibility semantics without angle allocations', () => {
    const vision = new Vision(10, 90);
    vision.updateDirection({ x: 1, y: 0 });

    expect(vision.canSee({ x: 8, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(vision.canSee({ x: -1, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(vision.canSee({ x: 11, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(vision.canSee({ x: 5, y: 6 }, { x: 0, y: 0 })).toBe(false);
  });

  it('filters only live visible plants', () => {
    const vision = new Vision(20, 120);
    const plants = [
      { id: 1, position: { x: 10, y: 0 }, lifeEnergy: 100 },
      { id: 2, position: { x: -10, y: 0 }, lifeEnergy: 100 },
      { id: 3, position: { x: 5, y: 0 }, lifeEnergy: 0 },
    ] as BaseFlora[];

    expect(vision.findVisiblePlants(plants, { x: 0, y: 0 }).map((plant) => plant.id)).toEqual([1]);
  });
});
