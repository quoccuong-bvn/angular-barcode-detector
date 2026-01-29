import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import * as ort from 'onnxruntime-web';
import 'onnxruntime-web/webgl';
import 'onnxruntime-web/wasm';

export interface Detection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence: number;
  class: number;
}

interface PreprocessResult {
  tensor: ort.Tensor;
  scale: number;
  padX: number;
  padY: number;
}

@Injectable({
  providedIn: 'root'
})
export class OnnxDetectorService {
  private session: ort.InferenceSession | null = null;
  private modelLoaded = false;
  private readonly inputSize = 224; // YOLOv8 Tiny ORT model expects 224x224 input
  private readonly confThreshold = 0.1; // Lowered from 0.25 to detect more
  private readonly iouThreshold = 0.45;
  private readonly debug = false;
  private readonly isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  constructor(@Inject(DOCUMENT) private documentRef: Document) {
    // Configure ONNX Runtime to load WASM files from assets (works with GitHub Pages baseHref)
    const baseUrl = this.documentRef.baseURI || window.location.href;
    ort.env.wasm.wasmPaths = new URL('assets/wasm/', baseUrl).toString();
    
    // iOS Safari doesn't support SharedArrayBuffer, so we must disable threads
    // This must be set BEFORE any WASM module is loaded
    if (this.isIOS) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = false;
      this.debugLog('iOS detected: Using single-threaded WASM without SIMD');
    } else {
      // Optimize thread count based on device capabilities
      const optimalThreads = this.getOptimalThreadCount();
      ort.env.wasm.numThreads = optimalThreads;
      ort.env.wasm.simd = true;
      this.debugLog('Optimal thread count for this device:', optimalThreads);
    }

    const hasSharedMemory = typeof SharedArrayBuffer !== 'undefined' && (window as any).crossOriginIsolated === true;
    if (!hasSharedMemory) {
      ort.env.wasm.numThreads = 1;
      this.debugLog('SharedArrayBuffer not available: forcing single-thread WASM');
    }
    
    ort.env.wasm.proxy = false; // Disable proxy to load from local assets

