import WorldEngine from "./world.engine";
import Time from "./time";
import MouseController from "./mouse-controller";
import SaveService from "./storage/save.service";

export interface GameEngineConfig {
  pause?: boolean;
  borderX?: number;
  borderY?: number;
  renderCallback?: () => void;
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
    }
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
    // Autosave on every small cycle — fire and forget, won't block the game loop
    this.saveService.autosave(this.world);
  }

  everyBigCycle = () => {
    this.world.doBigCycle();
  }

  everyEpicCycle = () => {

  }
}

export default new GameEngine();
