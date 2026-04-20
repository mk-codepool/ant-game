import { Component, ChangeDetectorRef, type OnInit, type OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import GE from '../game-engine';
import { TerrainType } from '../game-engine/world-map/terrain-generator.service';

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './info-panel.component.html',
  styleUrl: './info-panel.component.css'
})
export class InfoPanelComponent implements OnInit, OnDestroy {
  engine = GE;
  creaturesDef = GE.world.fauna.creaturesDef;
  plantsDef = GE.world.flora.plantsDef;
  TerrainType = TerrainType;


  activeTab: 'config' | 'stats' = 'config';

  private mouseSubscription?: Subscription;
  private intervalId: any;

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    // Auto refresh stats periodically
    this.intervalId = setInterval(() => {
      this.cdr.detectChanges();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  // Helper to trigger change detection from outside
  refresh() {
    this.cdr.detectChanges();
  }

  setTab(tab: 'config' | 'stats') {
    this.activeTab = tab;
  }

  getZoomFactor(): number {
    const camera = (this.engine as any).camera;
    if (camera) {
      return camera.radius;
    }
    return 1000;
  }

  setZoomFactor(value: number) {
    const camera = (this.engine as any).camera;
    if (camera) {
      camera.radius = value;
    }
  }

  saveConfig() {
    const zoom = this.getZoomFactor();
    localStorage.setItem('ant-game-zoom', zoom.toString());
  }

  resetConfig() {
    this.setZoomFactor(600);
    localStorage.removeItem('ant-game-zoom');
  }

  clearSaveData() {
    this.engine.saveService.clearAllSaves().then(() => {
      // Hard reload to flush everything out of memory
      window.location.reload();
    });
  }


  getCreatureCount(alive: boolean): number {
    return this.engine.world.fauna.creatures?.filter((c: any) => alive ? c.lifeEnergy > 0 : c.lifeEnergy <= 0).length || 0;
  }

  getPlantCount(alive: boolean): number {
    return this.engine.world.flora.plants?.filter((c: any) => alive ? c.lifeEnergy > 0 : c.lifeEnergy <= 0).length || 0;
  }
}
