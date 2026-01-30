/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web';
import 'onnxruntime-web/webgl';
import 'onnxruntime-web/wasm';

interface Detection {
  bbox: [number, number, number, number];
  confidence: number;
  class: number;
}

interface PreprocessResult {
  tensor: ort.Tensor;
  scale: number;
  padX: number;
  padY: number;
}

let session: ort.InferenceSession | null = null;
let inputSize = 160;
let confThreshold = 0.1;
let iouThreshold = 0.45;

const isIOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent);

function setWasmPaths() {
  const baseUrl = self.location.href;
  ort.env.wasm.wasmPaths = new URL('assets/wasm/', baseUrl).toString();
}

function hasWasmSharedMemorySupport() {
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const isIsolated = (self as any).crossOriginIsolated === true;
  return hasSharedArrayBuffer && isIsolated;
}

function getOptimalThreadCount(): number {
  const hardwareConcurrency = self.navigator.hardwareConcurrency || 4;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(self.navigator.userAgent);
  return isMobile ? Math.min(2, Math.max(1, Math.floor(hardwareConcurrency / 2))) : Math.min(4, Math.max(2, Math.floor(hardwareConcurrency / 2)));
}

function preprocessImage(imageData: ImageData): PreprocessResult {
  const { width, height } = imageData;
  const canvas = new OffscreenCanvas(inputSize, inputSize);
  const ctx = canvas.getContext('2d')!;

  const scale = Math.min(inputSize / width, inputSize / height);
  const resizedWidth = Math.round(width * scale);
  const resizedHeight = Math.round(height * scale);
  const padX = Math.round((inputSize - resizedWidth) / 2);
  const padY = Math.round((inputSize - resizedHeight) / 2);

  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, inputSize, inputSize);

  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tempCanvas, padX, padY, resizedWidth, resizedHeight);
  const resizedData = ctx.getImageData(0, 0, inputSize, inputSize);

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
    tensor: new ort.Tensor('float32', transposed, [1, 3, inputSize, inputSize]),
    scale,
    padX,
    padY
  };
}

function postprocess(output: ort.Tensor, originalWidth: number, originalHeight: number, preprocess: PreprocessResult): Detection[] {
  const detections: Detection[] = [];
  const outputData = output.data as Float32Array;
  const dimensions = output.dims;

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
      numFeatures = d1;
      numPredictions = d2;
      featuresFirst = true;
    } else if (d2LooksFeatures) {
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
    return detections;
  }

  const { scale, padX, padY } = preprocess;

  const getValue = (featureIndex: number, predictionIndex: number): number => {
    if (featuresFirst) {
      return outputData[featureIndex * numPredictions + predictionIndex];
    }
    return outputData[predictionIndex * numFeatures + featureIndex];
  };

  for (let i = 0; i < numPredictions; i++) {
    let x_center = getValue(0, i);
    let y_center = getValue(1, i);
    let w = getValue(2, i);
    let h = getValue(3, i);

    let objectness = 1;
    let classStartIndex = 4;
    if (hasObjectness) {
      objectness = getValue(4, i);
      classStartIndex = 5;
    }

    let confidence = 0;
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

    if (confidence > confThreshold) {
      let x_pixel = x_center;
      let y_pixel = y_center;
      let w_pixel = w;
      let h_pixel = h;

      if (x_center < 2 && y_center < 2 && w < 2 && h < 2) {
        x_pixel = x_center * inputSize;
        y_pixel = y_center * inputSize;
        w_pixel = w * inputSize;
        h_pixel = h * inputSize;
      }

      const x = (x_pixel - w_pixel / 2 - padX) / scale;
      const y = (y_pixel - h_pixel / 2 - padY) / scale;
      const width = w_pixel / scale;
      const height = h_pixel / scale;

      const clampedX = Math.max(0, Math.min(originalWidth - 1, x));
      const clampedY = Math.max(0, Math.min(originalHeight - 1, y));
      const clampedW = Math.max(0, Math.min(originalWidth - clampedX, width));
      const clampedH = Math.max(0, Math.min(originalHeight - clampedY, height));

      detections.push({
        bbox: [clampedX, clampedY, clampedW, clampedH],
        confidence,
        class: 0
      });
    }
  }

  return nonMaxSuppression(detections);
}

function nonMaxSuppression(detections: Detection[]): Detection[] {
  if (detections.length === 0) return [];
  detections.sort((a, b) => b.confidence - a.confidence);
  const keep: Detection[] = [];
  while (detections.length > 0) {
    const current = detections.shift()!;
    keep.push(current);
    detections = detections.filter(det => calculateIoU(current.bbox, det.bbox) < iouThreshold);
  }
  return keep;
}

function calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
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

async function loadModel(modelUrl: string) {
  setWasmPaths();
  const hasSharedMemory = hasWasmSharedMemorySupport();
  if (isIOS) {
    if (hasSharedMemory) {
      ort.env.wasm.numThreads = getOptimalThreadCount();
    } else {
      ort.env.wasm.numThreads = 1;
    }
    ort.env.wasm.simd = false;
  } else {
    ort.env.wasm.numThreads = getOptimalThreadCount();
    ort.env.wasm.simd = true;
  }

  const preferredProviders: ('wasm' | 'webgl')[] = isIOS && hasSharedMemory ? ['wasm', 'webgl'] : ['webgl', 'wasm'];

  for (const provider of preferredProviders) {
    try {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: [provider],
        graphOptimizationLevel: 'all'
      });
      return;
    } catch {
      // try next
    }
  }
  session = await ort.InferenceSession.create(modelUrl, { graphOptimizationLevel: 'basic' });
}

addEventListener('message', async (event) => {
  const { type, payload } = event.data || {};
  if (type === 'config') {
    inputSize = payload?.inputSize ?? inputSize;
    confThreshold = payload?.confThreshold ?? confThreshold;
    iouThreshold = payload?.iouThreshold ?? iouThreshold;
    return;
  }
  if (type === 'load') {
    try {
      await loadModel(payload.modelUrl);
      postMessage({ type: 'ready' });
    } catch (error) {
      postMessage({ type: 'error', error: String(error) });
    }
    return;
  }
  if (type === 'detect') {
    const { id, width, height, buffer } = payload;
    if (!session) {
      postMessage({ type: 'error', error: 'Model not loaded' });
      return;
    }
    try {
      const data = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(data, width, height);
      const preprocessed = preprocessImage(imageData);
      const feeds: Record<string, ort.Tensor> = {};
      feeds[session.inputNames[0]] = preprocessed.tensor;
      const outputData = await session.run(feeds);
      const output = outputData[session.outputNames[0]];
      const detections = postprocess(output, width, height, preprocessed);
      postMessage({ type: 'result', id, detections });
    } catch (error) {
      postMessage({ type: 'error', id, error: String(error) });
    }
  }
});
