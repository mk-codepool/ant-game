import { Component, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import GE from '../game-engine';
import { BiomeType } from '../game-engine/world-map/biome-generator.service';

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './info-panel.component.html',
  styleUrl: './info-panel.component.css'
})
export class InfoPanelComponent {
  engine = GE;
  creaturesDef = GE.world.fauna.creaturesDef;
  plantsDef = GE.world.flora.plantsDef;
  biomeType = BiomeType;

  constructor(private cdr: ChangeDetectorRef) { }

  // Helper to trigger change detection from outside
  refresh() {
    this.cdr.detectChanges();
  }

  pool() {
    const { world } = this.engine;
    Array.from({ length: 10 }).forEach(() => world.flora.createPlant());
    Array.from({ length: 10 }).forEach(() => world.fauna.createCreature());
  }

  resetBiomes() {
    const { world } = this.engine;
    world.terrain.reseedMap();
  }

  private mouseSubscription?: Subscription;

  setCanvasDownNewCreature(newThing: any) {
    this.mouseSubscription?.unsubscribe();
    this.mouseSubscription = this.engine.mouseController.onMouseDown.subscribe(({ x, y }) => {
      this.engine.world.fauna.createCreature(newThing, x, y);
    });
  }

  setCanvasDownNewPlant(newThing: any) {
    this.mouseSubscription?.unsubscribe();
    this.mouseSubscription = this.engine.mouseController.onMouseDown.subscribe(({ x, y }) => {
      this.engine.world.flora.createPlant(newThing, x, y);
    });
  }

  setCanvasDownBiome(biome: BiomeType) {
    this.mouseSubscription?.unsubscribe();
    this.mouseSubscription = this.engine.mouseController.onMouseDown.subscribe(({ x, y }) => {
      this.engine.world.terrain.setPixelBiome(x, y, biome);
    });
  }

  onBlurChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const val = parseFloat(input.value);
    this.engine.world.terrain.blurFactor = val;
    this.engine.world.terrain.recalculateColors();
  }

  getCreatureCount(alive: boolean): number {
    return this.engine.world.fauna.creatures?.filter((c: any) => alive ? c.lifeEnergy > 0 : c.lifeEnergy <= 0).length || 0;
  }

  getPlantCount(alive: boolean): number {
    return this.engine.world.flora.plants?.filter((c: any) => alive ? c.lifeEnergy > 0 : c.lifeEnergy <= 0).length || 0;
  }
}
