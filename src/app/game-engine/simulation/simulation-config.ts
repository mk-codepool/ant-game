export interface SimulationConfig {
  targetScale: {
    plants: number;
    creatures: number;
  };
  spatialCellSize: number;
  lod: {
    activeRadius: number;
    nearRadius: number;
    farTickSeconds: number;
    nearTickSeconds: number;
  };
  snapshotHz: number;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  targetScale: {
    plants: 50_000,
    creatures: 10_000,
  },
  spatialCellSize: 64,
  lod: {
    activeRadius: 900,
    nearRadius: 1_800,
    farTickSeconds: 5,
    nearTickSeconds: 0.25,
  },
  snapshotHz: 30,
};
