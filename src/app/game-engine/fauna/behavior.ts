import type { BaseFauna } from "./entities/base-fauna";
import type { BaseFlora } from "../flora/entities/base-flora";
import type { Vector2 } from "../shared/life";
import type { WorldMapEngine } from "../world-map/main";
import { TerrainType } from "../world-map/terrain-generator.service";

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
  plants: BaseFlora[];
  creatures: BaseFauna[];
  worldBorders: {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  };
  terrain: WorldMapEngine;
}

/**
 * Base interface for behaviors - concrete actions creatures can perform
 */
export interface Behavior {
  name: BehaviourName;
  execute(creature: BaseFauna, context: BehaviorContext, dt: number): void;
}

/**
 * Base interface for goals - high-level objectives
 */
export interface Goal {
  name: string;
  evaluate(creature: BaseFauna, context: BehaviorContext): Behavior;
}

/**
 * Survive goal - tries to maintain life energy by eating plants
 */
export class SurviveGoal implements Goal {
  name = "survive";

  private seekBehavior = new SeekPlantBehavior();
  private eatBehavior = new EatBehavior();
  private wanderBehavior = new WanderBehavior();

  evaluate(creature: BaseFauna, context: BehaviorContext): Behavior {
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

  private findAdjacentPlant(creature: BaseFauna, plants: BaseFlora[]): BaseFlora | null {
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

  execute(creature: BaseFauna, context: BehaviorContext, dt: number): void {
    const visiblePlants = creature.vision.findVisiblePlants(context.plants, creature.position);
    const nearestPlant = this.findNearestPlant(creature.position, visiblePlants);

    if (nearestPlant) {
      creature.setTarget(nearestPlant.position);
    }
  }

  private findNearestPlant(position: Vector2, plants: BaseFlora[]): BaseFlora | null {
    if (plants.length === 0) return null;

    let nearest: BaseFlora | null = null;
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

  execute(creature: BaseFauna, context: BehaviorContext, dt: number): void {
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

  execute(creature: BaseFauna, context: BehaviorContext, dt: number): void {
    this.targetChangeTimer += dt;

    // Check if we've reached the current target or it's time to change
    const dx = creature.target.x - creature.position.x;
    const dy = creature.target.y - creature.position.y;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

    if (distanceToTarget < 5 || this.targetChangeTimer >= this.targetChangeDuration) {
      // Set a new random target
      const { worldBorders, terrain } = context;
      
      let newTarget = { x: creature.position.x, y: creature.position.y };
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 10) {
        const testX = worldBorders.xStart + Math.random() * (worldBorders.xEnd - worldBorders.xStart);
        const testY = worldBorders.yStart + Math.random() * (worldBorders.yEnd - worldBorders.yStart);
        
        const cell = terrain.getPixelCell(testX, testY);
        // Avoid water
        if (cell && cell.terrain !== TerrainType.WATER) {
          valid = true;
          newTarget = { x: testX, y: testY };
        }
        attempts++;
      }

      creature.setTarget(newTarget);
      
      // Randomize turn speed to be "sometimes sharp, sometimes smooth"
      // Turn speed between 1.0 (smooth) and 5.0 (sharp)
      creature.turnSpeed = 1.0 + Math.random() * 4.0;
      
      // Randomize wobble slightly to make wandering unique each leg
      creature.wobbleAmplitude = 0.2 + Math.random() * 0.8;
      creature.wobbleSpeed = 0.5 + Math.random() * 1.5;

      // Randomize duration between target changes
      this.targetChangeDuration = 2 + Math.random() * 3;
      this.targetChangeTimer = 0;
    }
  }
}
