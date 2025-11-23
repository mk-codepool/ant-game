import { Life, type LifeProps } from "./life";

export class Plant extends Life {
  constructor(props: LifeProps) {
    super(props);
    this.lifeEnergy = 200;
  }
}
