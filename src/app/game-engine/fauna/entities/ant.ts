import { BaseFauna, type BaseFaunaProps } from "./base-fauna";
import { SurviveGoal } from "../behavior";

export class Ant extends BaseFauna {
  get speciesName() { return "Ant"; }
  getInitialEnergy() { return 20; }

  constructor(props: BaseFaunaProps) {
    super(props);
    this.currentGoal = new SurviveGoal();
  }
}
