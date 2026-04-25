import { LodScheduler, SimulationLodTier } from './lod-scheduler';

describe('LodScheduler', () => {
  it('classifies positions against configured active and near radii', () => {
    const scheduler = new LodScheduler();
    scheduler.setConfig({
      lod: {
        activeRadius: 10,
        nearRadius: 20,
        nearTickSeconds: 0.5,
        farTickSeconds: 2,
      },
    });
    scheduler.setCameraBounds({ minX: -5, maxX: 5, minY: -5, maxY: 5, centerX: 0, centerY: 0 });

    expect(scheduler.classify(5, 0)).toBe(SimulationLodTier.Active);
    expect(scheduler.classify(15, 0)).toBe(SimulationLodTier.Near);
    expect(scheduler.classify(25, 0)).toBe(SimulationLodTier.Far);
  });

  it('accumulates near and far ticks before running low-detail updates', () => {
    const scheduler = new LodScheduler();
    scheduler.setConfig({
      lod: {
        activeRadius: 10,
        nearRadius: 20,
        nearTickSeconds: 0.5,
        farTickSeconds: 2,
      },
    });

    const state: { nearAccumulator?: number; farAccumulator?: number } = {};
    expect(scheduler.shouldRun(SimulationLodTier.Near, 0.2, state).run).toBe(false);
    expect(scheduler.shouldRun(SimulationLodTier.Near, 0.3, state)).toEqual({ run: true, dt: 0.5 });

    expect(scheduler.shouldRun(SimulationLodTier.Far, 1, state).run).toBe(false);
    expect(scheduler.shouldRun(SimulationLodTier.Far, 1, state)).toEqual({ run: true, dt: 2 });
  });
});
