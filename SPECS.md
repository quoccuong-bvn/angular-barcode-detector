# Angular Barcode Detector - Specifications

## System Requirements

### Supported Browsers

**Desktop:**
- Google Chrome 90 or newer
- Microsoft Edge 90 or newer
- Mozilla Firefox 88 or newer
- Safari 14 or newer

**Mobile:**
- Chrome Mobile 90 or newer (Android)
- Safari 14 or newer (iOS)
- Samsung Internet 15 or newer

---

## Application Workflow

### Main Processing Thread

Handles user interface and coordinates all operations.

**Responsibilities:**
- Display camera video and detection overlays
- Manage UI interactions (buttons, popup)
- Send camera snapshots to workers every 0.5 seconds
- Track confirmation history (last 10 decode results)
- Show success popup when 2 matching results found

### Detection Worker

Runs AI model in background to find barcodes.

**Process:**
- Receives 160×160 pixel image from center area (60% × 50%)
- Runs YOLOv8 Tiny model via ONNX Runtime
- Returns barcode location and confidence (minimum 30%)
- Sends highest confidence detection back to main thread

### Decode Worker

Reads barcode content in background.

**Process:**
- Receives cropped barcode area with 15% padding
- Converts to grayscale
- Uses ZXing-WASM to extract text and format
- Returns decoded result to main thread

### Confirmation Logic

Ensures accuracy before showing results.

**Rules:**
- Tracks last 10 decode attempts
- Confirms when: 2 consecutive matches OR 2 same results in last 10
- Shows popup on confirmation
- Clears history after "Done" and restarts camera

### Communication Flow

```
Main Thread (UI)
    ↓ Every 0.5s: camera snapshot
Detection Worker → finds barcode location
    ↓ barcode coordinates
Main Thread → crops barcode area
    ↓ cropped image
Decode Worker → reads barcode text
    ↓ decoded result
Main Thread → adds to history → checks for 2 matches → show popup
```

---

## Technical Capabilities

### Detection Specifications

**AI Model:**
- Model: YOLOv8 Tiny
- Framework: ONNX Runtime Web
- Purpose: Real-time barcode detection

**Model Input:**
- Input Size: 160×160 pixels
- Format: RGB image (3 channels)
- Value Range: 0.0 to 1.0 (normalized)

**Processing:**
- Detection Speed: 2 times per second (every 500ms)
- Processing Area: Center region (60% width × 50% height)
- Confidence Threshold: 30% minimum

**Output:**
- Bounding boxes for detected barcodes
- Confidence score (0-100%)
- Location coordinates

### Barcode Decoder

**Library:**
- Decoder: ZXing-WASM (WebAssembly)
- Purpose: Reading barcode content from detected areas

**Supported Formats:**
- **2D Barcodes:** QR Code, Data Matrix, Aztec Code, PDF417
- **1D Barcodes:** EAN-8, EAN-13, UPC-A, UPC-E
- **Code Formats:** Code 39, Code 93, Code 128
- **Other:** ITF (Interleaved 2 of 5), Codabar, RSS-14 (GS1 DataBar)
- And more formats supported by ZXing library

**Processing:**
- Reads barcode text content
- Identifies barcode format type
- Works with grayscale images for optimal accuracy







