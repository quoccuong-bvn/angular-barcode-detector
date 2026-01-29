# Angular Barcode Detector - Technical Specifications

## Project Overview

**Project Name:** Angular Barcode Detector  
**Version:** 1.0.0  
**Description:** Angular 17 real-time barcode detection app using ONNX Runtime and a YOLOv8 Tiny model

## System Architecture

### Framework & Core Technologies

- **Frontend Framework:** Angular 17.3.0 (Standalone Components)
- **Language:** TypeScript 5.4.2
- **Build System:** Angular CLI with @angular-devkit/build-angular
- **Style Preprocessor:** SCSS
- **Module System:** ES2022

### Main Dependencies

```json
{
  "@angular/core": "^17.3.0",
  "@angular/common": "^17.3.0",
  "@angular/forms": "^17.3.0",
  "@zxing/browser": "^0.1.4",
  "onnxruntime-web": "^1.17.1",
  "rxjs": "~7.8.0"
}
```

## Directory Structure

```
angular-barcode-detector/
|-- src/
|   |-- app/
|   |   |-- app.component.ts              # Root component
|   |   |-- components/
|   |   |   |-- barcode-detector.component.ts    # Main detector component
|   |   |   |-- barcode-detector.component.html
|   |   |   |-- barcode-detector.component.scss
|   |   |   `-- onnx-test.component.ts           # ONNX testing component
|   |   `-- services/
|   |       |-- onnx-detector.service.ts         # ONNX Runtime service
|   |       `-- mock-detector.service.ts         # Mock detector for testing
|   `-- assets/
|       |-- models/                      # ONNX/ORT model files
|       `-- wasm/                        # ONNX Runtime WASM files
|-- index.html
|-- main.ts
|-- styles.scss
|-- ssl/                                 # SSL certificates for HTTPS
|-- angular.json                         # Angular configuration
|-- package.json
|-- tsconfig.json
`-- README.md
```

## Components

### 1. AppComponent (Root)

**File:** `src/app/app.component.ts`

**Responsibilities:**
- Root component of the application
- Uses the standalone component pattern (Angular 17)
- Imports and renders BarcodeDetectorComponent

**Template:**
```typescript
template: `
  <div class="app-container">
    <app-barcode-detector></app-barcode-detector>
  </div>
`
```

**Styles:**
- Background gradient: `linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)`
- Full viewport height: `min-height: 100vh`

---

### 2. BarcodeDetectorComponent

**File:** `src/app/components/barcode-detector.component.ts`

**Responsibilities:** Main component for real-time barcode detection

#### State Management

```typescript
// Camera & Streaming
isStreaming: boolean = false
stream: MediaStream | null = null
currentResolution: string = ''
actualCameraFps: number = 0

// Model
isModelLoading: boolean = false
modelLoaded: boolean = false
useMockDetector: boolean = false

// Detection
detectionCount: number = 0
currentDetections: Detection[]

// Decoding
decodedText: string = ''
decodedFormat: string = ''
decodedHistory: Array<{text, format, time}> = []

// Performance
fps: number = 0
frameCount: number = 0

// Configuration
preprocessEnabled: boolean = true
cameraResolution: string = 'fhd'
```

#### Camera Configuration

**Resolution Options:**
```typescript
cameraResolutionOptions = [
  { value: 'fhd', label: 'Full HD (1920x1080)' },
  { value: 'hd', label: 'HD (1280x720)' },
  { value: 'auto', label: 'Auto (device default)' }
]
```

**MediaStream Constraints (preferred):**
```typescript
{
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60, min: 30 }
  },
  audio: false
}
```

**iOS Compatibility:**
- `playsinline` attribute
- `webkit-playsinline` attribute
- `muted` property
- Auto-focus, exposure mode, and white balance (if supported)

#### Region of Interest (ROI)

**ROI Configuration (in code):**
```typescript
roi = {
  top: 0.25,      // 25% from top
  right: 0.2,     // 20% from right
  bottom: 0.25,   // 25% from bottom
  left: 0.2       // 20% from left
}
```

