// Giao thức WebSocket giữa client và server. Sửa ở đây thì cả hai phía cùng được kiểm tra kiểu.

export const WS_PATH = '/ws';

export const CloseCode = {
  LEAVE: 4000, // client chủ động rời phòng
  REPLACED: 4001, // phòng đã mở ở tab khác
  ROOM_GONE: 4002, // phòng bị đóng
} as const;

export const ERROR_MESSAGES = {
  ROOM_NOT_FOUND: 'Không tìm thấy phòng.',
  ROOM_FULL: 'Phòng đã đủ người.',
  INVALID_TOKEN: 'Không thể vào lại phòng.',
  INVALID_MESSAGE: 'Dữ liệu không hợp lệ.',
  NOT_IN_ROOM: 'Bạn chưa ở trong phòng.',
  RATE_LIMITED: 'Thao tác quá nhanh, hãy thử lại sau.',
  LOG_FULL: 'Ván đấu quá dài, phòng đã đóng.',
} as const;
export type ErrorCode = keyof typeof ERROR_MESSAGES;

// ---------- Sự kiện game: nằm trong payload, server không đọc ----------

export type GamePayload =
  | { event: 'GAME_STARTED'; players: [string, string]; dictVersion: string }
  | { event: 'WORD_SUBMITTED'; turn: number; word: string }
  | { event: 'TURN_TIMEOUT'; turn: number };

// ---------- Client → server ----------

export type ClientMessage = { requestId?: string } & (
  | { type: 'CREATE_ROOM'; private?: boolean }
  | { type: 'LIST_ROOMS' } // đăng ký nhận danh sách phòng chờ, server tự gửi lại khi danh sách đổi
  | { type: 'JOIN_ROOM'; roomId: string }
  | { type: 'REJOIN_ROOM'; roomId: string; rejoinToken: string }
  | { type: 'PLAYER_MESSAGE'; payload: GamePayload; newGame?: boolean }
);

// ---------- Server → client ----------

/** Sự kiện có seq, được ghi vào log của ván và phát cho cả phòng. */
export type RoomEvent = { type: 'EVENT'; seq: number } & (
  | { kind: 'MESSAGE'; from: string; payload: GamePayload }
  | { kind: 'PLAYER_JOINED' | 'PLAYER_DISCONNECTED' | 'PLAYER_REJOINED' | 'PLAYER_LEFT'; playerId: string }
);

export interface RoomSnapshot {
  type: 'ROOM_CREATED' | 'ROOM_JOINED';
  requestId?: string;
  roomId: string;
  playerId: string;
  rejoinToken: string;
  hostId: string;
  players: { playerId: string; connected: boolean }[];
  seq: number;
  log: RoomEvent[];
}

/** Phòng công khai đang chờ người vào. */
export interface OpenRoom {
  roomId: string;
  createdAt: number; // ms, giờ server
}

export type ServerMessage =
  | RoomSnapshot
  | RoomEvent
  | { type: 'HOST_CHANGED'; hostId: string }
  | { type: 'ROOM_LIST'; rooms: OpenRoom[] }
  | { type: 'ERROR'; requestId?: string; code: ErrorCode; message: string };
