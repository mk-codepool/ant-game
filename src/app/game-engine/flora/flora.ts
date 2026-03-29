import { Life, type LifeProps } from "../shared/life";

export interface PlantProps extends LifeProps {
}

export class Plant extends Life {
  constructor(props: PlantProps) {
    super(props);
    this.lifeEnergy = 200;
  }

  /**
   * Check if this plant has been consumed
   */
  isConsumed = (): boolean => {
    return this.isDead();
  }
}
