# 🚀 Quick Start Guide

## ✅ Đã Setup Xong!

Project đã được setup hoàn chỉnh và sẵn sàng sử dụng:
- ✅ Dependencies đã cài đặt
- ✅ SSL certificates đã tạo (valid đến 27 April 2028)
- ✅ Model ONNX đã copy vào assets/models/
- ✅ Server đang chạy tại: **https://localhost:4200**

## 📱 Cách Sử dụng

### 1. Truy cập ứng dụng

**Desktop:**
- Mở browser: **https://localhost:4200**
- Accept self-signed certificate warning (Advanced → Proceed)

**Mobile/Tablet (cùng mạng WiFi):**
- Truy cập: **https://192.168.10.32:4200**
- Accept certificate warning
- Cấp quyền truy cập camera khi được hỏi

### 2. Sử dụng detector

1. Đợi thông báo "✓ Model ready" (khoảng 2-5 giây)
2. Click nút **"▶ Start Camera"**
3. Cấp quyền camera nếu được hỏi
4. Đưa camera vào barcode để detect
5. Bounding box màu xanh sẽ hiển thị xung quanh barcode
6. Xem FPS và số detections ở góc trên

### 3. Tips để detect tốt

- ✅ Ánh sáng đủ và đều
- ✅ Giữ camera ổn định
- ✅ Khoảng cách 15-30cm từ barcode
- ✅ Barcode phẳng và rõ ràng
- ✅ Tránh phản xạ ánh sáng trên barcode

## 🔧 Các Lệnh Hữu Ích

```bash
# Chạy với HTTPS (cho mobile)
npm run start:https

# Chạy thông thường (chỉ desktop)
npm start

# Build production
npm run build

# Dừng server
Ctrl + C trong terminal
```

## 🌐 Network URLs

Server đang lắng nghe trên các địa chỉ sau:
- Local: https://localhost:4200
- Network IPs:
  - https://192.168.10.32:4200 (Main IP)
  - https://192.168.56.1:4200
  - https://192.168.137.1:4200
  - Và các IP khác...

Chọn IP phù hợp với mạng của bạn để truy cập từ mobile.

## 📊 Performance Expected

- **Desktop (Chrome/Edge):** 15-30 FPS
- **Mobile (High-end):** 10-20 FPS  
- **Mobile (Mid-range):** 5-15 FPS

Model `yolotiny.onnx` đã được optimize cho inference nhanh trên browser.

## 🐛 Troubleshooting

### Camera không hoạt động
- Đảm bảo đang dùng HTTPS
- Cấp quyền camera trong browser settings
- Kiểm tra camera không bị app khác sử dụng

### Model không load
- Kiểm tra file exists: `src/assets/models/yolotiny.onnx`
- Xem console log trong browser DevTools (F12)
- Clear cache và refresh (Ctrl + Shift + R)

### Không connect được từ mobile
- Đảm bảo mobile và PC cùng mạng WiFi
- Check firewall không block port 4200
- Trust certificate trên mobile (Settings → Security)

### FPS thấp
- Giảm resolution trong code:
  ```typescript
  // barcode-detector.component.ts, line ~40
  video: {
    width: { ideal: 640 },  // Giảm từ 1280
    height: { ideal: 480 }  // Giảm từ 720
  }
  ```

## 📝 Thay Đổi Cấu Hình

### Threshold Detection
Edit file: `src/app/services/onnx-detector.service.ts`

```typescript
private readonly confThreshold = 0.25;  // Confidence threshold (0-1)
private readonly iouThreshold = 0.45;   // NMS IoU threshold
```

### Camera Settings  
Edit file: `src/app/components/barcode-detector.component.ts`

```typescript
facingMode: 'environment',  // 'user' for front camera
width: { ideal: 1280 },     // Resolution
height: { ideal: 720 }
```

## 🎯 Demo Features

✅ Real-time detection với WebGL acceleration
✅ Bounding box visualization với confidence score
✅ FPS counter và detection count
✅ Responsive design cho mọi màn hình
✅ Dark theme đẹp mắt

## 📞 Need Help?

Xem chi tiết trong [README.md](README.md) hoặc check console logs trong DevTools!

---

**Enjoy detecting! 🔍📦**
