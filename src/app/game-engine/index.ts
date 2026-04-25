import WorldEngine from "./world.engine";
import Time from "./time";
import MouseController from "./mouse-controller";
import SaveService from "./storage/save.service";
import type { CameraBounds } from "./simulation/lod-scheduler";
import {
  DEFAULT_SIMULATION_CONFIG,
  type SimulationConfig,
} from "./simulation/simulation-config";
import { SimulationWorkerClient } from "./simulation/simulation-worker-client";
import type { SimulationCommand } from "./simulation/simulation-protocol";

export interface GameEngineConfig {
  pause?: boolean;
  borderX?: number;
  borderY?: number;
  renderCallback?: () => void;
  simulation?: Partial<SimulationConfig>;
  config?: any;
}

export class GameEngine {
  frame = 0;
  worldCycle = new Time();
  _config: GameEngineConfig = {
    pause: false,
    borderX: 0,
    borderY: 0,
  };
  world = WorldEngine;
  mouseController = new MouseController();
  saveService = SaveService;
  simulationConfig: SimulationConfig = DEFAULT_SIMULATION_CONFIG;
  simulationWorker = new SimulationWorkerClient();
  renderCallback = () => { };

  private lastTime = 0;

  constructor() {
    console.info('Game engine started and aliased as GE.');
    this.worldCycle.setConfig({
      everySmallCycle: this.everySmallCycle,
      everyBigCycle: this.everyBigCycle,
      everyEpicCycle: this.everyEpicCycle,
    });
  }

  /** Whether we've already restored from autosave this session */
  private restored = false;

  init = ({ renderCallback }: { renderCallback?: () => void } = {}) => {
    console.info('GE calls: init');
    this.renderCallback = renderCallback || this.renderCallback;
    this.lastTime = performance.now();
  }

  /**
   * Try to restore from the last autosave. Call this AFTER setConfig
   * so world borders are set. Returns true if data was restored.
   */
  autoRestore = async (): Promise<boolean> => {
    if (this.restored) return false;
    this.restored = true;
    const success = await this.saveService.autoRestore(this.world);
    if (success) {
      console.info('[GE] World restored from autosave');
    }
    return success;
  }

  setConfig = (config: GameEngineConfig = {}) => {
    this._config = {
      ...this._config,
      ...config,
    };

    if (config.borderX || config.borderY) {
      this.world.setConfig({
        worldBorders: {
          xStart: 0,
          xEnd: config.borderX || 0,
          yStart: 0,
          yEnd: config.borderY || 0,
        }
      });
      this.startSimulationWorker();
    }

    if (config.simulation) {
      this.simulationConfig = {
        ...this.simulationConfig,
        ...config.simulation,
        targetScale: {
          ...this.simulationConfig.targetScale,
          ...config.simulation.targetScale,
        },
        lod: {
          ...this.simulationConfig.lod,
          ...config.simulation.lod,
        },
      };
      this.world.setSimulationConfig(this.simulationConfig);
      this.simulationWorker.configure(this.simulationConfig);
    }
  }

  setCameraBounds = (bounds: CameraBounds) => {
    this.world.setCameraBounds(bounds);
    this.simulationWorker.setCameraBounds(bounds);
  }

  enqueueSimulationCommand = (command: SimulationCommand) => {
    this.simulationWorker.enqueue(command);
  }

  private startSimulationWorker() {
    this.world.setSimulationConfig(this.simulationConfig);
    this.simulationWorker.start(
      this.simulationConfig,
      this.world.terrain.width || this.world.worldBorders.xEnd,
      this.world.terrain.height || this.world.worldBorders.yEnd
    );
  }

  tick = (deltaTimeSeconds: number) => {
    if (this._config.pause) {
      return;
    }

    this.runFrames(deltaTimeSeconds);
    this.runWorldTime();
  };

  runFrames = (dt: number) => {
    const maxFrame = 60;
    this.frame = this.frame > maxFrame ? 0 : this.frame + 1;
    this.everyFrame(dt);
  }

  runWorldTime = () => {
    // UPDATE SMALL CYCLE
    if (this.frame === 60) {
      this.worldCycle.runTik();
    }
  }

  everyFrame(dt: number) {
    this.world.doFrameCycle(dt);
  }

  everySmallCycle = () => {
    this.world.doSmallCycle();
  }

  everyBigCycle = () => {
    this.world.doBigCycle();
    // Schedule autosave outside the world tick to avoid serialization spikes.
    this.saveService.scheduleAutosave(this.world);
  }

  everyEpicCycle = () => {

  }
}

export default new GameEngine();
