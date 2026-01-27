# 🐛 Debug Guide - Barcode Detection

## ✅ Các Cải Tiến Đã Thêm

### 1. **Giảm Confidence Threshold**
```typescript
confThreshold = 0.1 // Giảm từ 0.25 → dễ detect hơn
```

### 2. **Debug Logging Chi Tiết**
Console sẽ hiển thị:
- 🔍 ONNX Output dimensions
- 🔍 Output data length
- 🔍 First 20 values
- 🔍 Processing info (predictions, classes, scale)
- 🎯 Detections tìm được (top 5)
- ✅ Số candidate detections
- 🎯 Số detections sau NMS

### 3. **Enhanced Bounding Box Drawing**
- ✅ Clear canvas trước khi vẽ
- ✅ Thick green lines (4px)
- ✅ Corner markers rõ ràng
- ✅ Label với background đậm hơn
- ✅ Logging mỗi box được vẽ

### 4. **UI Improvements**
- ✅ Detection count highlight khi > 0
- ✅ Pulse animation cho detections
- ✅ Hiển thị mode (ONNX/Mock)

---

## 🔍 Cách Debug

### **Bước 1: Mở Developer Console**
```
F12 → Console tab
```

### **Bước 2: Start Camera**
Click "▶ Start Camera"

### **Bước 3: Xem Console Logs**

#### **A. Model Loading:**
```
Loading ONNX model from: /assets/models/yolotiny.onnx
ONNX Runtime configured with WASM path: /assets/wasm/
Successfully loaded model with webgl provider
```

#### **B. Detection Loop:**
```
🔍 ONNX Output dimensions: [1, 5, 8400]
🔍 Output data length: 42000
🔍 First 20 values: [...]
🔍 Processing predictions: 8400 classes: 1
🔍 Scale factors: 2.0 1.5
🔍 Confidence threshold: 0.1
```

#### **C. Detections Found:**
```
🎯 Detection 1: { confidence: "0.856", bbox: ["120.5", "85.3", "200.0", "50.0"] }
🎯 Detection 2: { confidence: "0.723", bbox: ["350.2", "120.8", "180.5", "45.2"] }
✅ Found 5 candidate detections (threshold: 0.1)
🎯 After NMS: 2 final detections
🎨 Drawing 2 detections
Drawing box 1: { x: "120.5", y: "85.3", width: "200.0", height: "50.0" }
Drawing box 2: { x: "350.2", y: "120.8", width: "180.5", height: "45.2" }
📊 Frame detection: 2 barcodes
```

---

## ❓ Troubleshooting

### **Problem 1: Detections = 0**

#### Kiểm tra Console:
```
✅ Found 0 candidate detections (threshold: 0.1)
```

**Nguyên nhân có thể:**
1. Model output format không đúng
2. Barcode quá nhỏ/mờ
3. Ánh sáng không đủ
4. Model chưa được train cho loại barcode này

#### Giải pháp:
```typescript
// Try Mock Detector to test UI
Check box: "Use Mock Detector"
→ Should see fake detections immediately
```

### **Problem 2: Output dimensions khác**

#### Nếu thấy:
```
🔍 ONNX Output dimensions: [1, 84, 8400]
```

Có thể cần adjust parser:
- YOLOv8 standard: [1, 84, 8400] (80 classes + 4 coords)
- YOLOv8 tiny custom: [1, 5, 8400] (1 class + 4 coords)

### **Problem 3: Bounding boxes vẽ sai vị trí**

#### Check scale factors:
```
🔍 Scale factors: 2.0 1.5
```

Nếu boxes ở vị trí lạ:
- Video resolution khác input size (640x640)
- Scaling calculation có issue

### **Problem 4: Too many false positives**

#### Tăng threshold:
```typescript
confThreshold = 0.25 // or higher
```

---

## 🧪 Testing Steps

### **Test 1: Mock Detector**
```
1. Check "Use Mock Detector"
2. Start camera
3. Should see 0-2 random boxes per frame
4. Confirms UI & drawing works
```

### **Test 2: ONNX with Debug**
```
1. Uncheck "Use Mock Detector"
2. Open Console (F12)
3. Start camera
4. Point at barcode
5. Watch console logs
6. Analyze output
```

### **Test 3: Different Barcodes**
```
Try different types:
- QR Code
- Code 128
- EAN-13
- UPC-A
- Data Matrix
```

### **Test 4: Different Conditions**
```
- Distance: 15-30cm
- Lighting: Bright, even
- Angle: Straight on
- Background: Plain
```

---

## 📊 Expected Console Output

### **Good Detection:**
```
🔍 ONNX Output dimensions: [1, 5, 8400]
🔍 Processing predictions: 8400 classes: 1
🎯 Detection 1: { confidence: "0.856", bbox: [...] }
✅ Found 3 candidate detections (threshold: 0.1)
🎯 After NMS: 1 final detections
🎨 Drawing 1 detections
📊 Frame detection: 1 barcodes
```

### **No Detection:**
```
🔍 ONNX Output dimensions: [1, 5, 8400]
🔍 Processing predictions: 8400 classes: 1
✅ Found 0 candidate detections (threshold: 0.1)
🎯 After NMS: 0 final detections
```

---

## 🎯 What to Check

### **1. Console Logs:**
- ✅ Model loads successfully
- ✅ Output dimensions make sense
- ✅ Detections are found
- ✅ Bounding boxes are drawn

### **2. UI:**
- ✅ Detection count updates
- ✅ Highlight animation when > 0
- ✅ FPS shows reasonable value (10-30)
- ✅ Mode shows "ONNX"

### **3. Video Feed:**
- ✅ Green bounding boxes visible
- ✅ Corner markers clear
- ✅ Confidence labels readable
- ✅ Boxes track barcode movement

---

## 🚀 Quick Fixes

### **Fix 1: Lower Threshold More**
```typescript
// In onnx-detector.service.ts
confThreshold = 0.05 // Very sensitive
```

### **Fix 2: Disable NMS Temporarily**
```typescript
// In onnx-detector.service.ts, postprocess method
return detections; // Skip NMS
// return this.nonMaxSuppression(detections);
```

### **Fix 3: Test with Mock First**
```
Always test Mock Detector first to verify:
- UI works
- Canvas drawing works
- Camera streaming works
Then switch to ONNX
```

---

## 📝 Report Format

When reporting issues, include:

```
1. Console logs (copy full detection cycle)
2. Screenshot of video + boxes (if any)
3. Detection count shown
4. FPS value
5. Browser (Chrome/Edge/Firefox)
6. Device (Desktop/Mobile)
7. Barcode type being tested
```

---

**Debug server running at:** `https://localhost:4200`  
**Press F12 → Console to see debug output!** 🔍
