export default class Time {
  small = 0;
  smallMax = 100;
  big = 0;
  // 86 400 seconds is a day
  bigMax = 864;
  epic = 0;
  // calculated to be 1 epicMax is a day
  epicMax = 10;
  everySmallCycle = () => {};
  everyBigCycle = () => {};
  everyEpicCycle = () => {};

  constructor({
    everySmallCycle,
    everyBigCycle,
    everyEpicCycle,
  } = {}) {
    this.everySmallCycle = everySmallCycle || this.everySmallCycle;
    this.everyBigCycle = everyBigCycle || this.everyBigCycle;
    this.everyEpicCycle = everyEpicCycle || this.everyEpicCycle;
  }

  setConfig = ({
    everySmallCycle,
    everyBigCycle,
    everyEpicCycle,
  } = {}) => {
    this.everySmallCycle = everySmallCycle || this.everySmallCycle;
    this.everyBigCycle = everyBigCycle || this.everyBigCycle;
    this.everyEpicCycle = everyEpicCycle || this.everyEpicCycle;
  }

  runTik = () => {
    this.small++;
    this.everySmallCycle();

    // UPDATE BIG CYCLE
    if (this.small === this.smallMax) {
      this.small = 0;
      this.big++;
      this.everyBigCycle();
    }

    // UPDATE EPIC CYCLE
    if (this.big === this.bigMax) {
      this.big = 0;
      this.epic++;
      this.everyEpicCycle();
    }

    // END OF EPIC CYCLE
    if (this.epic === this.epicMax) {
      this.epic = 0;
    }
  }
}