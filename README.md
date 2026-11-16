# TradeUp — web prototype

Bản thử giao diện, chạy được ngay, không cần build và chưa gọi backend. Mọi giá, ưu đãi, lãi suất, đại lý đều là **số minh họa**.

## Chạy

Cách 1: mở thẳng `web/index.html` bằng trình duyệt.

Cách 2 (nên dùng, giống môi trường thật hơn):

```bash
python -m http.server 5173 --directory web
```

Rồi mở http://localhost:5173

## Các trang

| Trang | Vai trò | Màn hình (theo `docs/ui-flow.md`) |
|---|---|---|
| `index.html` | Khách | S1 trang chủ + ước tính nhanh |
| `flow.html` | Khách | S2 khai xe · S3 đang xử lý · S4 kết quả · S5 lỗi · S6 ảnh · S7 đặt lịch + xác nhận · S8 theo dõi |
| `dealer.html` | Thẩm định viên | A1 danh sách · A2 chi tiết + nhập giá · A3 xác nhận chốt |

Nút **Sơ đồ màn hình** (góc dưới trái, trang nào cũng có) nhảy tới bất kỳ màn hình nào, điền xe mẫu, bật giả lập lỗi hệ thống và xóa dữ liệu thử.

## Thử luồng đầy đủ

1. `index.html` → bấm **Tính khoản tiền dự kiến** → **Xem chi tiết & đặt lịch**.
2. Ở kết quả: đổi mẫu VinFast, kéo trả trước, bấm vào từng con số để xem nguồn, **Thêm ảnh**, **Hỏi về kết quả này**.
3. **Đặt lịch thẩm định** → xác nhận gửi → trang theo dõi hồ sơ.
4. Mở `dealer.html` → mở hồ sơ vừa tạo → nhập giá → **Chốt giá** → xác nhận.
5. Quay lại trang theo dõi: thấy giá chính thức.

Ca để thử trạng thái lỗi:

- Hỏi lại khi mâu thuẫn: xe 2023, nhập 400.000 km.
- Chưa đủ dữ liệu (S5): chọn "Hãng khác" hoặc xe trước 2013.
- Lỗi hệ thống (S5): bật "Giả lập lỗi hệ thống" trong Sơ đồ màn hình.
- Ảnh chưa rõ (S6): bấm "Dùng ảnh mẫu".
- Giá chốt ngoài khoảng (A2): nhập giá thấp hơn baseline, hệ thống bắt chọn lý do.

## Cấu trúc

```
web/
  index.html  flow.html  dealer.html
  assets/css/base.css   # token màu, nút, thanh khoảng giá, trang chủ
  assets/css/app.css    # luồng khách + bàn thẩm định viên
  assets/js/data.js     # dữ liệu mẫu + engine tính tiền (thay bằng API khi có)
  assets/js/store.js    # trạng thái lưu ở localStorage, dùng chung giữa 2 vai trò
  assets/js/ui.js       # icon, thanh khoảng giá, sơ đồ màn hình
  assets/js/landing.js  flow.js  dealer.js
  assets/img/           # ảnh tách từ docs/tradeup-landing-page.html (độ phân giải thấp)
```

## Khi nối backend

- Thay `TU.estimate`, `TU.topUp`, `TU.monthly` trong `data.js` bằng lời gọi `/api/v1/...`. Tiền luôn do engine phía server tính, giao diện chỉ hiển thị.
- Thay `store.js` (localStorage) bằng API hồ sơ. Chữ "chính thức" chỉ hiện khi backend trả bản ghi chốt.
- Ảnh trong `assets/img/` là ảnh concept độ phân giải thấp, cần thay ảnh thật trước khi demo.
