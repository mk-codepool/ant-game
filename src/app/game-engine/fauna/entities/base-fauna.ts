import { Life, type LifeProps, type Vector2 } from "../../shared/life";
import { Vision } from "../perception";
import { type Goal, type Behavior, type BehaviorContext } from "../behavior";
import type { BaseFlora } from "../../flora/entities/base-flora";
import { ActionType } from "../../shared/action-type";
import { BehaviourName } from "../behavior";

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
  // Cache of local plants to prevent checking 8,000+ plants per frame for collisions
  localPlants: BaseFlora[] = [];
  private dtAccumulator = 0;
  private thinkTimer = Math.random(); // Start with random offset to distribute load across frames

  velocity: Vector2 = { x: 0, y: 0 };
  turnSpeed: number = 3.0;
  wobblePhase: number = Math.random() * Math.PI * 2;
  wobbleSpeed: number = 1.0;
  wobbleAmplitude: number = 0.5;

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

    if (distance <= 0.01) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }

    // 1. Arrival Behavior
    const slowingRadius = 20.0;
    let targetSpeed = this.baseSpeed;
    if (distance < slowingRadius) {
      targetSpeed = this.baseSpeed * (distance / slowingRadius);
    }

    // Preserve distance factor logic but cap at our Arrival target speed
    const calculatedMaxSpeed = this.calculateSpeed(distance);
    targetSpeed = Math.min(targetSpeed, calculatedMaxSpeed);

    // Desired Velocity
    const dirX = dx / distance;
    const dirY = dy / distance;
    let desiredVx = dirX * targetSpeed;
    let desiredVy = dirY * targetSpeed;

    // 2. Wobble (only if wandering)
    if (this.currentBehavior && this.currentBehavior.name === BehaviourName.Wander) {
      this.wobblePhase += this.wobbleSpeed * dt;
      const wobbleAngle = Math.cos(this.wobblePhase) * this.wobbleAmplitude;

      // Rotate desired velocity by wobbleAngle
      const cosW = Math.cos(wobbleAngle);
      const sinW = Math.sin(wobbleAngle);
      const rotVx = desiredVx * cosW - desiredVy * sinW;
      const rotVy = desiredVx * sinW + desiredVy * cosW;
      desiredVx = rotVx;
      desiredVy = rotVy;
    }

    // 3. Steering
    const steerX = desiredVx - this.velocity.x;
    const steerY = desiredVy - this.velocity.y;

    this.velocity.x += steerX * this.turnSpeed * dt;
    this.velocity.y += steerY * this.turnSpeed * dt;

    let nextX = this.position.x + this.velocity.x * dt;
    let nextY = this.position.y + this.velocity.y * dt;
    
    // Soft sliding collision ONLY with nearby cached plants (saves 8,000 array loops per frame)
    for (const plant of this.localPlants) {
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

  // Heavy AI logic shifted to the small cycle to relieve the main frame loop
  think = (context: BehaviorContext): void => {
    if (this.isDead()) return;

    // Cache nearby plants for collision (radius e.g., 30)
    // Doing this less frequently saves millions of collision array loops every frame
    this.localPlants = [];
    const nearby = context.getNearbyPlants 
      ? context.getNearbyPlants(this.position.x, this.position.y, 30)
      : context.plants;
    for (const plant of nearby) {
      if (plant.lifeEnergy <= 0) continue;
      // Using quick manhattan distance check first for extreme speed
      const dx = Math.abs(plant.position.x - this.position.x);
      const dy = Math.abs(plant.position.y - this.position.y);
      if (dx < 30 && dy < 30) {
        this.localPlants.push(plant);
      }
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
      this.currentBehavior.execute(this, context, this.dtAccumulator);
    }
    
    // Reset accumulated delta time since we just evaluated
    this.dtAccumulator = 0;
  }

  update = (dt: number, context: BehaviorContext): void => {
    if (this.isDead()) {
      this.timeSinceDeath += dt;
      return;
    }

    this.dtAccumulator += dt;
    this.thinkTimer += dt;

    if (this.thinkTimer >= 1.0) {
      this.thinkTimer -= 1.0;
      this.think(context);
    }

    // ONLY execute simple cached movement in the frame loop!
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