**Note:** ROI overlay in HTML is currently hardcoded via CSS variables (`style="--roi-..."`), not bound to the `roi` object.

#### Detection Pipeline

**1. Stream Rendering Loop:**
- Target FPS: 30 FPS
- Frame interval: ~33.33ms
- Uses `requestAnimationFrame` with throttling

**2. Detection Loop:**
- Interval: 300ms (~3.33 FPS)
- Detect only within ROI to improve performance
- **No overlap guard** (if inference takes >300ms, loops can overlap)
- Two-stage filtering:
  - Service: `confThreshold = 0.1`
  - Component: display `confidence >= 0.3`

**3. Barcode Decoding:**
- Uses ZXing (`@zxing/browser`)
- Preprocessing: scale 1.3x + contrast boost + threshold
- Cooldown: 0ms
- Stale time: 4000ms

**Detection Flow:**
```
Video Frame ? Canvas
    ?
Extract ROI ImageData
    ?
ONNX Detector Service
    ?
Filter by Confidence (>= 0.3 in component)
    ?
Select Top Detection
    ?
ZXing Decode
    ?
Display Result
```

#### Rendering System

**Canvas Layers:**
1. **Video Layer:** direct video feed rendering
2. **Detection Overlay:** cached canvas with bounding boxes
3. **ROI Overlay:** red border box
4. **Crosshair Overlay:** center positioning guide
5. **Text Overlays:** decoded text and status messages

**Overlay Caching (current code):**
- Detections rendered into `overlayCanvas`
- `detectionsChanged()` currently **always returns true**, so overlay is redrawn every frame

#### Performance Optimizations

**FPS Tracking:**
- **Render FPS:** measured from render loop
- **Camera FPS:** measured from actual video frame rate
- Update interval: 1000ms

**Optimization Techniques (applied):**
1. Frame throttling (30 FPS target)
2. Detection interval (300ms)
3. Overlay canvas caching (but still redraws every frame)
4. ROI-only detection

---

### 3. OnnxTestComponent

**File:** `src/app/components/onnx-test.component.ts`

**Responsibilities:** Test and verify ONNX Runtime functionality

**Tests:**
1. ONNX Runtime import verification
2. Environment check (WebAssembly, SharedArrayBuffer)
3. Inference session creation
4. Execution providers availability (webgl, wasm, cpu)

---

## Services

### 1. OnnxDetectorService

**File:** `src/app/services/onnx-detector.service.ts`

#### Configuration

```typescript
// Model parameters
inputSize: number = 224              // YOLOv8 Tiny input size
confThreshold: number = 0.1          // Confidence threshold
iouThreshold: number = 0.45          // IoU threshold for NMS

// Platform detection
isIOS: boolean = /iPad|iPhone|iPod/.test(navigator.userAgent)
```

#### ONNX Runtime Setup

**WASM Configuration:**
```typescript
ort.env.wasm.wasmPaths = new URL('assets/wasm/', baseUrl).toString()

// iOS: Single-threaded, no SIMD
if (isIOS) {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.simd = false
}

// Desktop/Mobile: dynamic thread count
else {
  ort.env.wasm.numThreads = getOptimalThreadCount()
  ort.env.wasm.simd = true
}
```

**Optimal Thread Count:**
- Mobile/Touch devices: min(2, hardwareConcurrency/2)
- Desktop: min(4, hardwareConcurrency/2)
- Fallback: 1 thread if SharedArrayBuffer unavailable

#### Model Loading Strategy

**Execution Providers Priority (non-iOS):**
1. WebGL (preferred)
2. WASM (fallback)
3. Default backend (last resort)

**iOS-Specific Loading:**
```typescript
// Strategy 1: Explicit WebGL
executionProviders: ['webgl']

// Strategy 2: WASM fallback
executionProviders: ['wasm']

// Strategy 3: Auto-select
graphOptimizationLevel: 'basic'
```

