# Angular Barcode Detector 🔍

Ứng dụng Angular 17 sử dụng ONNX Runtime để detect barcode real-time từ camera thiết bị.

## ✨ Tính năng

- ✅ Angular 17 với Standalone Components
- ✅ ONNX Runtime Web cho inference trên browser
- ✅ Real-time barcode detection với YOLOv8 tiny model
- ✅ Camera streaming từ điện thoại, máy tính bảng
- ✅ Visualization bounding boxes và confidence scores
- ✅ Hỗ trợ HTTPS cho mobile camera access
- ✅ Hiển thị FPS và số lượng detections
- ✅ Responsive design cho mọi thiết bị

## 📋 Yêu cầu

- Node.js 18+ và npm
- Angular CLI 17+
- Model ONNX: `yolotiny.onnx` (đã có trong workspace)
- OpenSSL hoặc mkcert (cho HTTPS)

## 🚀 Cài đặt

### 1. Cài đặt dependencies

```bash
cd angular-barcode-detector
npm install
```

### 2. Copy model ONNX

Model `yolotiny.onnx` sẽ được tự động copy vào `src/assets/models/` khi build.

Hoặc copy thủ công:
```bash
# Windows PowerShell
Copy-Item ..\yolotiny.onnx -Destination src\assets\models\
```

### 3. Setup HTTPS (Bắt buộc cho mobile camera)

#### Cách 1: Sử dụng mkcert (Khuyến nghị)

```bash
# Cài đặt mkcert
choco install mkcert

# Cài đặt local CA
mkcert -install

# Tạo certificates
cd ssl
mkcert -key-file localhost.key -cert-file localhost.crt localhost 127.0.0.1 ::1

# Nếu muốn test trên mobile, thêm IP của máy
mkcert -key-file localhost.key -cert-file localhost.crt localhost 192.168.1.x
```

#### Cách 2: Sử dụng OpenSSL

```bash
cd ssl
bash generate-cert.sh
```

#### Cách 3: PowerShell (Windows)

```powershell
cd ssl
.\generate-cert.ps1
# Sau đó convert PFX sang PEM format (xem hướng dẫn trong output)
```

Chi tiết hơn: Xem [ssl/README.md](ssl/README.md)

## 🎯 Chạy ứng dụng

### Development (HTTP - chỉ cho desktop)

```bash
npm start
```

Mở browser: `http://localhost:4200`

### Production-like với HTTPS (Cho mobile)

```bash
npm run start:https
```

Mở browser: `https://localhost:4200`

**Lưu ý:** Trình duyệt sẽ cảnh báo về self-signed certificate. Chọn "Advanced" → "Proceed to localhost".

### Truy cập từ mobile

1. Tìm IP của máy tính:
   ```bash
   ipconfig  # Windows
   ```

2. Trên mobile, mở browser và truy cập:
   ```
   https://192.168.x.x:4200
   ```

3. Trust certificate trên mobile (nếu dùng mkcert, cài đặt rootCA từ `mkcert -CAROOT`)

## 🏗️ Build Production

```bash
npm run build
```

Output sẽ ở thư mục `dist/angular-barcode-detector/`

## 📁 Cấu trúc dự án

```
angular-barcode-detector/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── barcode-detector.component.ts    # Main detector component
│   │   │   ├── barcode-detector.component.html
│   │   │   └── barcode-detector.component.scss
│   │   ├── services/
│   │   │   └── onnx-detector.service.ts         # ONNX model inference service
│   │   └── app.component.ts                     # Root component
│   ├── assets/
│   │   └── models/
│   │       └── yolotiny.onnx                    # YOLO model
│   ├── index.html
│   ├── main.ts
│   └── styles.scss
├── ssl/                                          # SSL certificates for HTTPS
│   ├── generate-cert.sh
│   ├── generate-cert.ps1
│   └── README.md
├── angular.json                                  # Angular configuration
├── package.json
└── README.md
```

## 🎨 Sử dụng

1. **Mở ứng dụng** trong browser (HTTPS nếu dùng mobile)
2. **Chờ model load** (hiển thị "✓ Model ready")
3. **Click "▶ Start Camera"** để bắt đầu
4. **Đưa camera vào barcode** để detect
5. Bounding boxes màu xanh sẽ hiển thị xung quanh barcodes được detect
6. Xem FPS và số lượng detections ở phía trên

## 🔧 Cấu hình

### Thay đổi model

Trong [onnx-detector.service.ts](src/app/services/onnx-detector.service.ts):

```typescript
private readonly inputSize = 640;  // Model input size
private readonly confThreshold = 0.25;  // Confidence threshold
private readonly iouThreshold = 0.45;   // NMS IoU threshold
```

### Camera settings

Trong [barcode-detector.component.ts](src/app/components/barcode-detector.component.ts):

```typescript
video: {
  facingMode: 'environment',  // 'user' cho front camera
  width: { ideal: 1280 },
  height: { ideal: 720 }
}
```

## 🐛 Troubleshooting

### Camera không hoạt động

- ✅ Kiểm tra HTTPS (bắt buộc cho mobile)
- ✅ Cấp quyền camera trong browser
- ✅ Kiểm tra camera không bị ứng dụng khác sử dụng

### Model không load

- ✅ Kiểm tra file `yolotiny.onnx` trong `src/assets/models/`
- ✅ Xem Console log để check lỗi
- ✅ Kiểm tra đường dẫn trong service

### HTTPS errors

- ✅ Tạo lại certificates: `mkcert -key-file localhost.key -cert-file localhost.crt localhost`
- ✅ Trust certificate trong browser
- ✅ Cài đặt rootCA trên mobile device

### Performance thấp

- ✅ Giảm resolution camera (width/height)
- ✅ Giảm confidence threshold
- ✅ Sử dụng model nhỏ hơn
- ✅ Test trên device mạnh hơn

## 🔍 Model Details

- **Model:** YOLOv8 Tiny (yolotiny.onnx)
- **Input:** 640x640 RGB image
- **Output:** Bounding boxes với confidence scores
- **Classes:** Barcode detection
- **Framework:** ONNX Runtime Web (WebAssembly backend)

## 📱 Mobile Testing Tips

1. Sử dụng back camera (`facingMode: 'environment'`)
2. Đảm bảo ánh sáng đủ
3. Giữ camera ổn định
4. Khoảng cách phù hợp (15-30cm)
5. Barcode phẳng và rõ ràng

## 🛠️ Tech Stack

- **Frontend:** Angular 17 (Standalone Components)
- **ML Runtime:** ONNX Runtime Web 1.17+
- **Model:** YOLOv8 Tiny
- **Language:** TypeScript 5.4+
- **Styling:** SCSS
- **Build Tool:** Angular CLI

## 📝 Notes

- Model inference chạy hoàn toàn trên browser (client-side)
- Không cần server backend cho detection
- Privacy-friendly: không gửi hình ảnh đi đâu
- Hoạt động offline sau khi model đã load

## 📄 License

MIT License - Free to use and modify

## 🤝 Contributing

Pull requests are welcome!

## 📧 Support

Nếu có vấn đề, hãy tạo issue trong repository.

---

**Happy Coding!** 🚀
