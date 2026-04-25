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
  private rangeSquared: number;
  private cosHalfAngle: number;

  constructor(range = 150, angleInDegrees = 120) {
    this.range = range;
    this.angle = (angleInDegrees * Math.PI) / 180; // Convert to radians
    this.direction = { x: 1, y: 0 }; // Default facing right
    this.rangeSquared = range * range;
    this.cosHalfAngle = Math.cos(this.angle / 2);
  }

  /**
   * Updates the direction the creature is looking based on movement
   */
  updateDirection(velocity: Vector2): void {
    const magnitude = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (magnitude > 0.01) {
      // Only update if there's significant movement
      this.direction.x = velocity.x / magnitude;
      this.direction.y = velocity.y / magnitude;
    }
  }

  /**
   * Checks if a target position is within the vision cone
   */
  canSee(target: Vector2, position: Vector2): boolean {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > this.rangeSquared || distanceSquared < 0.0001) {
      return false;
    }

    const dot = (this.direction.x * dx) + (this.direction.y * dy);
    if (dot <= 0) return false;

    return dot * dot >= distanceSquared * this.cosHalfAngle * this.cosHalfAngle;
  }

  /**
   * Finds all plants visible to the creature
   */
  findVisiblePlants(plants: BaseFlora[], position: Vector2): BaseFlora[] {
    const visible: BaseFlora[] = [];
    for (const plant of plants) {
      // Don't see dead/consumed plants
      if (plant.lifeEnergy <= 0) continue;
      if (this.canSee(plant.position, position)) {
        visible.push(plant);
      }
    }
    return visible;
  }

  /**
   * Get the angle of the vision direction in radians
   */
  getDirectionAngle(): number {
    return Math.atan2(this.direction.y, this.direction.x);
  }
}
