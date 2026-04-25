import type { SimulationSnapshot } from './simulation-protocol';

describe('simulation protocol', () => {
  it('represents snapshots as typed arrays with stable ids', () => {
    const snapshot: SimulationSnapshot = {
      frame: 12,
      plants: {
        ids: new Uint32Array([1, 2]),
        positions: new Float32Array([10, 20, 30, 40]),
        rotations: new Float32Array([0, 1]),
        energy: new Float32Array([100, 50]),
        states: new Uint8Array([1, 1]),
      },
      creatures: {
        ids: new Uint32Array([7]),
        positions: new Float32Array([5, 6]),
        rotations: new Float32Array([1.5]),
        energy: new Float32Array([20]),
        states: new Uint8Array([1]),
      },
    };

    expect(snapshot.creatures.ids[0]).toBe(7);
    expect(snapshot.plants.positions.length).toBe(snapshot.plants.ids.length * 2);
  });
});
