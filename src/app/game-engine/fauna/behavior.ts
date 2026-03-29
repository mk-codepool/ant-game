import type { Creature } from "./fauna";
import type { Plant } from "../flora/flora";
import type { Vector2 } from "../shared/life";

/**
 * Enum for behavior names
 */
export enum BehaviourName {
  SeekPlant = "seek_plant",
  Eat = "eat",
  Wander = "wander",
}

/**
 * Context provided to behaviors for decision making
 */
export interface BehaviorContext {
  plants: Plant[];
  worldBorders: {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  };
}

/**
 * Base interface for behaviors - concrete actions creatures can perform
 */
export interface Behavior {
  name: BehaviourName;
  execute(creature: Creature, context: BehaviorContext, dt: number): void;
}

/**
 * Base interface for goals - high-level objectives
 */
export interface Goal {
  name: string;
  evaluate(creature: Creature, context: BehaviorContext): Behavior;
}

/**
 * Survive goal - tries to maintain life energy by eating plants
 */
export class SurviveGoal implements Goal {
  name = "survive";

  private seekBehavior = new SeekPlantBehavior();
  private eatBehavior = new EatBehavior();
  private wanderBehavior = new WanderBehavior();

  evaluate(creature: Creature, context: BehaviorContext): Behavior {
    // Check if we can eat an adjacent plant
    const adjacentPlant = this.findAdjacentPlant(creature, context.plants);
    if (adjacentPlant) {
      return this.eatBehavior;
    }

    // Look for visible plants
    const visiblePlants = creature.vision.findVisiblePlants(context.plants, creature.position);

    if (visiblePlants.length > 0) {
      // Seek the nearest plant
      return this.seekBehavior;
    }

    // No plants visible, wander randomly
    return this.wanderBehavior;
  }

  private findAdjacentPlant(creature: Creature, plants: Plant[]): Plant | null {
    const adjacentDistance = 15; // Close enough to eat

    for (const plant of plants) {
      if (plant.lifeEnergy <= 0) continue;

      const dx = plant.position.x - creature.position.x;
      const dy = plant.position.y - creature.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= adjacentDistance) {
        return plant;
      }
    }

    return null;
  }
}

/**
 * Seek the nearest visible plant
 */
export class SeekPlantBehavior implements Behavior {
  name = BehaviourName.SeekPlant;

  execute(creature: Creature, context: BehaviorContext, dt: number): void {
    const visiblePlants = creature.vision.findVisiblePlants(context.plants, creature.position);
    const nearestPlant = this.findNearestPlant(creature.position, visiblePlants);

    if (nearestPlant) {
      creature.setTarget(nearestPlant.position);
    }
  }

  private findNearestPlant(position: Vector2, plants: Plant[]): Plant | null {
    if (plants.length === 0) return null;

    let nearest: Plant | null = null;
    let minDistance = Infinity;

    for (const plant of plants) {
      const dx = plant.position.x - position.x;
      const dy = plant.position.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = plant;
      }
    }

    return nearest;
  }
}

/**
 * Eat an adjacent plant to gain energy
 */
export class EatBehavior implements Behavior {
  name = BehaviourName.Eat;

  execute(creature: Creature, context: BehaviorContext, dt: number): void {
    const adjacentDistance = 15;

    for (const plant of context.plants) {
      if (plant.lifeEnergy <= 0) continue;

      const dx = plant.position.x - creature.position.x;
      const dy = plant.position.y - creature.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= adjacentDistance) {
        creature.eat(plant);
        break; // Only eat one plant per frame
      }
    }
  }
}

/**
 * Wander randomly when no plants are visible
 */
export class WanderBehavior implements Behavior {
  name = BehaviourName.Wander;
  private targetChangeTimer = 0;
  private targetChangeDuration = 2; // Change target every 2 seconds

  execute(creature: Creature, context: BehaviorContext, dt: number): void {
    this.targetChangeTimer += dt;

    // Check if we've reached the current target or it's time to change
    const dx = creature.target.x - creature.position.x;
    const dy = creature.target.y - creature.position.y;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

    if (distanceToTarget < 5 || this.targetChangeTimer >= this.targetChangeDuration) {
      // Set a new random target
      const { worldBorders } = context;
      creature.setTarget({
        x: worldBorders.xStart + Math.random() * (worldBorders.xEnd - worldBorders.xStart),
        y: worldBorders.yStart + Math.random() * (worldBorders.yEnd - worldBorders.yStart),
      });
      this.targetChangeTimer = 0;
    }
  }
}
