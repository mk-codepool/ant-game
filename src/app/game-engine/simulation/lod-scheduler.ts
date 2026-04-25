import type { SimulationConfig } from './simulation-config';
import { DEFAULT_SIMULATION_CONFIG } from './simulation-config';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

export enum SimulationLodTier {
  Active = 'active',
  Near = 'near',
  Far = 'far',
}

export class LodScheduler {
  private config: SimulationConfig = DEFAULT_SIMULATION_CONFIG;
  private cameraBounds: CameraBounds | null = null;

  setConfig(config: Partial<SimulationConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      targetScale: {
        ...this.config.targetScale,
        ...config.targetScale,
      },
      lod: {
        ...this.config.lod,
        ...config.lod,
      },
    };
  }

  getConfig(): SimulationConfig {
    return this.config;
  }

  setCameraBounds(bounds: CameraBounds): void {
    this.cameraBounds = bounds;
  }

  classify(x: number, y: number): SimulationLodTier {
    if (!this.cameraBounds) return SimulationLodTier.Active;

    const dx = x - this.cameraBounds.centerX;
    const dy = y - this.cameraBounds.centerY;
    const distanceSquared = dx * dx + dy * dy;
    const active = this.config.lod.activeRadius;
    const near = this.config.lod.nearRadius;

    if (distanceSquared <= active * active) return SimulationLodTier.Active;
    if (distanceSquared <= near * near) return SimulationLodTier.Near;
    return SimulationLodTier.Far;
  }

  shouldRun(
    tier: SimulationLodTier,
    dt: number,
    state: { nearAccumulator?: number; farAccumulator?: number }
  ): { run: boolean; dt: number } {
    if (tier === SimulationLodTier.Active) {
      state.nearAccumulator = 0;
      state.farAccumulator = 0;
      return { run: true, dt };
    }

    if (tier === SimulationLodTier.Near) {
      state.nearAccumulator = (state.nearAccumulator || 0) + dt;
      if (state.nearAccumulator < this.config.lod.nearTickSeconds) {
        return { run: false, dt: 0 };
      }

      const elapsed = state.nearAccumulator;
      state.nearAccumulator = 0;
      state.farAccumulator = 0;
      return { run: true, dt: elapsed };
    }

    state.farAccumulator = (state.farAccumulator || 0) + dt;
    if (state.farAccumulator < this.config.lod.farTickSeconds) {
      return { run: false, dt: 0 };
    }

    const elapsed = state.farAccumulator;
    state.farAccumulator = 0;
    state.nearAccumulator = 0;
    return { run: true, dt: elapsed };
  }
}
