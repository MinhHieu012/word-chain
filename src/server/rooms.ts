// Quản lý phòng: tạo/vào/vào lại, phát sự kiện có seq, giữ chỗ, đổi host, dọn phòng.
// Server không hiểu luật chơi: payload được chuyển nguyên vẹn.
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocket } from 'ws';
import { CloseCode, ERROR_MESSAGES } from '../shared/protocol.ts';
import type { ClientMessage, ErrorCode, RoomEvent, RoomSnapshot, ServerMessage } from '../shared/protocol.ts';
import { config } from './config.ts';
import { isJoinLimited, MessageRate, recordJoinFail } from './rateLimit.ts';

/** Một kết nối WebSocket và trạng thái đi kèm. */
export interface Client {
  ws: WebSocket;
  ip: string;
  alive: boolean;
  rate: MessageRate;
  seat: { room: Room; player: Player } | null;
}

interface Player {
  id: string;
  token: string;
  client: Client | null;
  connected: boolean;
  graceTimer: NodeJS.Timeout | null;
}

interface Room {
  id: string;
  players: Map<string, Player>;
  hostId: string;
  log: RoomEvent[];
  seq: number;
  lastActivity: number;
  emptySince: number | null;
  createdAt: number;
  private: boolean; // không hiện trong danh sách, chỉ vào bằng mã
}

type EventBody = RoomEvent extends infer E ? (E extends RoomEvent ? Omit<E, 'type' | 'seq'> : never) : never;

const rooms = new Map<string, Room>();
const listListeners = new Set<Client>(); // client ở trang chủ, chưa vào phòng
let lastList = '';

export const send = (client: Client | null, msg: ServerMessage) => {
  if (client?.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(msg));
};

const fail = (client: Client | null, code: ErrorCode, requestId?: string) =>
  send(client, { type: 'ERROR', requestId, code, message: ERROR_MESSAGES[code] });

function newRoomId(): string {
  const { roomCodeAlphabet: abc, roomCodeLength } = config;
  let id: string;
  do id = Array.from({ length: roomCodeLength }, () => abc[randomInt(abc.length)]).join('');
  while (rooms.has(id));
  return id;
}

function emit(room: Room, body: EventBody): void {
  const e = { type: 'EVENT', seq: ++room.seq, ...body } as RoomEvent;
  room.log.push(e);
  room.lastActivity = Date.now();
  for (const p of room.players.values()) send(p.client, e);
}

function snapshot(room: Room, player: Player, requestId: string | undefined, type: RoomSnapshot['type']): RoomSnapshot {
  return {
    type,
    requestId,
    roomId: room.id,
    playerId: player.id,
    rejoinToken: player.token,
    hostId: room.hostId,
    players: [...room.players.values()].map((p) => ({ playerId: p.id, connected: p.connected })),
    seq: room.seq,
    log: room.log,
  };
}

const anyConnected = (room: Room) => [...room.players.values()].some((p) => p.connected);

// Phòng đang chờ: công khai, chủ phòng còn kết nối và còn chỗ. Mới nhất lên đầu.
function roomList(): ServerMessage {
  const open = [...rooms.values()].filter((r) => !r.private && r.players.size < config.maxPlayers && anyConnected(r));
  const list = open.reverse().slice(0, config.roomListLimit);
  return { type: 'ROOM_LIST', rooms: list.map((r) => ({ roomId: r.id, createdAt: r.createdAt })) };
}

// Gọi sau mọi thay đổi có thể làm đổi danh sách; chỉ gửi khi danh sách thật sự khác.
function notifyList(): void {
  const msg = roomList();
  const json = JSON.stringify(msg);
  if (json === lastList) return;
  lastList = json;
  for (const c of listListeners) send(c, msg);
}

// Host phải là người đang kết nối nếu còn ai đó kết nối.
function ensureHost(room: Room): void {
  if (room.players.get(room.hostId)?.connected) return;
  const players = [...room.players.values()];
  const next = players.find((p) => p.connected) ?? players[0];
  if (!next || next.id === room.hostId) return;
  room.hostId = next.id;
  for (const p of players) send(p.client, { type: 'HOST_CHANGED', hostId: next.id });
}

// Chỉ giữ chỗ có thời hạn khi phòng đủ người; phòng 1 người thì để người đó quay lại.
function scheduleSeatGrace(room: Room): void {
  if (room.players.size < config.maxPlayers) return;
  for (const p of room.players.values()) {
    if (!p.connected && !p.graceTimer) p.graceTimer = setTimeout(() => removePlayer(room, p), config.seatGraceMs);
  }
}

function seat(room: Room, player: Player, client: Client): void {
  clearTimeout(player.graceTimer ?? undefined);
  Object.assign(player, { client, connected: true, graceTimer: null });
  client.seat = { room, player };
  room.emptySince = null;
  listListeners.delete(client);
  notifyList();
}

function addPlayer(room: Room, client: Client): Player {
  const player: Player = {
    id: `p-${randomBytes(4).toString('hex')}`,
    token: randomBytes(16).toString('hex'),
    client: null,
    connected: false,
    graceTimer: null,
  };
  room.players.set(player.id, player);
  seat(room, player, client);
  return player;
}

function removePlayer(room: Room, player: Player): void {
  clearTimeout(player.graceTimer ?? undefined);
  if (!room.players.delete(player.id)) return;
  if (player.client) player.client.seat = null;
  emit(room, { kind: 'PLAYER_LEFT', playerId: player.id });
  if (room.players.size === 0) return deleteRoom(room);
  ensureHost(room);
  notifyList();
}

