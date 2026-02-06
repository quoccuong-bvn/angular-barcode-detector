import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OnnxDetectorService, Detection } from '../services/onnx-detector.service';
import { MockDetectorService } from '../services/mock-detector.service';

@Component({
  selector: 'app-barcode-detector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-detector.component.html',
  styleUrls: ['./barcode-detector.component.scss']
})
export class BarcodeDetectorComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement', { static: false }) canvasElement!: ElementRef<HTMLCanvasElement>;

  isStreaming = false;
  isModelLoading = false;
  modelLoaded = false;

  error: string | null = null;
  detectionCount = 0;
  fps = 0;
  currentResolution = '';
  decodedText = '';
  decodedFormat = '';
  decodedHistory: { text: string; format: string; time: string }[] = [];
  private lastDecodedAt = 0;
  private recentDecodeHistory: string[] = []; // Track recent decode results
  private readonly requiredConsecutiveDecodes = 2; // Need 2 consecutive same results OR 2 same results in last 10
  private readonly maxHistorySize = 10; // Keep last 10 decode results
  showDecodePopup = false;
  finalDecodedText = '';
  finalDecodedFormat = '';
  streamMessage = '';
  private desiredStreamMessage = '';
  private desiredStreamPriority = 0;
  private streamMessageSince = 0;
  private readonly streamMessageHoldMs = 1500;
  useMockDetector = false; // Start with ONNX detector by default
  actualCameraFps = 0;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private detectionIntervalId: number | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private currentDetections: Detection[] = [];
  private overlayDirty = false;
  private detectionInFlight = false;
  private readonly tempDecodeCanvas = document.createElement('canvas');
  private readonly detectionCanvas = document.createElement('canvas');
  private detectionCtx: CanvasRenderingContext2D | null = null;
  private detectionWorker: Worker | null = null;
  private decodeWorker: Worker | null = null;
  private decodeWorkerReady = false;
  private decodeWorkerBusy = false;
  private decodeWorkerRequestId = 0;
  private workerReady = false;
  private workerBusy = false;
  private workerRequestId = 0;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsUpdateTime = 0;
  private lastVideoTime = 0;
  private videoFrameCount = 0;
  private lastVideoFpsUpdate = 0;
  private lastFpsUiUpdate = 0;
  private readonly debug = false;
  private readonly decodeCooldownMs = 0; // Removed cooldown since detection already has 500ms interval
  private lastDecodeAt = 0;
  private decodeInFlight = false;
  private readonly decodedStaleMs = 4000;
  diagnostics: {
    modelUrl?: string;
    modelSizeBytes?: number;
    backendUsed?: string;
    attempts: Array<{ backend: string; detail: string }>;
  } | null = null;
  private readonly roi = {
    top: 0.25,
    right: 0.2,
    bottom: 0.25,
    left: 0.2
  };

  constructor(
    private onnxDetectorService: OnnxDetectorService,
    private mockDetectorService: MockDetectorService,
    private ngZone: NgZone
  ) {}

  private getBasePath(): string {
    // Get base path from document baseURI or use default
    const base = document.baseURI || window.location.href;
    const url = new URL(base);
    const pathname = url.pathname;
    
    // If pathname ends with / or is just /, return it
    if (pathname === '/' || pathname.endsWith('/')) {
      return pathname;
    }
    
    // Otherwise return with trailing slash
    return pathname + '/';
  }

  getDiagnosticsAttemptsSummary(): string {
    if (!this.diagnostics || !this.diagnostics.attempts || this.diagnostics.attempts.length === 0) {
      return '';
    }
    return this.diagnostics.attempts
      .map((attempt) => `${attempt.backend} => ${attempt.detail}`)
      .join(' | ');
  }


  async ngOnInit() {
    await this.loadModel();
    this.initDetectionWorker();
    this.initDecodeWorker();
  }

  ngOnDestroy() {
    this.stopCamera();
    if (this.detectionWorker) {
      this.detectionWorker.terminate();
      this.detectionWorker = null;
    }
    if (this.decodeWorker) {
      this.decodeWorker.terminate();
      this.decodeWorker = null;
    }
  }

  private async loadModel() {
    try {
      this.isModelLoading = true;
      this.error = null;

      const detectorService = this.useMockDetector ? this.mockDetectorService : this.onnxDetectorService;

      if (this.useMockDetector) {
        // Mock detector doesn't need file path
        await detectorService.loadModel('');
      } else {
        // Get base path (handles baseHref in production)
        const basePath = this.getBasePath();
        
        const modelVersion = '2026-01-28-1';

        // Try different possible paths for the ONNX model
        const possiblePaths = [
          `${basePath}assets/models/yolotiny.onnx?v=${modelVersion}`,
          `/assets/models/yolotiny.onnx?v=${modelVersion}`
        ];

        let lastError: any = null;
        let pathsAttempted = 0;
        let candidatePaths = possiblePaths;

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
          const seen = new Set<string>();
          const probeCandidates: string[] = [];
          for (const path of possiblePaths) {
            const absolute = new URL(path, window.location.href).toString();
            if (!seen.has(absolute)) {
              seen.add(absolute);
              probeCandidates.push(absolute);
            }
            if (absolute.includes('?')) {
              const noQuery = absolute.split('?')[0];
              if (!seen.has(noQuery)) {
                seen.add(noQuery);
                probeCandidates.push(noQuery);
              }
            }
          }

          let selectedUrl: string | null = null;
          for (const url of probeCandidates) {
            try {
              const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
              if (response.ok) {
                selectedUrl = url;
                break;
              }
            } catch (probeError) {
            }
          }

          if (selectedUrl) {
            candidatePaths = [selectedUrl];
          } else {
            candidatePaths = probeCandidates;
          }
        }

        for (const modelPath of candidatePaths) {
          try {
            pathsAttempted++;
            await detectorService.loadModel(modelPath);
            break;
          } catch (pathError) {
            const errorMsg = (pathError as Error).message;
            lastError = pathError;
            // Continue to next path
          }
        }

        if (!detectorService.isModelLoaded()) {
          throw lastError || new Error(`All ${candidatePaths.length} model paths failed. Check console for details.`);
        }
      }

      this.modelLoaded = true;
      this.isModelLoading = false;
      this.diagnostics = this.onnxDetectorService.getLastDiagnostics();
    } catch (err) {
      const errorMessage = (err as Error).message;
      
      // Provide helpful error messages for common issues
      if (errorMessage.includes('iOS requires WebGL')) {
        this.error = 'iOS Safari: WebGL is required but not available. Please check:\n' +
                     '1. Safari Settings > Advanced > Enable WebGL\n' +
                     '2. Try updating iOS to the latest version\n' +
                     '3. Restart Safari browser';
      } else if (errorMessage.includes('backend not found') || errorMessage.includes('no available backend')) {
        this.error = 'No compatible graphics backend found. Your browser may not support WebGL or WebAssembly.';
      } else {
        this.error = 'Failed to load model: ' + errorMessage;
      }
      
      this.isModelLoading = false;
      this.diagnostics = this.onnxDetectorService.getLastDiagnostics();
    }
  }

  private initDetectionWorker() {
    if (typeof Worker === 'undefined') {
      return;
    }
    try {
      this.detectionWorker = new Worker(
        new URL('../workers/detection.worker', import.meta.url),
        { type: 'module' }
      );
      this.detectionWorker.onmessage = (event) => {
        const { type, id, detections, error } = event.data || {};
        if (type === 'ready') {
          this.workerReady = true;
          return;
        }
        if (type === 'error') {
          this.workerBusy = false;
          this.detectionInFlight = false;
          return;
        }
        if (type === 'result') {
          void this.handleWorkerResult(id, detections || []);
        }
      };

      const modelUrl = this.diagnostics?.modelUrl;
      if (modelUrl) {
        this.detectionWorker.postMessage({
          type: 'config',
          payload: {
            inputSize: 160,            confThreshold: 0.1,
            iouThreshold: 0.45
          }
        });
        this.detectionWorker.postMessage({ type: 'load', payload: { modelUrl } });
      }
    } catch (err) {
      // Worker initialization failed
    }
  }


  private async getUserMediaWithFallbacks(): Promise<MediaStream> {
    const frameRate = { ideal: 30, min: 20 };
    // Basic constraints only (allowed in getUserMedia)
    const constraintSets: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate
        },
        audio: false
      },
      {
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let lastError: any = null;

    for (const constraints of constraintSets) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
        // Try next constraint set
      }
    }

    throw lastError || new Error('Failed to access camera');
  }

  private async waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    if (video.readyState >= 2 && video.videoWidth > 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Video failed to load'));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 2000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('loadedmetadata', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  async startCamera() {
    try {
      this.error = null;
      if (this.isStreaming) {
        this.stopCamera();
      }

      this.stream = await this.getUserMediaWithFallbacks();

      const video = this.videoElement.nativeElement;
      // Ensure iOS Safari plays inline and allows canvas capture
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      video.playsInline = true;

      video.srcObject = this.stream;

      try {
        await video.play();
      } catch (playError) {
        // Autoplay prevented, will wait for metadata
      }

      await this.waitForVideoReady(video);

      const videoTrack = this.stream.getVideoTracks()[0];
      await this.applyAdvancedCameraControls(videoTrack);

      this.isStreaming = true;
      this.currentResolution = `${video.videoWidth}x${video.videoHeight}`;

      // Reset decode history for new session
      this.recentDecodeHistory = [];
      this.decodedText = '';
      this.decodedFormat = '';

      // Initialize FPS tracking
      this.lastVideoTime = 0;
      this.videoFrameCount = 0;
      this.lastVideoFpsUpdate = performance.now();
      this.actualCameraFps = 0;
      this.frameCount = 0;
      this.fpsUpdateTime = performance.now();
      this.fps = 0;

      this.setupCanvas();
      this.startStreamRendering();
      this.startDetectionLoop();
    } catch (err) {
      this.error = 'Failed to access camera: ' + (err as Error).message;
      // Camera access failed
    }
  }

  private initDecodeWorker() {
    if (typeof Worker === 'undefined') {
      return;
    }
    try {
      this.decodeWorker = new Worker(
        new URL('../workers/decode.worker', import.meta.url),
        { type: 'module' }
      );
      this.decodeWorker.onmessage = (event) => {
        const { type, id, text, format, error } = event.data || {};
        if (type === 'error') {
          this.decodeWorkerBusy = false;
          return;
        }
        if (type === 'result') {
          this.decodeWorkerBusy = false;
          if (text) {
            this.applyDecodeResult(text, format);
          }
        }
      };
      this.decodeWorkerReady = true;
    } catch (err) {
      // Decode worker initialization failed
    }
  }

  private async applyAdvancedCameraControls(track: MediaStreamTrack | undefined) {
    if (!track) return;
    const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
    const supportedAny = supported as any;
    const capabilities = track.getCapabilities?.() as any;
    if (!capabilities) return;

    const advanced: any = {};

    if (supportedAny.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('auto')) {
      advanced.focusMode = 'auto';
    }
    if (supportedAny.exposureMode && Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
      advanced.exposureMode = 'continuous';
    }
    if (supportedAny.whiteBalanceMode && Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
      advanced.whiteBalanceMode = 'continuous';
    }

    if (Object.keys(advanced).length === 0) return;

    try {
      await track.applyConstraints({ advanced: [advanced] });
    } catch (constraintError) {
      // Advanced camera controls not supported
    }
  }


  stopCamera() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.detectionIntervalId) {
      clearInterval(this.detectionIntervalId);
      this.detectionIntervalId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.isStreaming = false;
  }

  private setupCanvas() {
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    this.detectionCanvas.width = video.videoWidth;
    this.detectionCanvas.height = video.videoHeight;
    if (!this.detectionCtx) {
      this.detectionCtx = this.detectionCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  private startStreamRendering() {
    let lastRenderTime = 0;
    const targetFPS = 30;
    const targetFrameTime = 1000 / targetFPS; // ~33.33ms for 30 FPS

    const renderFrame = () => {
      if (!this.isStreaming) return;

      const currentTime = performance.now();

      // Check if enough time has passed for target FPS
      if (currentTime - lastRenderTime < targetFrameTime) {
        // Not enough time, skip this frame
        this.animationFrameId = requestAnimationFrame(renderFrame);
        return;
      }

      const canvas = this.canvasElement.nativeElement;
      const ctx = canvas.getContext('2d')!;

      // Only redraw detections if they changed
      if (this.detectionsChanged()) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.redrawDetectionOverlay(canvas);
      }

      // Update render time
      lastRenderTime = currentTime;

      // Count frames every render
      this.frameCount++;

      // Update FPS (run inside Angular zone for UI updates) every 500ms
      if (currentTime - this.lastFpsUiUpdate >= 500) {
        this.lastFpsUiUpdate = currentTime;
        this.ngZone.run(() => {
          this.updateFPS();
        });
      }

      this.animationFrameId = requestAnimationFrame(renderFrame);
    };

    // Start render loop
    this.animationFrameId = requestAnimationFrame(renderFrame);
  }

  private startDetectionLoop() {
    // Run detection every 500ms
    this.detectionIntervalId = setInterval(async () => {
      if (!this.isStreaming) return;
      if (this.detectionInFlight) return;

      await this.runDetectionCycle();
    }, 500);
  }

  private async runDetectionCycle() {
    this.detectionInFlight = true;
    const canvas = this.canvasElement.nativeElement;
    const video = this.videoElement.nativeElement;
    const detectionCtx = this.detectionCtx;
    if (!detectionCtx) {
      this.detectionInFlight = false;
      return;
    }

    // Draw current frame into detection canvas (offscreen)
    detectionCtx.drawImage(video, 0, 0, this.detectionCanvas.width, this.detectionCanvas.height);

    const roiX = Math.round(canvas.width * this.roi.left);
    const roiY = Math.round(canvas.height * this.roi.top);
    const roiWidth = Math.round(canvas.width * (1 - this.roi.left - this.roi.right));
    const roiHeight = Math.round(canvas.height * (1 - this.roi.top - this.roi.bottom));

    // Get image data for detection (ROI only)
    const imageData = detectionCtx.getImageData(roiX, roiY, roiWidth, roiHeight);

    // Run detection
    try {
      if (this.workerReady && this.detectionWorker && !this.workerBusy) {
        this.workerBusy = true;
        const id = ++this.workerRequestId;
        this.detectionWorker.postMessage(
          {
            type: 'detect',
            payload: {
              id,
              width: imageData.width,
              height: imageData.height,
              buffer: imageData.data.buffer,
              roiX,
              roiY
            }
          },
          [imageData.data.buffer]
        );
        return;
      }

      const detectorService = this.useMockDetector ? this.mockDetectorService : this.onnxDetectorService;
      const detections = await detectorService.detect(imageData);
      const mappedDetections = detections.map((detection) => {
        const [x, y, width, height] = detection.bbox;
        return {
          ...detection,
          bbox: [x + roiX, y + roiY, width, height] as [number, number, number, number]
        };
      });
      const visibleDetections = mappedDetections.filter((detection) => detection.confidence >= 0.3);
      const topDetection = visibleDetections.length > 0
        ? visibleDetections.reduce((best, current) => (current.confidence > best.confidence ? current : best))
        : null;
      const displayDetections = topDetection ? [topDetection] : [];
      this.detectionCount = displayDetections.length;

      await this.decodeBarcodes(this.detectionCanvas, displayDetections);
      const now = performance.now();
      if (this.decodedText && now - this.lastDecodedAt > this.decodedStaleMs) {
        this.decodedText = '';
        this.decodedFormat = '';
      }
      if (displayDetections.length === 0) {
        this.desiredStreamMessage = 'Please place barcode inside the red box';
        this.desiredStreamPriority = 0;
      } else if (!this.decodedText) {
        this.desiredStreamMessage = 'Move closer to the barcode for better scanning';
        this.desiredStreamPriority = 1;
      } else {
        this.desiredStreamMessage = '';
        this.desiredStreamPriority = 2;
      }
      this.updateStreamMessage();

      // Cache detection overlay for rendering loop
      this.cacheDetectionOverlay(canvas, displayDetections);
      
      // Debug info every 30 frames
    } catch (err) {
      // Detection failed
    } finally {
      this.detectionInFlight = false;
    }
  }

  private async handleWorkerResult(_id: number, detections: Detection[]) {
    this.workerBusy = false;
    this.detectionInFlight = false;

    const canvas = this.canvasElement.nativeElement;
    const roiX = Math.round(canvas.width * this.roi.left);
    const roiY = Math.round(canvas.height * this.roi.top);

    const mappedDetections = detections.map((detection) => {
      const [x, y, width, height] = detection.bbox;
      return {
        ...detection,
        bbox: [x + roiX, y + roiY, width, height] as [number, number, number, number]
      };
    });

    const visibleDetections = mappedDetections.filter((detection) => detection.confidence >= 0.3);
    const topDetection = visibleDetections.length > 0
      ? visibleDetections.reduce((best, current) => (current.confidence > best.confidence ? current : best))
      : null;
    const displayDetections = topDetection ? [topDetection] : [];
    this.detectionCount = displayDetections.length;

    if (displayDetections.length > 0) {
      await this.decodeBarcodes(this.detectionCanvas, displayDetections);
    }

    const now = performance.now();
    if (this.decodedText && now - this.lastDecodedAt > this.decodedStaleMs) {
      this.decodedText = '';
      this.decodedFormat = '';
    }
    if (displayDetections.length === 0) {
      this.desiredStreamMessage = 'Please place barcode inside the red box';
      this.desiredStreamPriority = 0;
    } else if (!this.decodedText) {
      this.desiredStreamMessage = 'Move closer to the barcode for better scanning';
      this.desiredStreamPriority = 1;
    } else {
      this.desiredStreamMessage = '';
      this.desiredStreamPriority = 2;
    }
    this.updateStreamMessage();

    this.cacheDetectionOverlay(canvas, displayDetections);
  }

  private async decodeBarcodes(canvas: HTMLCanvasElement, detections: Detection[]) {
    if (this.decodeInFlight || detections.length === 0) {
      return;
    }

    this.decodeInFlight = true;
    this.lastDecodeAt = performance.now();

    const tempCanvas = this.tempDecodeCanvas;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      this.decodeInFlight = false;
      return;
    }

    try {
      for (const detection of detections) {
        const [x, y, width, height] = detection.bbox;
        if (width < 10 || height < 10) continue;

        const padX = width * 0.15;
        const padY = height * 0.15;
        const cropX = Math.max(0, Math.floor(x - padX));
        const cropY = Math.max(0, Math.floor(y - padY));
        const cropW = Math.min(canvas.width - cropX, Math.ceil(width + padX * 2));
        const cropH = Math.min(canvas.height - cropY, Math.ceil(height + padY * 2));

        if (cropW < 2 || cropH < 2) continue;

        tempCanvas.width = Math.max(1, Math.round(cropW));
        tempCanvas.height = Math.max(1, Math.round(cropH));
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, tempCanvas.width, tempCanvas.height);

        try {
          const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }
          tempCtx.putImageData(imageData, 0, 0);

          if (!this.decodeWorkerReady || !this.decodeWorker || this.decodeWorkerBusy) {
            return;
          }

          this.decodeWorkerBusy = true;
          const id = ++this.decodeWorkerRequestId;
          this.decodeWorker.postMessage(
            {
              type: 'decode',
              payload: {
                id,
                width: imageData.width,
                height: imageData.height,
                buffer: imageData.data.buffer
              }
            },
            [imageData.data.buffer]
          );
          return;
        } catch (err) {
          // Ignore decode failures for this region
        }
      }
    } finally {
      this.decodeInFlight = false;
    }
  }

  private applyDecodeResult(text: string, format: string) {
    if (!text) return;
    const time = new Date().toLocaleTimeString();

    // Update recent decode history
    this.recentDecodeHistory.push(text);
    if (this.recentDecodeHistory.length > this.maxHistorySize) {
      this.recentDecodeHistory.shift(); // Remove oldest
    }

    // Check success conditions:
    // 1. At least 2 consecutive same results, OR
    // 2. At least 2 same results in the last 5 decodes
    let isSuccess = false;
    let successText = '';

    // Check for 2 consecutive same results
    if (this.recentDecodeHistory.length >= 2) {
      const lastTwo = this.recentDecodeHistory.slice(-2);
      if (lastTwo[0] === lastTwo[1]) {
        isSuccess = true;
        successText = lastTwo[0];
      }
    }

    // If not consecutive, check for 2+ same results in last 5
    if (!isSuccess && this.recentDecodeHistory.length >= 2) {
      const counts = new Map<string, number>();
      for (const result of this.recentDecodeHistory) {
        counts.set(result, (counts.get(result) || 0) + 1);
      }
      
      for (const [result, count] of counts) {
        if (count >= 2) {
          isSuccess = true;
          successText = result;
          break;
        }
      }
    }

    if (isSuccess && !this.showDecodePopup) {
      // Success! Stop camera and show popup
      this.finalDecodedText = successText;
      this.finalDecodedFormat = String(format);
      this.showDecodePopup = true;
      this.stopCamera();
      return;
    }

    this.decodedText = text;
    this.decodedFormat = String(format);
    this.decodedHistory = [{ text, format, time }, ...this.decodedHistory].slice(0, 5);
    this.lastDecodedAt = performance.now();
  }

  private drawDetections(ctx: CanvasRenderingContext2D, detections: Detection[]) {
    if (detections.length === 0) return;

    detections.forEach((detection, index) => {
      const [x, y, width, height] = detection.bbox;
      
      // Draw bounding box with thick green line
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);

      // Draw confidence label
      const label = `Barcode ${(detection.confidence * 100).toFixed(1)}%`;
      ctx.font = 'bold 18px Arial';
      
      // Draw label background
      const textMetrics = ctx.measureText(label);
      ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.fillRect(x, Math.max(0, y - 28), textMetrics.width + 12, 28);
      
      // Draw label text
      ctx.fillStyle = '#000000';
      ctx.fillText(label, x + 6, Math.max(20, y - 8));
      
      // Draw corner markers for better visibility
      const markerSize = 15;
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      
      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(x, y + markerSize);
      ctx.lineTo(x, y);
      ctx.lineTo(x + markerSize, y);
      ctx.stroke();
      
      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(x + width - markerSize, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + markerSize);
      ctx.stroke();
      
      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(x, y + height - markerSize);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x + markerSize, y + height);
      ctx.stroke();
      
      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(x + width - markerSize, y + height);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + width, y + height - markerSize);
      ctx.stroke();
    });
  }

  private updateStreamMessage() {
    const now = performance.now();
    const currentPriority = this.getMessagePriority(this.streamMessage);

    if (this.desiredStreamMessage === this.streamMessage) {
      this.streamMessageSince = 0;
      return;
    }

    if (this.desiredStreamPriority >= currentPriority) {
      this.streamMessage = this.desiredStreamMessage;
      this.streamMessageSince = 0;
      return;
    }

    if (this.streamMessageSince === 0) {
      this.streamMessageSince = now;
    }
    if (now - this.streamMessageSince >= this.streamMessageHoldMs) {
      this.streamMessage = this.desiredStreamMessage;
      this.streamMessageSince = 0;
    }
  }

  private getMessagePriority(message: string) {
    if (message.startsWith('Move closer')) return 1;
    if (message.startsWith('No barcode')) return 0;
    return 2;
  }

  private startFPSOnlyLoop() {
    const fpsFrame = () => {
      if (!this.isStreaming) return;

      // Update FPS (both render and camera)
      this.updateFPS();

      // Continue FPS-only loop
      this.animationFrameId = requestAnimationFrame(fpsFrame);
    };

    fpsFrame();
  }

  private updateFPS() {
    const now = performance.now();

    // Update render/detection FPS
    if (now - this.fpsUpdateTime >= 1000) {
      this.fps = Math.round(this.frameCount / ((now - this.fpsUpdateTime) / 1000));
      this.frameCount = 0;
      this.fpsUpdateTime = now;
    }

    // Update actual camera FPS
    this.updateCameraFPS();
  }

  private updateCameraFPS() {
    const video = this.videoElement.nativeElement;
    const now = performance.now();
    
    if (video.currentTime !== this.lastVideoTime) {
      this.videoFrameCount++;
      this.lastVideoTime = video.currentTime;
    }
    
    if (now - this.lastVideoFpsUpdate >= 1000) {
      this.actualCameraFps = Math.round(this.videoFrameCount / ((now - this.lastVideoFpsUpdate) / 1000));
      this.videoFrameCount = 0;
      this.lastVideoFpsUpdate = now;
    }
  }

  private detectionsChanged(): boolean {
    return this.overlayDirty;
  }

  private redrawDetectionOverlay(canvas: HTMLCanvasElement) {
    if (!this.overlayCanvas) return;
    
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.overlayCanvas, 0, 0);
    this.overlayDirty = false;
  }

  private cacheDetectionOverlay(canvas: HTMLCanvasElement, detections: Detection[]) {
    // Create or resize overlay canvas
    if (!this.overlayCanvas) {
      this.overlayCanvas = document.createElement('canvas');
    }
    this.overlayCanvas.width = canvas.width;
    this.overlayCanvas.height = canvas.height;
    
    const overlayCtx = this.overlayCanvas.getContext('2d')!;
    // Clear overlay
    overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    
    // Draw detections to overlay
    this.drawDetections(overlayCtx, detections);
    
    this.currentDetections = detections;
    this.overlayDirty = true;
  }

  toggleDetector() {
    // Reload model with new detector
    this.modelLoaded = false;
    this.loadModel();
  }

  toggleCamera() {
    if (this.isStreaming) {
      this.stopCamera();
    } else {
      this.startCamera();
    }
  }

  onDecodeDone() {
    this.showDecodePopup = false;
    this.finalDecodedText = '';
    this.finalDecodedFormat = '';
    this.recentDecodeHistory = []; // Reset history
    // Camera will restart automatically since we're not streaming anymore
    this.startCamera();
  }
}