**Model Path Resolution (component tries multiple paths):**
```typescript
possiblePaths = [
  'assets/models/yolotiny.ort?v=2026-01-28-1',
  'assets/models/yolotiny.onnx?v=2026-01-28-1',
  'assets/yolotiny.ort?v=2026-01-28-1',
  'assets/yolotiny.onnx?v=2026-01-28-1',
  '/assets/models/yolotiny.ort?v=2026-01-28-1',
  '/assets/yolotiny.ort?v=2026-01-28-1'
]
```

#### Image Preprocessing

**Pipeline:**
```
Input ImageData
    ?
Letterbox Resize (preserve aspect ratio)
    ?
Scale to 224x224
    ?
Add padding (centered)
    ?
Convert to RGB CHW format
    ?
Normalize [0-255] ? [0-1]
    ?
Create Float32 Tensor [1, 3, 224, 224]
```

**Letterbox Parameters:**
```typescript
scale = min(inputSize/width, inputSize/height)
resizedWidth = round(width * scale)
resizedHeight = round(height * scale)
padX = round((inputSize - resizedWidth) / 2)
padY = round((inputSize - resizedHeight) / 2)
```

**Background Fill:** `rgb(114, 114, 114)`

#### Inference Process

**Input Tensor:**
```typescript
Shape: [1, 3, 224, 224]
Type: float32
Format: CHW (Channel-Height-Width)
Channels: RGB
Range: [0.0, 1.0]
```

**Output Processing:**

**YOLO Output Formats:**
- Format 1: `[1, features, predictions]`
- Format 2: `[1, predictions, features]`

**Feature Detection:**
```typescript
// Detect format
if (features <= 100 && predictions > 100) {
  featuresFirst = true
} else {
  featuresFirst = false
}
```

#### Post-processing

**Coordinate Conversion:**
```typescript
// Check if normalized (0-1) or pixel coordinates
if (x_center < 2 && y_center < 2 && w < 2 && h < 2) {
  x_pixel = x_center * inputSize
  y_pixel = y_center * inputSize
  w_pixel = w * inputSize
  h_pixel = h * inputSize
}

// Convert from letterbox to original coordinates
x = (x_pixel - w_pixel/2 - padX) / scale
y = (y_pixel - h_pixel/2 - padY) / scale
width = w_pixel / scale
height = h_pixel / scale

// Clamp to image bounds
x = clamp(0, originalWidth-1, x)
y = clamp(0, originalHeight-1, y)
width = clamp(0, originalWidth-x, width)
height = clamp(0, originalHeight-y, height)
```

**Non-Maximum Suppression (NMS):**
```typescript
Algorithm: Greedy NMS
1. Sort detections by confidence (descending)
2. Keep highest confidence detection
3. Remove overlapping boxes (IoU > threshold)
4. Repeat until no detections left

IoU Threshold: 0.45
```

---

### 2. MockDetectorService

**File:** `src/app/services/mock-detector.service.ts`

**Responsibilities:** Mock detector for testing without ONNX Runtime

**Features:**
- Simulated model loading (1500ms delay)
- Random detection generation (0-2 detections)
- Configurable confidence range: [0.7, 1.0]
- Random bounding box sizes

---

## UI/UX Design

### Color Scheme

**Primary Colors:**
- Background: `#1a1a1a` - `#2d2d2d` (gradient)
- Text: `#ffffff`, `#eaeaea`
- Success: `#4CAF50`
- Detection: `#00FF00` (green)
- ROI Border: `#ff0000` (red)
- Warning: `#FFA500`
- Error: `#FF5252`

### Typography

**Font Stack:**
```scss
font-family: -apple-system, BlinkMacSystemFont,
             "Segoe UI", Roboto, "Helvetica Neue",
             Arial, sans-serif
```

**Font Sizes:**
- Heading: 2rem (mobile: 1.5rem)
- Body: 1rem
- Stats Label: 0.9rem
- Stats Value: 1.5rem
- Decoded Text: 2.2rem (mobile: 0.9rem)

### Layout & Responsive Design

