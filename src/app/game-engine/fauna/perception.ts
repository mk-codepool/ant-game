import type { Vector2 } from "../shared/life";
import type { BaseFlora } from "../flora/entities/base-flora";

/**
 * Vision-based perception system for creatures
 * Implements a cone-based field of view
 */
export class Vision {
  range: number;
  angle: number; // Field of view angle in radians
  direction: Vector2;

  constructor(range = 150, angleInDegrees = 120) {
    this.range = range;
    this.angle = (angleInDegrees * Math.PI) / 180; // Convert to radians
    this.direction = { x: 1, y: 0 }; // Default facing right
  }

  /**
   * Updates the direction the creature is looking based on movement
   */
  updateDirection(velocity: Vector2): void {
    const magnitude = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (magnitude > 0.01) {
      // Only update if there's significant movement
      this.direction = {
        x: velocity.x / magnitude,
        y: velocity.y / magnitude,
      };
    }
  }

  /**
   * Checks if a target position is within the vision cone
   */
  canSee(target: Vector2, position: Vector2): boolean {
    // Vector from position to target
    const toTarget = {
      x: target.x - position.x,
      y: target.y - position.y,
    };

    // Distance check
    const distance = Math.sqrt(toTarget.x * toTarget.x + toTarget.y * toTarget.y);
    if (distance > this.range || distance < 0.01) {
      return false;
    }

    // Normalize the vector to target
    const normalizedToTarget = {
      x: toTarget.x / distance,
      y: toTarget.y / distance,
    };

    // Calculate angle between direction and target using dot product
    const dotProduct = this.direction.x * normalizedToTarget.x + this.direction.y * normalizedToTarget.y;
    const angleToTarget = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

    // Check if target is within the cone angle (half-angle on each side)
    return angleToTarget <= this.angle / 2;
  }

  /**
   * Finds all plants visible to the creature
   */
  findVisiblePlants(plants: BaseFlora[], position: Vector2): BaseFlora[] {
    return plants.filter(plant => {
      // Don't see dead/consumed plants
      if (plant.lifeEnergy <= 0) return false;
      return this.canSee(plant.position, position);
    });
  }

  /**
   * Get the angle of the vision direction in radians
   */
  getDirectionAngle(): number {
    return Math.atan2(this.direction.y, this.direction.x);
  }
}
