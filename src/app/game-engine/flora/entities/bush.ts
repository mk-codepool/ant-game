import { BaseFlora, type BaseFloraProps } from "./base-flora";

export class Bush extends BaseFlora {
  resourceName = "Bush";
  
  getInitialEnergy() { 
    return 200; 
  }

  constructor(props: BaseFloraProps) {
    super(props);
  }
}
