# Nối Từ

Game nối từ tiếng Việt, đấu 1-1 theo thời gian thực. Tạo phòng, gửi mã 6 ký tự cho bạn, mỗi lượt 20 giây.

## Chạy

Cần Node.js ≥ 22.18 (chạy thẳng file `.ts`, không cần build server).

```bash
npm install

# Dev: 2 terminal
npm run dev:server   # WebSocket server, cổng 3000, tự restart khi sửa
npm run dev          # Vite, http://localhost:5173 (proxy /ws → 3000)

# Production
npm run build        # kiểm tra kiểu + build client vào dist/
npm start            # phục vụ dist/ và /ws, cổng 3000

npm test             # test luật chơi, chuẩn hoá từ, reducer phía client
npm run typecheck
```

Biến môi trường của server: `PORT` (mặc định 3000), `HOST` (mặc định `127.0.0.1`; đặt `0.0.0.0` khi deploy hoặc test qua LAN), `ALLOWED_ORIGINS` (danh sách origin được mở WebSocket, cách nhau bởi dấu phẩy, ví dụ `https://noitu.example.com`).

## Cấu trúc

```text
src/
├── shared/            # dùng chung client + server + test
│   ├── protocol.ts    # kiểu message WebSocket, mã lỗi, close code
│   ├── game.ts        # luật chơi: applyEvent(state, event) — hàm thuần
│   └── normalize.ts   # chuẩn hoá từ: NFC, vị trí dấu, i/y
├── server/
│   ├── index.ts       # HTTP (file tĩnh dist/) + WebSocket + heartbeat
│   ├── rooms.ts       # phòng: tạo/vào/vào lại, seq + log, giữ chỗ, đổi host
│   ├── rateLimit.ts
│   └── config.ts      # mọi hằng số và biến môi trường
└── client/            # React
    ├── App.tsx        # chọn màn hình; game state suy ra từ log sự kiện
    ├── state/roomReducer.ts   # trạng thái phòng (hàm thuần, có test)
    ├── hooks/         # useRoom (kết nối + tự kết nối lại), useDictionary, useTurnTimer
    ├── screens/       # Home, Lobby, Game
    ├── components/    # WordChain, WordInput, TurnTimer, ResultCard, ...
    ├── lib/session.ts
    └── styles/global.css      # token màu + thành phần chung; style riêng dùng *.module.css
public/                # từ điển dict-v1.txt, favicon
scripts/build-dict.ts  # tạo từ điển từ dữ liệu kaikki.org
test/
```

**Nguyên tắc:** server chỉ đánh số (`seq`), lưu log và phát lại sự kiện cho cả phòng; mọi luật chơi chạy ở client trong `src/shared/game.ts`. Hai client nhận cùng log nên luôn ra cùng kết quả.

## Từ điển

`public/dict-v1.txt`: 17.525 cụm 2 tiếng, lọc từ Wiktionary tiếng Việt qua [kaikki.org](https://kaikki.org/dictionary/Vietnamese/), giấy phép **CC BY-SA 4.0**. Tạo lại bằng `npm run build-dict` (tải ~83 MB vào `data/`); nếu dữ liệu đổi thì tăng `DICT_VERSION` trong `src/shared/game.ts`.