    this.debugLog('ONNX Runtime configured with WASM path:', ort.env.wasm.wasmPaths);
  }

  private getOptimalThreadCount(): number {
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    
    // Detect if this is a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    (window.innerWidth <= 768 && window.innerHeight > window.innerWidth);
    
    // Detect if this is a touch device (likely mobile/tablet)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    let optimalThreads: number;
    
    if (isMobile || isTouchDevice) {
      // Mobile devices: use minimal threads to save battery and avoid overhead
      optimalThreads = Math.min(2, Math.max(1, Math.floor(hardwareConcurrency / 2)));
    } else {
      // Desktop: can use more threads
      optimalThreads = Math.min(4, Math.max(2, Math.floor(hardwareConcurrency / 2)));
    }
    
    this.debugLog('Device detection:', { 
      hardwareConcurrency, 
      isMobile, 
      isTouchDevice, 
      optimalThreads 
    });
    
    return optimalThreads;
  }

  private debugLog(...args: any[]) {
    if (this.debug) {
      console.log(...args);
    }
  }

  private getAvailableBackends(): string[] {
    // Check what execution providers are actually registered in ONNX Runtime
    try {
      // ONNX Runtime Web typically has these backends
      const possibleBackends = ['webgl', 'wasm', 'webnn', 'cpu'];
      this.debugLog('Checking ONNX Runtime backend availability...');
      return possibleBackends;
    } catch (e) {
      this.debugLog('Error checking backends:', e);
      return [];
    }
  }

  private hasWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      const hasGL = !!gl;
      
      if (gl && typeof (gl as any).getParameter === 'function') {
        // Verify it's actually functional
        const vendor = (gl as any).getParameter((gl as any).VENDOR);
        this.debugLog('WebGL vendor:', vendor);
      }
      
      this.debugLog('WebGL support:', hasGL);
      return hasGL;
    } catch (e) {
      this.debugLog('WebGL check failed:', e);
      return false;
    }
  }

  private hasWasmSupport(): boolean {
    // WASM can work without SharedArrayBuffer, just without multi-threading
    try {
      return typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';
    } catch {
      return false;
    }
  }

  private hasWasmSharedMemorySupport(): boolean {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const isIsolated = (window as any).crossOriginIsolated === true;
    return hasSharedArrayBuffer && isIsolated;
  }

  async loadModel(modelPath: string): Promise<void> {
    try {
      this.debugLog('Loading ORT model from:', modelPath);
      this.debugLog('ONNX Runtime version:', ort.env.versions);
      this.debugLog('Available backends:', this.getAvailableBackends());
      this.debugLog('Current location:', window.location.href);

      // For iOS, try different loading strategies
      if (this.isIOS) {
        // Fetch model as ArrayBuffer first (sometimes helps with iOS)
        let modelData: ArrayBuffer | null = null;
        try {
          const absoluteUrl = new URL(modelPath, window.location.href).toString();
          const candidates = [absoluteUrl];
          if (absoluteUrl.includes('?')) {
            candidates.push(absoluteUrl.split('?')[0]);
          }

          let lastFetchError: any = null;
          for (const url of candidates) {
            try {
              this.debugLog('iOS: Fetching model as ArrayBuffer:', url);
              const response = await fetch(url, { cache: 'no-store' });
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              modelData = await response.arrayBuffer();
              this.debugLog(`iOS: Model loaded, size: ${modelData.byteLength} bytes`);
              break;
            } catch (fetchError: any) {
              lastFetchError = fetchError;
              this.debugLog('iOS: Fetch failed for URL:', url, fetchError?.message || fetchError);
            }
          }

          if (!modelData) {
            throw lastFetchError || new Error('Unknown fetch error');
          }
        } catch (fetchError: any) {
          throw new Error(`iOS: Cannot fetch model file: ${fetchError.message}`);
        }

        // Strategy 1: Try with explicit WebGL
        try {
          this.debugLog('iOS Strategy 1: Trying explicit WebGL provider');
          this.session = await ort.InferenceSession.create(modelData, {
            executionProviders: ['webgl'],
            graphOptimizationLevel: 'all'
          });
          this.debugLog('✅ iOS: Successfully loaded with WebGL');
          this.modelLoaded = true;
          return;
        } catch (webglError: any) {
          const errorMsg = webglError?.message || String(webglError);
          console.error('iOS WebGL failed:', webglError);
          this.debugLog('❌ iOS Strategy 1 failed:', errorMsg);
        }

        // Strategy 2: Try with WASM (might work on newer iOS versions)
        try {
          this.debugLog('iOS Strategy 2: Trying WASM provider');
          this.session = await ort.InferenceSession.create(modelData, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'basic'
          });
          this.debugLog('✅ iOS: Successfully loaded with WASM');
          this.modelLoaded = true;
          return;
        } catch (wasmError: any) {
          const errorMsg = wasmError?.message || String(wasmError);
          console.error('iOS WASM failed:', wasmError);
          this.debugLog('❌ iOS Strategy 2 failed:', errorMsg);
        }

        // Strategy 3: Let ONNX Runtime auto-select backend
        try {
          this.debugLog('iOS Strategy 3: Auto-select backend');
          this.session = await ort.InferenceSession.create(modelData, {
            graphOptimizationLevel: 'basic'
          });
          this.debugLog('✅ iOS: Successfully loaded with auto-selected backend');
          this.modelLoaded = true;
          return;
        } catch (autoError: any) {
          const errorMsg = autoError?.message || String(autoError);
          console.error('iOS auto-select failed:', autoError);
          this.debugLog('❌ iOS Strategy 3 failed:', errorMsg);
          
          // Provide detailed error message
          throw new Error(`iOS: Cannot load model. All strategies failed.\n` +
                         `Last error: ${errorMsg}\n` +
                         `Model size: ${modelData.byteLength} bytes\n` +
                         `Try: 1) Enable WebGL in Safari 2) Update iOS 3) Use different browser`);
        }
      }

      // Non-iOS path: Try WebGL first, then WASM
      const webglSupported = this.hasWebGLSupport();
      const wasmSupported = this.hasWasmSupport();
      
      this.debugLog('Backend support:', { webglSupported, wasmSupported });

      const providers: ('webgl' | 'wasm')[] = [];
      if (webglSupported) providers.push('webgl');
      if (wasmSupported) providers.push('wasm');

      if (providers.length === 0) {
        throw new Error('No available backend. Both WebGL and WASM are unavailable.');
      }

      let simdFallbackAttempted = false;

      let lastProviderError: any = null;
      for (const provider of providers) {
        try {
          this.debugLog(`Trying execution provider: ${provider}`);
          
          this.session = await ort.InferenceSession.create(modelPath, {
            executionProviders: [provider],
            graphOptimizationLevel: 'all'
          });
          this.debugLog(`Successfully loaded model with ${provider} provider`);
          break;
        } catch (providerError) {
          lastProviderError = providerError;
          console.warn(`Failed to load with ${provider}:`, providerError);
          if (provider === 'wasm' && ort.env.wasm.simd && !simdFallbackAttempted) {
            try {
              simdFallbackAttempted = true;
              ort.env.wasm.simd = false;
              console.warn('Retrying WASM without SIMD...');
              this.session = await ort.InferenceSession.create(modelPath, {
                executionProviders: [provider],
                graphOptimizationLevel: 'all'
              });
              this.debugLog('Successfully loaded model with wasm provider (SIMD disabled)');
              break;
            } catch (fallbackError) {
              console.warn('Failed to load with wasm provider (SIMD disabled):', fallbackError);
              throw fallbackError;
            }
          }
        }
      }

      if (!this.session) {
        // Last resort: try loading without specifying provider (let ONNX Runtime decide)
        try {
          this.debugLog('All providers failed, trying default backend...');
          this.session = await ort.InferenceSession.create(modelPath, {
            graphOptimizationLevel: 'basic'
          });
          this.debugLog('Successfully loaded model with default backend');
        } catch (defaultError) {
          console.error('Default backend also failed:', defaultError);
          throw lastProviderError || defaultError;
        }
      }

      if (!this.session) {
        throw lastProviderError || new Error('Failed to initialize inference session');
      }

      this.modelLoaded = true;
      this.debugLog('Model loaded successfully');
      this.debugLog('Input names:', this.session.inputNames);
      this.debugLog('Output names:', this.session.outputNames);
    } catch (error) {
      console.error('Failed to load ONNX model:', error);
      this.modelLoaded = false;
      throw error;
    }
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  async detect(imageData: ImageData): Promise<Detection[]> {
    if (!this.session) {
      throw new Error('Model not loaded');
    }

    try {
      // Preprocess image
      const preprocessed = this.preprocessImage(imageData);
      
      // Run inference
      const feeds: Record<string, ort.Tensor> = {};
      feeds[this.session.inputNames[0]] = preprocessed.tensor;
      
      const outputData = await this.session.run(feeds);
      const output = outputData[this.session.outputNames[0]];
      
      // Post-process results
      const detections = this.postprocess(output, imageData.width, imageData.height, preprocessed);
      
      return detections;
    } catch (error) {
      console.error('Detection error:', error);
      return [];
    }
  }

  private preprocessImage(imageData: ImageData): PreprocessResult {
    const { width, height } = imageData;
    
    // Create canvas for resizing
    const canvas = document.createElement('canvas');
    canvas.width = this.inputSize;
    canvas.height = this.inputSize;
    const ctx = canvas.getContext('2d')!;
    
    // Letterbox resize to preserve aspect ratio
    const scale = Math.min(this.inputSize / width, this.inputSize / height);
    const resizedWidth = Math.round(width * scale);
    const resizedHeight = Math.round(height * scale);
    const padX = Math.round((this.inputSize - resizedWidth) / 2);
    const padY = Math.round((this.inputSize - resizedHeight) / 2);

    // Fill background to avoid black borders affecting detection
    ctx.fillStyle = 'rgb(114, 114, 114)';
    ctx.fillRect(0, 0, this.inputSize, this.inputSize);

    // Draw and resize image with padding
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);
    
    ctx.drawImage(tempCanvas, padX, padY, resizedWidth, resizedHeight);
    const resizedData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
    
    // Convert to CHW format and normalize
    const pixelData = resizedData.data;
    const red: number[] = [];
    const green: number[] = [];
    const blue: number[] = [];
    
    for (let i = 0; i < pixelData.length; i += 4) {
      red.push(pixelData[i] / 255.0);
      green.push(pixelData[i + 1] / 255.0);
      blue.push(pixelData[i + 2] / 255.0);
    }
    
    const transposed = Float32Array.from([...red, ...green, ...blue]);
    
    return {
      tensor: new ort.Tensor('float32', transposed, [1, 3, this.inputSize, this.inputSize]),
      scale,
      padX,
      padY
    };
  }

  private postprocess(
    output: ort.Tensor,
    originalWidth: number,
    originalHeight: number,
    preprocess: PreprocessResult
  ): Detection[] {
    const detections: Detection[] = [];
    const outputData = output.data as Float32Array;
    const dimensions = output.dims;
    
    this.debugLog('ðŸ” ONNX Output dimensions:', dimensions);
    this.debugLog('ðŸ” Output data length:', outputData.length);
    this.debugLog('ðŸ” First 20 values:', Array.from(outputData.slice(0, 20)));
    
    // YOLO output format is typically [1, features, predictions] or [1, predictions, features]
    let numPredictions = 0;
    let numClasses = 0;
    let numFeatures = 0;
    let featuresFirst = false;
    let hasObjectness = false;
    
    if (dimensions.length === 3) {
      const d1 = dimensions[1];
      const d2 = dimensions[2];
      const d1LooksFeatures = d1 <= 100 && d2 > 100;
      const d2LooksFeatures = d2 <= 100 && d1 > 100;

      if (d1LooksFeatures) {
        // [1, features, predictions]
        numFeatures = d1;
        numPredictions = d2;
        featuresFirst = true;
      } else if (d2LooksFeatures) {
        // [1, predictions, features]
        numFeatures = d2;
        numPredictions = d1;
        featuresFirst = false;
      } else if (d1 > d2) {
        numFeatures = d1;
        numPredictions = d2;
        featuresFirst = true;
      } else {
        numFeatures = d2;
        numPredictions = d1;
        featuresFirst = false;
      }

      if (numFeatures === 4) {
        numClasses = 1;
        hasObjectness = false;
      } else if (numFeatures === 5) {
        numClasses = 1;
        hasObjectness = true;
      } else if (numFeatures === 6) {
        numClasses = 1;
        hasObjectness = true;
      } else if (numFeatures === 84) {
        numClasses = 80;
        hasObjectness = false;
      } else if (numFeatures === 85) {
        numClasses = 80;
        hasObjectness = true;
      } else {
        const classesNoObj = numFeatures - 4;
        const classesWithObj = numFeatures - 5;
        if (classesWithObj >= 1 && (classesWithObj === 1 || classesWithObj === 80)) {
          numClasses = classesWithObj;
          hasObjectness = true;
        } else {
          numClasses = classesNoObj;
          hasObjectness = false;
        }
      }
    } else {
      console.warn('Unexpected output dimensions:', dimensions);
      return detections;
    }

    const { scale, padX, padY } = preprocess;

    this.debugLog('ðŸ” Processing predictions:', numPredictions, 'features:', numFeatures, 'classes:', numClasses, 'featuresFirst:', featuresFirst, 'hasObjectness:', hasObjectness);
    this.debugLog('🔍 Letterbox scale:', scale, 'pad:', padX, padY);
    this.debugLog('ðŸ” Confidence threshold:', this.confThreshold);
    
    const getValue = (featureIndex: number, predictionIndex: number): number => {
      if (featuresFirst) {
        return outputData[featureIndex * numPredictions + predictionIndex];
      }
      return outputData[predictionIndex * numFeatures + featureIndex];
    };

    let candidateCount = 0;

    for (let i = 0; i < numPredictions; i++) {
      // Extract box coordinates and confidence
      let x_center, y_center, w, h, confidence;

      x_center = getValue(0, i);
      y_center = getValue(1, i);
      w = getValue(2, i);
      h = getValue(3, i);

      let objectness = 1;
      let classStartIndex = 4;
      if (hasObjectness) {
        objectness = getValue(4, i);
        classStartIndex = 5;
      }

      confidence = 0;
      if (numFeatures <= classStartIndex) {
        confidence = objectness;
      } else {
        for (let c = 0; c < numClasses; c++) {
          const classConf = getValue(classStartIndex + c, i);
          if (classConf > confidence) {
            confidence = classConf;
          }
        }
        confidence *= objectness;
      }

      if (confidence > this.confThreshold) {
        candidateCount++;
        
        // YOLOv8 outputs normalized coordinates (0-1) or pixel coordinates
        // Check if normalized and convert
        let x_pixel = x_center;
        let y_pixel = y_center;
        let w_pixel = w;
        let h_pixel = h;
        
        // If values are < 2, they're likely normalized (0-1), multiply by input size
        if (x_center < 2 && y_center < 2 && w < 2 && h < 2) {
          x_pixel = x_center * this.inputSize;
          y_pixel = y_center * this.inputSize;
          w_pixel = w * this.inputSize;
          h_pixel = h * this.inputSize;
        }
        
        // Convert from letterboxed input to original image coordinates
        const x = (x_pixel - w_pixel / 2 - padX) / scale;
        const y = (y_pixel - h_pixel / 2 - padY) / scale;
        const width = w_pixel / scale;
        const height = h_pixel / scale;

        const clampedX = Math.max(0, Math.min(originalWidth - 1, x));
        const clampedY = Math.max(0, Math.min(originalHeight - 1, y));
        const clampedW = Math.max(0, Math.min(originalWidth - clampedX, width));
        const clampedH = Math.max(0, Math.min(originalHeight - clampedY, height));

        if (candidateCount <= 3) {
          this.debugLog(`ðŸŽ¯ Detection ${candidateCount}:`, {
            raw: { x_center: x_center.toFixed(4), y_center: y_center.toFixed(4), w: w.toFixed(4), h: h.toFixed(4) },
            pixel: { x_pixel: x_pixel.toFixed(1), y_pixel: y_pixel.toFixed(1), w_pixel: w_pixel.toFixed(1), h_pixel: h_pixel.toFixed(1) },
            confidence: confidence.toFixed(3),
            final_bbox: [clampedX.toFixed(1), clampedY.toFixed(1), clampedW.toFixed(1), clampedH.toFixed(1)]
          });
        }

        detections.push({
          bbox: [clampedX, clampedY, clampedW, clampedH],
          confidence: confidence,
          class: 0 // Barcode class
        });
      }
    }

    this.debugLog(`âœ… Found ${detections.length} candidate detections (threshold: ${this.confThreshold})`);

    // Apply NMS (Non-Maximum Suppression)
    const finalDetections = this.nonMaxSuppression(detections);
    this.debugLog(`ðŸŽ¯ After NMS: ${finalDetections.length} final detections`);
    return finalDetections;
  }

  private nonMaxSuppression(detections: Detection[]): Detection[] {
    if (detections.length === 0) return [];

    // Sort by confidence descending
    detections.sort((a, b) => b.confidence - a.confidence);

    const keep: Detection[] = [];

    while (detections.length > 0) {
      const current = detections.shift()!;
      keep.push(current);

      detections = detections.filter(det => {
        const iou = this.calculateIoU(current.bbox, det.bbox);
        return iou < this.iouThreshold;
      });
    }

    return keep;
  }

  private calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const x1_max = x1 + w1;
    const y1_max = y1 + h1;
    const x2_max = x2 + w2;
    const y2_max = y2 + h2;

    const intersectionX1 = Math.max(x1, x2);
    const intersectionY1 = Math.max(y1, y2);
    const intersectionX2 = Math.min(x1_max, x2_max);
    const intersectionY2 = Math.min(y1_max, y2_max);

    const intersectionWidth = Math.max(0, intersectionX2 - intersectionX1);
    const intersectionHeight = Math.max(0, intersectionY2 - intersectionY1);
    const intersectionArea = intersectionWidth * intersectionHeight;

    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - intersectionArea;

    return intersectionArea / unionArea;
  }
}

