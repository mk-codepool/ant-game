import { Life, type LifeProps } from "./life";

export class Creature extends Life {
  constructor(props: LifeProps) {
    super(props);
    this.lifeEnergy = 20;
  }

  override move = () => {
    this.x = this.x > this.target.x ? this.x - 1 : this.x + 1;
    this.y = this.y > this.target.y ? this.y - 1 : this.y + 1;
  }
}
