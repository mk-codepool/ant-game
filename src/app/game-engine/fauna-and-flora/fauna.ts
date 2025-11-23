import { Life, type LifeProps } from "./life";

export class Creature extends Life {
  constructor(props: LifeProps) {
    super(props);
    this.lifeEnergy = 20;
  }

  override move = (dt: number) => {
    const speed = 60; // units per second
    const step = speed * dt;

    if (Math.abs(this.x - this.target.x) > step) {
      this.x = this.x > this.target.x ? this.x - step : this.x + step;
    } else {
      this.x = this.target.x;
    }

    if (Math.abs(this.y - this.target.y) > step) {
      this.y = this.y > this.target.y ? this.y - step : this.y + step;
    } else {
      this.y = this.target.y;
    }
  }
}