**Breakpoints:**
- Mobile: < 768px
- Tablet: 769px - 1024px
- Desktop: > 1024px

**Video Container:**
- Desktop: 16:9 aspect ratio (56.25% padding)
- Mobile: 4:3 aspect ratio (75% padding)
- Max width: 1280px
- Border radius: 8px

**Touch Optimizations:**
```scss
@media (hover: none) and (pointer: coarse) {
  button {
    min-height: 48px;  // WCAG touch target size
  }
}
```

### Visual Elements

**Detection Bounding Box:**
```scss
strokeStyle: '#00FF00'
lineWidth: 4px
+ Corner markers (15px)
+ Confidence label with background
```

**ROI Overlay:**
```scss
border: 1px solid #ff0000
position: CSS variables
  --roi-top: 25%
  --roi-right: 20%
  --roi-bottom: 25%
  --roi-left: 20%
```

**Crosshair:**
```scss
Size: 60px × 60px (mobile: 50px)
Lines: 2px white with shadow
Center dot: 8px circle with pulse animation
Animation: crosshair-pulse 2s infinite
```

**Status Overlays:**
- Decoded value: Top center, rgba(0,0,0,0.3) background
- Stream message: Below decoded value
- Semi-transparent backgrounds for readability

### Animations

**Pulse Animation:**
```scss
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

**Crosshair Pulse:**
```scss
@keyframes crosshair-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
```

---

## Build & Deployment

### Build Configurations

**Development:**
```json
{
  "optimization": false,
  "extractLicenses": false,
  "sourceMap": true
}
```

**Production:**
```json
{
  "baseHref": "/angular-barcode-detector/",
  "outputHashing": "all",
  "budgets": [
    {
      "type": "initial",
      "maximumWarning": "500kb",
      "maximumError": "5mb"
    },
    {
      "type": "anyComponentStyle",
      "maximumWarning": "4kb",
      "maximumError": "6kb"
    }
  ]
}
```

**Note:** Build `defaultConfiguration` is **production**.

### NPM Scripts

```json
{
  "start": "ng serve",
  "start:https": "ng serve --ssl --ssl-cert ssl/localhost.crt --ssl-key ssl/localhost.key --host 0.0.0.0",
  "build": "ng build",
  "watch": "ng build --watch --configuration development",
  "test": "ng test"
}
```

**Network Access:**
- `--host 0.0.0.0` enables access from network devices
- Server listens on all available network interfaces
- Accessible via localhost, 127.0.0.1, and local network IPs
- Common local IPs: 192.168.x.x (WiFi), 192.168.56.x (VirtualBox), 192.168.137.x (Mobile Hotspot)

### GitHub Pages Deployment

**Tool:** `angular-cli-ghpages`

**Command:**
```bash
ng build --configuration production
ng deploy
```

**Configuration:**
- Base href: `/angular-barcode-detector/`
- Output path: `dist/angular-barcode-detector`

---

## Security & HTTPS

### SSL Certificate Setup

**Tools:**
- mkcert (recommended)
- OpenSSL
- PowerShell (Windows)

**Certificate Files:**
- `ssl/localhost.crt` - Certificate
- `ssl/localhost.key` - Private key

**Certificate Details:**
- Valid period: ~3 years (e.g., until April 2028)
- Domains included: localhost, 127.0.0.1, ::1
- Network IP support: Can include local network IPs (e.g., 192.168.x.x)

**Installation (mkcert):**
```bash
# Install mkcert (Windows with Chocolatey)
choco install mkcert

# Install local CA
mkcert -install

