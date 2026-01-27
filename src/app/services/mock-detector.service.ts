import { Injectable } from '@angular/core';

export interface Detection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence: number;
  class: number;
}

@Injectable({
  providedIn: 'root'
})
export class MockDetectorService {
  private modelLoaded = false;

  constructor() {
    // Simulate model loading
    setTimeout(() => {
      this.modelLoaded = true;
      console.log('Mock detector ready');
    }, 1000);
  }

  async loadModel(modelPath: string): Promise<void> {
    console.log('Mock: Loading model from:', modelPath);
    return new Promise((resolve) => {
      setTimeout(() => {
        this.modelLoaded = true;
        console.log('Mock: Model loaded successfully');
        resolve();
      }, 1500);
    });
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  async detect(imageData: ImageData): Promise<Detection[]> {
    if (!this.modelLoaded) {
      throw new Error('Mock: Model not loaded');
    }

    // Simulate detection delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Generate mock detections
    const detections: Detection[] = [];
    const numDetections = Math.floor(Math.random() * 3); // 0-2 detections

    for (let i = 0; i < numDetections; i++) {
      const x = Math.random() * (imageData.width - 100);
      const y = Math.random() * (imageData.height - 100);
      const width = 80 + Math.random() * 50;
      const height = 30 + Math.random() * 20;
      const confidence = 0.7 + Math.random() * 0.3;

      detections.push({
        bbox: [x, y, width, height],
        confidence: confidence,
        class: 0
      });
    }

    console.log(`Mock: Detected ${detections.length} barcodes`);
    return detections;
  }
}
