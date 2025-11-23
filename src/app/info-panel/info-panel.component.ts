import { Component, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import GE from '../game-engine';

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="infopanel-container">
      <div class="row">
        <div class="col">
          <div class="btn-group btn-block">
            <button type="button" class="btn btn-secondary" (click)="initBang()">Bang</button>
            <button type="button" class="btn btn-secondary" (click)="setCanvasDownNewCreature(creaturesDef.creature)">Creature</button>
            <button type="button" class="btn btn-secondary" (click)="setCanvasDownNewPlant(plantsDef.plant)">Plant</button>
          </div>
        </div>
      </div>
      <hr />
      <div class="row">
        <div class="col-7 text-right">Frame:</div>
        <div class="col-5">{{ engine.frame }}</div>
      </div>
      <div class="row">
        <div class="col-7 text-right">Small cycle:</div>
        <div class="col-5">{{ engine.worldCycle.small }}</div>
      </div>
      <div class="row">
        <div class="col-7 text-right">Big cycle:</div>
        <div class="col-5">{{ engine.worldCycle.big }}</div>
      </div>
      <div class="row">
        <div class="col-7 text-right">Epic cycle:</div>
        <div class="col-5">{{ engine.worldCycle.epic }}</div>
      </div>
      <hr />
      <div class="row">
        <div class="col text-center">
          🙂 {{ getCreatureCount(true) }}
          💀 {{ getCreatureCount(false) }} = {{ engine.faunaAndFlora.creatures.length }}
        </div>
      </div>
      <div class="row">
        <div class="col text-center">
          🌳 {{ getPlantCount(true) }}
          💀 {{ getPlantCount(false) }} = {{ engine.faunaAndFlora.plants.length }}
        </div>
      </div>
      <hr />
      <div class="row">
        <div class="col-7 text-right">Mouse X:</div>
        <div class="col-5">{{ engine.mouseController.x }}</div>
      </div>
      <div class="row">
        <div class="col-7 text-right">Mouse Y:</div>
        <div class="col-5">{{ engine.mouseController.y }}</div>
      </div>
    </div>
  `,
  styles: [`
    .infopanel-container {
      padding: 15px;
      color: black; /* Bootstrap default is black, but let's see. React had no specific color, but main.scss might have. */
    }
    .row {
      display: flex;
      margin-bottom: 5px;
      flex-wrap: wrap; /* Bootstrap row wraps */
      margin-right: -15px;
      margin-left: -15px;
    }
    .col, .col-7, .col-5 {
      position: relative;
      width: 100%;
      padding-right: 15px;
      padding-left: 15px;
    }
    .col {
      flex-basis: 0;
      flex-grow: 1;
      max-width: 100%;
    }
    .col-7 {
      flex: 0 0 58.333333%;
      max-width: 58.333333%;
    }
    .col-5 {
      flex: 0 0 41.666667%;
      max-width: 41.666667%;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .btn-block { display: block; width: 100%; }
    .btn-group {
      position: relative;
      display: inline-flex;
      vertical-align: middle;
      width: 100%;
    }
    .btn {
      flex: 1;
    }
  `]
})
export class InfoPanelComponent {
  engine = GE;
  creaturesDef = GE.faunaAndFlora.creaturesDef;
  plantsDef = GE.faunaAndFlora.plantsDef;

  constructor(private cdr: ChangeDetectorRef) { }

  // Helper to trigger change detection from outside
  refresh() {
    this.cdr.detectChanges();
  }

  initBang() {
    const { faunaAndFlora } = this.engine;
    Array.from({ length: 10 }).forEach(() => faunaAndFlora.createPlant());
    Array.from({ length: 100 }).forEach(() => faunaAndFlora.createCreature());
  }

  private mouseSubscription?: Subscription;

  setCanvasDownNewCreature(newThing: any) {
    this.mouseSubscription?.unsubscribe();
    this.mouseSubscription = this.engine.mouseController.onMouseDown.subscribe(({ x, y }) => {
      this.engine.faunaAndFlora.createCreature(newThing, x, y);
    });
  }

  setCanvasDownNewPlant(newThing: any) {
    this.mouseSubscription?.unsubscribe();
    this.mouseSubscription = this.engine.mouseController.onMouseDown.subscribe(({ x, y }) => {
      this.engine.faunaAndFlora.createPlant(newThing, x, y);
    });
  }

  getCreatureCount(alive: boolean): number {
    return this.engine.faunaAndFlora.creatures?.filter((c: any) => alive ? c.lifeEnergy > 0 : c.lifeEnergy <= 0).length || 0;
  }

  getPlantCount(alive: boolean): number {
    return this.engine.faunaAndFlora.plants?.filter((c: any) => alive ? c.lifeEnergy > 0 : c.lifeEnergy <= 0).length || 0;
  }
}
