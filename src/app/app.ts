import { Component, OnInit, ViewChild } from '@angular/core';
import { CanvasContainerComponent } from './canvas-container/canvas-container.component';
import { InfoPanelComponent } from './info-panel/info-panel.component';
import GE from './game-engine';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CanvasContainerComponent, InfoPanelComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  @ViewChild(InfoPanelComponent) infoPanel!: InfoPanelComponent;

  ngOnInit() {
    GE.init({
      renderCallback: () => {
        if (this.infoPanel) {
          this.infoPanel.refresh();
        }
      }
    });
    GE.runEngine();
  }
}
