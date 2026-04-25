import { BaseFlora, type BaseFloraProps } from "./base-flora";

export class Tree extends BaseFlora {
  override resourceName = "Tree";
  
  // Larger hitbox than default 5
  override hitboxRadius = 12;

  override getInitialEnergy() { 
    // Larger than bush's 200
    return 1000; 
  }

  constructor(props: BaseFloraProps) {
    super(props);
  }
}