# Generate certificates
cd ssl
mkcert -key-file localhost.key -cert-file localhost.crt localhost 127.0.0.1 ::1 192.168.10.32
```

**Requirements:**
- HTTPS required for camera access on mobile
- Self-signed certificates for development
- Must trust local CA for seamless experience
- Firewall must allow port 4200 for network access

---

## Performance Metrics

### Target Performance

**Frame Rates:**
- Render FPS: 30 FPS (throttled)
- Detection Rate: ~3.33 FPS (300ms interval)
- Camera FPS: 30-60 FPS (depends on device)

**Latency:**
- Detection latency: < 300ms
- Decoding latency: < 100ms
- Model inference: 50-150ms (depends on backend)

**Resource Usage:**
- Initial bundle size: < 500KB (warning threshold)
- Maximum bundle size: < 5MB
- Style bundle: < 6KB per component

### Optimization Strategies

1. **Frame Throttling:** Limit rendering to 30 FPS
2. **Detection Interval:** 300ms between detections
3. **ROI Processing:** Only process center region
4. **Cached Overlays:** Pre-render detection boxes
5. **Thread Optimization:** Dynamic thread count based on device

---

## Testing & Debugging

### Debug Mode

```typescript
debug: boolean = false

debugLog(...args: any[]) {
  if (this.debug) {
    console.log(...args);
  }
}
```

**Debug Information:**
- ONNX Runtime version
- Available backends
- Model input/output names
- Detection results (first 3)
- FPS metrics
- Letterbox parameters

### ONNX Test Component

**Tests:**
1. ONNX Runtime import
2. WebAssembly support
3. SharedArrayBuffer availability
4. Environment configuration
5. Execution provider availability

---

## Browser Compatibility

### Supported Browsers

**Desktop:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

**Mobile:**
- Chrome Mobile 90+
- Safari iOS 14+
- Samsung Internet 15+

### Required Features

- WebAssembly
- MediaDevices API
- Canvas API
- ES2022 support
- WebGL (for GPU acceleration)

### iOS Considerations

**Limitations:**
- No SharedArrayBuffer ? Single-threaded WASM
- No SIMD support
- WebGL may be disabled
- Requires explicit HTTPS

**Workarounds:**
- Force single-thread mode
- Disable SIMD
- Multiple loading strategies
- Fetch model as ArrayBuffer first

---

## Assets & Resources

### Model Files

**Location:** `src/assets/models/`

**Files currently present:**
- `yolotiny.ort` - Optimized ONNX Runtime format (in use)

**Note:** Code still tries `.onnx` via fallback paths, but the repo currently has no `.onnx` in `src/assets/models/`.

### WASM Files

**Location:** `src/assets/wasm/`

**Files currently present:**
- `ort-wasm.wasm`
- `ort-wasm-threaded.wasm`
- `ort-wasm-simd.wasm`
- `ort-wasm-simd-threaded.wasm`
- (additional `.jsep.wasm` variants)

**Note:** The folder currently **does not include** ONNX Runtime `.mjs` files.

---

## Data Flow

### Complete Pipeline

```
User Action: Start Camera
    ?
getUserMedia() ? MediaStream
    ?
Video Element ? srcObject
    ?
requestAnimationFrame Loop (30 FPS)
    +-- Draw video to canvas
    +-- Draw cached overlay
    +-- Update FPS
    ?
Interval Loop (300ms)
    +-- Extract ROI ImageData
    +-- ONNX Detection
    ¦   +-- Preprocess
    ¦   +-- Inference
    ¦   +-- Postprocess + NMS
    +-- Filter by confidence
    +-- Select top detection
    +-- ZXing decode
    +-- Update UI state
    ?
Display Results
    +-- Bounding boxes
    +-- Confidence scores
    +-- Decoded text
    +-- Status messages
```

---

## Error Handling

### Error Types

**Model Loading Errors:**
- Path not found
- Format unsupported
- Backend unavailable
- WebGL disabled (iOS)

**Camera Errors:**
- Permission denied
- Device not found
- Constraint not supported

**Detection Errors:**
- Model not loaded
- Invalid image data
- Inference failure

### Error Messages

```typescript
// iOS WebGL error
'iOS Safari: WebGL is required but not available. 
 Please check: 
 1. Safari Settings > Advanced > Enable WebGL
 2. Try updating iOS to the latest version
 3. Restart Safari browser'

// Backend error
'No compatible graphics backend found. 
 Your browser may not support WebGL or WebAssembly.'

