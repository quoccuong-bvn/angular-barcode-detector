import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BarcodeDetectorComponent } from './components/barcode-detector.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, BarcodeDetectorComponent],
  template: `
    <div class="app-container">
      <app-barcode-detector></app-barcode-detector>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    }
  `]
})
export class AppComponent {
  title = 'Angular Barcode Detector';
}
