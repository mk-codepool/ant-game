/// <reference lib="webworker" />

import { DEFAULT_SIMULATION_CONFIG, type SimulationConfig } from './simulation-config';
import type {
  SimulationCommand,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from './simulation-protocol';
import type { CameraBounds } from './lod-scheduler';

let config: SimulationConfig = DEFAULT_SIMULATION_CONFIG;
let cameraBounds: CameraBounds | null = null;
let queuedCommands = 0;
let paused = false;
let width = 0;
let height = 0;

function post(message: SimulationWorkerResponse): void {
  self.postMessage(message);
}

function consumeCommands(commands: SimulationCommand[]): void {
  queuedCommands += commands.length;
  // The main-thread facade still owns world objects in this migration step.
  // Keeping the protocol live lets us move systems into this worker incrementally.
  queuedCommands = Math.max(0, queuedCommands - commands.length);
}

self.onmessage = ({ data }: MessageEvent<SimulationWorkerRequest>) => {
  switch (data.type) {
    case 'init':
      config = data.config;
      width = data.width;
      height = data.height;
      post({ type: 'ready' });
      postStats();
      break;
    case 'tickConfig':
      config = {
        ...config,
        ...data.config,
        targetScale: {
          ...config.targetScale,
          ...data.config.targetScale,
        },
        lod: {
          ...config.lod,
          ...data.config.lod,
        },
      };
      break;
    case 'cameraBounds':
      cameraBounds = data.bounds;
      break;
    case 'commandBatch':
      consumeCommands(data.commands);
      break;
    case 'pause':
      paused = data.value;
      break;
  }
};

function postStats(): void {
  if (!paused) {
    post({
      type: 'stats',
      fps: config.snapshotHz,
      plants: 0,
      creatures: 0,
      queuedCommands,
    });
  }

  setTimeout(postStats, Math.max(250, 1000 / config.snapshotHz));
}

export {};
