import { Life, type LifeProps, type Vector2 } from "../shared/life";
import { Vision } from "./perception";
import { SurviveGoal, type Goal, type Behavior, type BehaviorContext } from "./behavior";
import type { Plant } from "../flora/flora";
import { ActionType } from "../shared/action-type";

export interface CreatureProps extends LifeProps {
  speed?: number;
}

export class Creature extends Life {
  baseSpeed: number;
  target: Vector2 = {
    x: 0,
    y: 0,
  };

  // Behavior system
  vision: Vision;
  currentGoal: Goal;
  currentBehavior: Behavior | null = null;

  // Energy consumption rate per unit of distance traveled
  override energyLossPerUnit = 0.1;

  // Track last position for calculating energy loss
  private lastPosition: Vector2;

  // Death State
  deathReason: string = '';
  timeSinceDeath: number = 0;

  constructor(props: CreatureProps) {
    super(props);
    this.lifeEnergy = 20;
    this.baseSpeed = props.speed ?? 60; // units per second

    // Initialize behavior system
    this.vision = new Vision(150, 120); // 150 range, 120° angle
    this.currentGoal = new SurviveGoal();

    // Copy position for tracking
    this.lastPosition = { ...this.position };
  }

  setTarget = (target: Vector2) => {
    this.target = target;
  }

  /**
   * Calculate dynamic speed based on distance to target and random variation
   * @param distance Distance to target
   * @returns Calculated speed in units per second
   */
  calculateSpeed = (distance: number): number => {
    // Distance factor: creatures move faster when target is far
    // Use a logarithmic scale to avoid extreme speeds
    const distanceFactor = Math.min(1.5, Math.log10(distance + 10) / 2);

    // Random variation: ±20% for organic feel
    const randomFactor = 0.8 + Math.random() * 0.4;

    return this.baseSpeed * distanceFactor * randomFactor;
  }

  move = (dt: number) => {
    // Store position before moving
    const oldX = this.position.x;
    const oldY = this.position.y;

    // Calculate distance vector to target
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;

    // Calculate total distance to target
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate dynamic speed based on distance
    const currentSpeed = this.calculateSpeed(distance);
    const step = currentSpeed * dt;

    // If we're close enough, snap to target
    if (distance <= step) {
      this.position.x = this.target.x;
      this.position.y = this.target.y;
    } else {
      // Move towards target using normalized direction vector
      const dirX = dx / distance;
      const dirY = dy / distance;

      this.position.x += dirX * step;
      this.position.y += dirY * step;
    }

    // Calculate distance traveled this frame
    const deltaX = this.position.x - oldX;
    const deltaY = this.position.y - oldY;
    const distanceTraveled = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Consume energy based on distance traveled using the centralized energy system
    this.consumeEnergy(ActionType.MOVE, distanceTraveled);
  }

  /**
   * Main update loop for the creature - evaluates goals and executes behaviors
   */
  update = (dt: number, context: BehaviorContext): void => {
    // Don't update behavior if dead, just increase death timer
    if (this.isDead()) {
      this.timeSinceDeath += dt;
      return;
    }

    // Update vision direction to look towards target BEFORE evaluating behaviors
    // This allows the creature to "look around" in the direction it's about to move
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

    if (distanceToTarget > 0.01) {
      this.vision.updateDirection({ x: dx, y: dy });
    }

    // Evaluate goal to select appropriate behavior
    this.currentBehavior = this.currentGoal.evaluate(this, context);

    // Execute the selected behavior
    if (this.currentBehavior) {
      this.currentBehavior.execute(this, context, dt);
    }

    // Move toward target
    this.move(dt);
  }

  /**
   * Eat a plant to gain its energy
   */
  eat = (plant: Plant): void => {
    // Transfer all energy from plant to creature
    const energyGained = plant.lifeEnergy;
    this.modifyEnergy(energyGained);

    // Consume the plant (set its energy to 0)
    plant.modifyEnergy(-plant.lifeEnergy);
  }

  /**
   * Age up the creature without losing energy
   * (Energy loss is handled by movement)
   */
  override ageUp = (): void => {
    if (this.isDead()) return;
    this.age++;
    // Don't decrease energy here - movement already handles energy loss
  }

  die = (reason: string): void => {
    if (this.isDead()) return; // Already dead
    this.lifeEnergy = 0;
    this.deathReason = reason;
    this.timeSinceDeath = 0;
  }
}
