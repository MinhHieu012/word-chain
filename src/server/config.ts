const PORT = Number(process.env.PORT ?? 3000);

export const config = {
  port: PORT,
  host: process.env.HOST ?? '127.0.0.1',
  // Dev: Vite chạy ở 5173 và proxy /ws sang đây, nên origin 5173 cũng hợp lệ.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? `http://localhost:${PORT},http://127.0.0.1:${PORT},http://localhost:5173`).split(','),

  maxPlayers: 2,
  seatGraceMs: 60_000, // giữ chỗ cho người mất kết nối (phòng 2 người)
  emptyRoomMs: 5 * 60_000, // xóa phòng khi không ai kết nối
  idleRoomMs: 30 * 60_000, // xóa phòng khi không có sự kiện
  logLimit: 500, // số sự kiện tối đa mỗi ván
  heartbeatMs: 30_000,
  joinFailsPerMinute: 10,
  messagesPerSecond: 5,
  maxPayloadBytes: 4096,
  roomCodeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // bỏ 0/O, 1/I/L
  roomCodeLength: 6,
};
