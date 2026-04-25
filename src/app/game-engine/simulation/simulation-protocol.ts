import type { DirtyRect } from '../world-map/main';
import type { TerrainType } from '../world-map/terrain-generator.service';
import type { CameraBounds } from './lod-scheduler';
import type { SimulationConfig } from './simulation-config';

export type SimulationCommand =
  | { type: 'spawnCreature'; species: 'ant'; x?: number; y?: number }
  | { type: 'spawnPlant'; species: 'bush' | 'tree'; x?: number; y?: number }
  | { type: 'removeCreature'; id: number }
  | { type: 'removePlant'; id: number }
  | { type: 'paintTerrain'; x: number; y: number; radius: number; terrain: TerrainType };

export interface EntitySnapshot {
  ids: Uint32Array;
  positions: Float32Array;
  rotations: Float32Array;
  energy: Float32Array;
  states: Uint8Array;
}

export interface SimulationSnapshot {
  frame: number;
  plants: EntitySnapshot;
  creatures: EntitySnapshot;
}

export type SimulationWorkerRequest =
  | { type: 'init'; config: SimulationConfig; width: number; height: number }
  | { type: 'tickConfig'; config: Partial<SimulationConfig> }
  | { type: 'cameraBounds'; bounds: CameraBounds }
  | { type: 'commandBatch'; commands: SimulationCommand[] }
  | { type: 'pause'; value: boolean };

export type SimulationWorkerResponse =
  | { type: 'snapshot'; snapshot: SimulationSnapshot }
  | { type: 'terrainPatch'; dirtyRect: DirtyRect | null }
  | { type: 'stats'; fps: number; plants: number; creatures: number; queuedCommands: number }
  | { type: 'ready' };
