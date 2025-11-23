import FaunaAndFlora from "./faunaAndFlora";
import Time from "./time";
import MouseController from "./mouseController";

class GameEngine {
  frame = 0;
  worldCycle = new Time();
  _config = {
    pause: false,
    borderX: 0,
    borderY: 0,
    ctx: null,
  };
  faunaAndFlora = new FaunaAndFlora();
  mouseController = new MouseController();
  renderCallback = () => {};

  constructor(){
    console.info('Game engine started and aliased as GE.');
    this.worldCycle.setConfig({
      everySmallCycle: this.everySmallCycle,
      everyBigCycle: this.everyBigCycle,
      everyEpicCycle: this.everyEpicCycle,
    });
  }

  init = ({ renderCallback } = {}) => {
    console.info('GE calls: init');
    this.renderCallback = renderCallback || this.renderCallback;
    this.runEngine();
  }

  setConfig = (config = {}) => {
    this._config = {
      ...this._config,
      config,
    }

    if (config.borderX || config.borderY) {
      this.faunaAndFlora.setConfig({
        worldBorders: {
          xStart: 0,
          xEnd: config.borderX,
          yStart: 0,
          yEnd: config.borderY,
        }
      });
    }
    
    this.mouseController.setConfig({ ctx: config.ctx });
  }

  runEngine = () => setTimeout(() => {
    if (this._config.pause) {
      return;
    }
    this.renderCallback();
    this.runFrames();
    this.runEngine();
    this.runWorldTime();
  }, 20);

  runFrames = () => {
    const maxFrame = 60;
    this.frame = this.frame > maxFrame ? 0 : this.frame + 1;
    this.everyFrame();
  }

  runWorldTime = () => {
    // UPDATE SMALL CYCLE
    if (this.frame === 60) {
      this.worldCycle.runTik();
    }
  }

  everyFrame() {
    this.faunaAndFlora.doFrameCycle();
  }

  everySmallCycle = () => {
    this.faunaAndFlora.doSmallCycle();
  }

  everyBigCycle = () => {
    this.faunaAndFlora.doBigCycle();
  }

  everyEpicCycle = () => {

  }
}

export default new GameEngine();