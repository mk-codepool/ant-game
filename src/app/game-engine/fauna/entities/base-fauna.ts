import { Life, type LifeProps, type Vector2 } from "../../shared/life";
import { Vision } from "../perception";
import { type Goal, type Behavior, type BehaviorContext } from "../behavior";
import type { BaseFlora } from "../../flora/entities/base-flora";
import { ActionType } from "../../shared/action-type";

export interface BaseFaunaProps extends LifeProps {
  speed?: number;
}

export abstract class BaseFauna extends Life {
  baseSpeed: number;
  target: Vector2 = {
    x: 0,
    y: 0,
  };

  vision: Vision;
  currentGoal!: Goal;
  currentBehavior: Behavior | null = null;

  override energyLossPerUnit = 0.1;
  private lastPosition: Vector2;

  deathReason: string = '';
  timeSinceDeath: number = 0;

  abstract get speciesName(): string;
  abstract getInitialEnergy(): number;

  constructor(props: BaseFaunaProps) {
    super(props);
    this.lifeEnergy = this.getInitialEnergy();
    this.baseSpeed = props.speed ?? 60; // units per second

    this.vision = new Vision(150, 120); // 150 range, 120° angle
    this.lastPosition = { ...this.position };
  }

  setTarget = (target: Vector2) => {
    this.target = target;
  }

  calculateSpeed = (distance: number): number => {
    const distanceFactor = Math.min(1.5, Math.log10(distance + 10) / 2);
    const randomFactor = 0.8 + Math.random() * 0.4;
    return this.baseSpeed * distanceFactor * randomFactor;
  }

  move = (dt: number, context: BehaviorContext) => {
    const oldX = this.position.x;
    const oldY = this.position.y;

    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= 0.01) return;

    const currentSpeed = this.calculateSpeed(distance);
    const step = currentSpeed * dt;

    let moveX = 0;
    let moveY = 0;

    if (distance <= step) {
      moveX = this.target.x - this.position.x;
      moveY = this.target.y - this.position.y;
    } else {
      const dirX = dx / distance;
      const dirY = dy / distance;
      moveX = dirX * step;
      moveY = dirY * step;
    }

    let nextX = this.position.x + moveX;
    let nextY = this.position.y + moveY;
    
    // Soft sliding collision with plants
    for (const plant of context.plants) {
      if (plant.lifeEnergy <= 0) continue;
      const pdx = nextX - plant.position.x;
      const pdy = nextY - plant.position.y;
      const minRadius = this.hitboxRadius + plant.hitboxRadius;
      if (pdx * pdx + pdy * pdy < minRadius * minRadius) {
         const d = Math.sqrt(pdx * pdx + pdy * pdy) || 0.1;
         const overlap = minRadius - d;
         nextX += (pdx / d) * overlap;
         nextY += (pdy / d) * overlap;
      }
    }

    // Soft sliding collision with other creatures
    for (const other of context.creatures) {
      if (other === this || other.isDead()) continue;
      const odx = nextX - other.position.x;
      const ody = nextY - other.position.y;
      const minRadius = this.hitboxRadius + other.hitboxRadius;
      if (odx * odx + ody * ody < minRadius * minRadius) {
         const d = Math.sqrt(odx * odx + ody * ody) || 0.1;
         const overlap = minRadius - d;
         nextX += (odx / d) * overlap;
         nextY += (ody / d) * overlap;
      }
    }

    // World border constraint
    nextX = Math.max(context.worldBorders.xStart, Math.min(context.worldBorders.xEnd, nextX));
    nextY = Math.max(context.worldBorders.yStart, Math.min(context.worldBorders.yEnd, nextY));

    this.position.x = nextX;
    this.position.y = nextY;

    const deltaX = this.position.x - oldX;
    const deltaY = this.position.y - oldY;
    const distanceTraveled = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    this.consumeEnergy(ActionType.MOVE, distanceTraveled);
  }

  update = (dt: number, context: BehaviorContext): void => {
    if (this.isDead()) {
      this.timeSinceDeath += dt;
      return;
    }

    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

    if (distanceToTarget > 0.01) {
      this.vision.updateDirection({ x: dx, y: dy });
    }

    if (this.currentGoal) {
      this.currentBehavior = this.currentGoal.evaluate(this, context);
    }

    if (this.currentBehavior) {
      this.currentBehavior.execute(this, context, dt);
    }

    this.move(dt, context);
  }

  eat = (plant: BaseFlora): void => {
    const energyGained = plant.lifeEnergy;
    this.modifyEnergy(energyGained);
    plant.modifyEnergy(-plant.lifeEnergy);
  }

  override ageUp = (): void => {
    if (this.isDead()) return;
    this.age++;
  }

  die = (reason: string): void => {
    if (this.isDead()) return;
    this.lifeEnergy = 0;
    this.deathReason = reason;
    this.timeSinceDeath = 0;
  }
}
