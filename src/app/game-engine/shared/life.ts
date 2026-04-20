import { ActionType } from "./action-type";

export interface Vector2 {
  x: number;
  y: number;
}

export interface LifeProps {
  position: Vector2;
  id: number;
}

export class Life {
  id: number = 0;
  age = 0;
  lifeEnergy = 0;
  position: Vector2 = {
    x: 0,
    y: 0,
  };

  // Energy consumption rate per unit of distance traveled (for MOVE action)
  protected energyLossPerUnit = 0.1;

  hitboxRadius = 5;

  constructor(props: LifeProps) {
    const { position, id } = props;
    this.setPosition(position);
    this.id = id;
  }

  ageUp = () => {
    this.age++;
    this.lifeEnergy--;
  }

  setPosition = (position: Vector2) => {
    this.position = position;
  }

  /**
   * Modify the life energy by a given amount (positive or negative)
   */
  modifyEnergy = (amount: number): void => {
    this.lifeEnergy += amount;
  }

  /**
   * Centralized method to consume energy based on action type
   * @param actionType The type of action being performed
   * @param actionData Additional data needed for energy calculation (e.g., distance for MOVE)
   * @returns The amount of energy consumed
   */
  consumeEnergy = (actionType: ActionType, actionData?: number): number => {
    let energyCost = 0;

    switch (actionType) {
      case ActionType.MOVE:
        // For MOVE, actionData represents distance traveled
        const distance = actionData ?? 0;
        energyCost = distance * this.energyLossPerUnit;
        break;

      // Future action types will have their own calculation logic here
      // case ActionType.ATTACK:
      //   energyCost = this.attackEnergyCost;
      //   break;

      default:
        console.warn(`Unknown action type: ${actionType}`);
        energyCost = 0;
    }

    // Consume the calculated energy
    this.modifyEnergy(-energyCost);

    return energyCost;
  }

  /**
   * Check if this life form is dead
   */
  isDead = (): boolean => {
    return this.lifeEnergy <= 0;
  }
}