function deleteRoom(room: Room): void {
  rooms.delete(room.id);
  for (const p of room.players.values()) {
    clearTimeout(p.graceTimer ?? undefined);
    if (p.client) {
      p.client.seat = null;
      p.client.ws.close(CloseCode.ROOM_GONE, 'room closed');
    }
  }
  notifyList();
}

function disconnect(room: Room, player: Player): void {
  player.connected = false;
  player.client = null;
  emit(room, { kind: 'PLAYER_DISCONNECTED', playerId: player.id });
  ensureHost(room);
  scheduleSeatGrace(room);
  if (!anyConnected(room)) room.emptySince = Date.now();
  notifyList();
}

const findRoom = (roomId: unknown) => rooms.get(String(roomId ?? '').toUpperCase());

// ---------- Handlers ----------

type Handlers = { [T in ClientMessage['type']]: (client: Client, msg: Extract<ClientMessage, { type: T }>) => void };

const handlers: Handlers = {
  CREATE_ROOM(client, msg) {
    if (client.seat) return fail(client, 'INVALID_MESSAGE', msg.requestId);
    const room: Room = {
      id: newRoomId(), players: new Map(), hostId: '', log: [], seq: 0, lastActivity: Date.now(), emptySince: null,
      createdAt: Date.now(), private: msg.private === true,
    };
    rooms.set(room.id, room);
    const player = addPlayer(room, client);
    room.hostId = player.id;
    send(client, snapshot(room, player, msg.requestId, 'ROOM_CREATED'));
    emit(room, { kind: 'PLAYER_JOINED', playerId: player.id });
  },

  LIST_ROOMS(client) {
    if (client.seat) return;
    if (client.rate.exceeded()) return fail(client, 'RATE_LIMITED');
    listListeners.add(client);
    send(client, roomList());
  },

  JOIN_ROOM(client, msg) {
    if (client.seat) return fail(client, 'INVALID_MESSAGE', msg.requestId);
    if (isJoinLimited(client.ip)) return fail(client, 'RATE_LIMITED', msg.requestId);
    const room = findRoom(msg.roomId);
    if (!room) {
      recordJoinFail(client.ip);
      return fail(client, 'ROOM_NOT_FOUND', msg.requestId);
    }
    if (room.players.size >= config.maxPlayers) return fail(client, 'ROOM_FULL', msg.requestId);
    const player = addPlayer(room, client);
    send(client, snapshot(room, player, msg.requestId, 'ROOM_JOINED'));
    emit(room, { kind: 'PLAYER_JOINED', playerId: player.id });
    ensureHost(room);
    scheduleSeatGrace(room);
  },

  REJOIN_ROOM(client, msg) {
    if (client.seat) return fail(client, 'INVALID_MESSAGE', msg.requestId);
    if (isJoinLimited(client.ip)) return fail(client, 'RATE_LIMITED', msg.requestId);
    const room = findRoom(msg.roomId);
    const player = room && [...room.players.values()].find((p) => p.token === msg.rejoinToken);
    if (!room || !player) {
      recordJoinFail(client.ip);
      return fail(client, room ? 'INVALID_TOKEN' : 'ROOM_NOT_FOUND', msg.requestId);
    }
    if (player.client) {
      player.client.seat = null;
      player.client.ws.close(CloseCode.REPLACED, 'replaced');
    }
    const wasOffline = !player.connected;
    seat(room, player, client);
    send(client, snapshot(room, player, msg.requestId, 'ROOM_JOINED'));
    if (wasOffline) emit(room, { kind: 'PLAYER_REJOINED', playerId: player.id });
    ensureHost(room);
  },

  PLAYER_MESSAGE(client, msg) {
    if (!client.seat) return fail(client, 'NOT_IN_ROOM');
    if (client.rate.exceeded()) return fail(client, 'RATE_LIMITED');
    if (typeof msg.payload !== 'object' || msg.payload === null) return fail(client, 'INVALID_MESSAGE');
    const { room, player } = client.seat;
    if (msg.newGame === true) room.log = [];
    if (room.log.length >= config.logLimit) {
      for (const p of room.players.values()) fail(p.client, 'LOG_FULL');
      return deleteRoom(room);
    }
    emit(room, { kind: 'MESSAGE', from: player.id, payload: msg.payload });
  },
};

// ---------- API cho tầng kết nối ----------

export function handleMessage(client: Client, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return fail(client, 'INVALID_MESSAGE');
  }
  if (typeof msg !== 'object' || msg === null || !Object.hasOwn(handlers, msg.type)) {
    return fail(client, 'INVALID_MESSAGE', (msg as { requestId?: string } | null)?.requestId);
  }
  try {
    (handlers[msg.type] as (c: Client, m: ClientMessage) => void)(client, msg);
  } catch (err) {
    // Một lỗi không được làm sập server và mọi phòng khác.
    console.error(err);
    fail(client, 'INVALID_MESSAGE', msg.requestId);
  }
}

export function handleClose(client: Client, code: number): void {
  listListeners.delete(client);
  if (!client.seat) return;
  const { room, player } = client.seat;
  client.seat = null;
  if (code === CloseCode.LEAVE) removePlayer(room, player);
  else disconnect(room, player);
}

export function sweepRooms(): void {
  const now = Date.now();
  for (const room of rooms.values()) {
    const empty = room.emptySince !== null && now - room.emptySince > config.emptyRoomMs;
    if (empty || now - room.lastActivity > config.idleRoomMs) deleteRoom(room);
  }
}