// Generic model error
'Failed to load model: [error message]'

// Camera error
'Failed to access camera: [error message]'
```

---

## Key Technical Features

### 1. Standalone Components (Angular 17)

- No NgModule required
- Direct imports in component
- Simplified dependency management

### 2. ONNX Runtime Web Integration

- WebGL/WASM execution providers
- Dynamic backend selection
- iOS compatibility layer

### 3. Real-time Processing

- Throttled rendering (30 FPS)
- Interval-based detection (300ms)
- Async/await for non-blocking operations

### 4. Responsive Camera Handling

- Multiple resolution options
- Fallback constraints
- Device capability detection
- Auto-focus and exposure control

### 5. Performance Optimization

- Canvas overlay caching
- ROI-based processing
- Minimal re-renders (logic present, but currently always redraws)
- Efficient data structures

### 6. Cross-platform Support

- Desktop and mobile browsers
- iOS-specific optimizations
- Touch device optimizations
- Responsive breakpoints

---

## Configuration Summary

### TypeScript Configuration

```jsonc
{
  "target": "ES2022",
  "module": "ES2022",
  "strict": true,
  "experimentalDecorators": true,
  "skipLibCheck": true,
  "esModuleInterop": true
}
```

### Angular Compiler Options

```jsonc
{
  "enableI18nLegacyMessageIdFormat": false,
  "strictInjectionParameters": true,
  "strictInputAccessModifiers": true,
  "strictTemplates": true
}
```

### ONNX Runtime Environment

```typescript
ort.env.wasm.wasmPaths = 'assets/wasm/'
ort.env.wasm.numThreads = 1-4 (dynamic)
ort.env.wasm.simd = true/false (platform-dependent)
ort.env.wasm.proxy = false
```

---

## Customization Points

### Detection Parameters

```typescript
// Adjustable in OnnxDetectorService
inputSize: 224           // Model input size
confThreshold: 0.1       // Detection confidence
iouThreshold: 0.45       // NMS IoU threshold
```

### Camera Settings

```typescript
// Adjustable in BarcodeDetectorComponent
cameraResolution: 'fhd'  // 'fhd' | 'hd' | 'auto'
preprocessEnabled: true  // ZXing preprocessing
```

### ROI Configuration

```typescript
// Adjustable in BarcodeDetectorComponent
roi = {
  top: 0.25,     // 0-1 (percentage)
  right: 0.2,
  bottom: 0.25,
  left: 0.2
}
```

### Performance Tuning

```typescript
// Adjustable in BarcodeDetectorComponent
targetFPS: 30                  // Rendering FPS
// detectionInterval: 300       // Detection interval (ms) - hardcoded in setInterval
decodedStaleMs: 4000          // Decoded text timeout
streamMessageHoldMs: 1500     // Status message duration
```

---

## Dependency Version Matrix

| Package | Version | Purpose |
|---------|---------|---------|
| Angular Core | 17.3.0 | Framework |
| TypeScript | 5.4.2 | Language |
| ONNX Runtime Web | 1.17.1 | ML Inference |
| ZXing Browser | 0.1.4 | Barcode Decoding |
| RxJS | 7.8.0 | Reactive Programming |

---

## Architecture Patterns

### Design Patterns Used

1. **Service Layer Pattern** - Separation of business logic
2. **Observer Pattern** - RxJS for async operations (mostly app-level usage)
3. **Strategy Pattern** - Multiple detection backends
4. **Factory Pattern** - Dynamic provider selection
5. **Singleton Pattern** - Injectable services
6. **Component Pattern** - Standalone components

---

## Notes on Stream Messages

- `desiredStreamMessage` is set based on detection state.
- Priority is computed in `getMessagePriority()`; the message “Please place barcode inside the red box” does not match the “No barcode” branch, so it falls back to priority 2.
- If the previous behavior is intended, adjust either the message text or the priority logic.

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-29  
**Author:** AI Technical Writer  
**Status:** Updated to match current source
