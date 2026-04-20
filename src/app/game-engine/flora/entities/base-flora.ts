import { Life, type LifeProps } from "../../shared/life";

export interface BaseFloraProps extends LifeProps {}

export abstract class BaseFlora extends Life {
  abstract resourceName: string;
  abstract getInitialEnergy(): number;

  constructor(props: BaseFloraProps) {
    super(props);
    this.lifeEnergy = this.getInitialEnergy();
    
    // Override ageUp so flora doesn't drain energy and shrink over time
    this.ageUp = () => {
      this.age++;
    };
  }

  /**
   * Check if this flora has been consumed
   */
  isConsumed = (): boolean => {
    return this.isDead();
  }
}
