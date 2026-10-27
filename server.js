// Một tiến trình: phục vụ public/ và WebSocket relay tại /ws. Server không hiểu luật chơi.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize as normalizePath } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? `http://localhost:${PORT},http://127.0.0.1:${PORT}`).split(',');

const MAX_PLAYERS = 2;
const SEAT_GRACE_MS = 60_000; // giữ chỗ cho người mất kết nối (phòng 2 người)
const EMPTY_ROOM_MS = 5 * 60_000; // xóa phòng khi không ai kết nối
const IDLE_ROOM_MS = 30 * 60_000; // xóa phòng khi không có sự kiện
const LOG_LIMIT = 500;
const HEARTBEAT_MS = 30_000;
const JOIN_FAILS_PER_MIN = 10;
const MESSAGES_PER_SEC = 5;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CLOSE_LEAVE = 4000; // client chủ động rời phòng
const CLOSE_REPLACED = 4001; // phòng đã mở ở tab khác
const CLOSE_ROOM_GONE = 4002; // phòng bị đóng

// ---------- File tĩnh ----------

const PUBLIC_DIR = join(import.meta.dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalizePath(join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  const type = TYPES[extname(file)];
  if (!file.startsWith(PUBLIC_DIR) || !type || req.method !== 'GET') {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// ---------- Phòng ----------

/** roomId → { id, players: Map<playerId, player>, hostId, log, seq, lastActivity, emptySince } */
const rooms = new Map();

function newRoomId() {
  let id;
  do id = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  while (rooms.has(id));
  return id;
}

const send = (ws, msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

function emit(room, event) {
  const e = { type: 'EVENT', seq: ++room.seq, ...event };
  room.log.push(e);
  room.lastActivity = Date.now();
  for (const p of room.players.values()) send(p.ws, e);
}

function roomSnapshot(room, player, requestId, type = 'ROOM_JOINED') {
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

// Host phải là người đang kết nối nếu còn ai đó kết nối.
function ensureHost(room) {
  const players = [...room.players.values()];
  if (room.players.get(room.hostId)?.connected) return;
  const next = players.find((p) => p.connected) ?? players[0];
  if (!next || next.id === room.hostId) return;
  room.hostId = next.id;
  for (const p of players) send(p.ws, { type: 'HOST_CHANGED', hostId: next.id });
}

// Chỉ giữ chỗ có thời hạn khi phòng đủ 2 người; phòng 1 người thì để người đó quay lại.
function scheduleSeatGrace(room) {
  if (room.players.size < MAX_PLAYERS) return;
  for (const p of room.players.values()) {
    if (!p.connected && !p.graceTimer) p.graceTimer = setTimeout(() => removePlayer(room, p), SEAT_GRACE_MS);
  }
}

function addPlayer(room, ws) {
  const player = {
    id: `p-${randomBytes(4).toString('hex')}`,
    token: randomBytes(16).toString('hex'),
    ws,
    connected: true,
    graceTimer: null,
  };
  room.players.set(player.id, player);
  ws.ctx = { room, player };
  room.emptySince = null;
  return player;
}

function removePlayer(room, player) {
  clearTimeout(player.graceTimer);
  if (!room.players.delete(player.id)) return;
  if (player.ws) player.ws.ctx = null;
  emit(room, { kind: 'PLAYER_LEFT', playerId: player.id });
  if (room.players.size === 0) return deleteRoom(room);
  ensureHost(room);
}

function deleteRoom(room) {
  rooms.delete(room.id);
  for (const p of room.players.values()) {
    clearTimeout(p.graceTimer);
    if (p.ws) {
      p.ws.ctx = null;
      p.ws.close(CLOSE_ROOM_GONE, 'room closed');
    }
  }
}

function disconnect(room, player) {
  player.connected = false;
  player.ws = null;
  emit(room, { kind: 'PLAYER_DISCONNECTED', playerId: player.id });
  ensureHost(room);
  scheduleSeatGrace(room);
  if (![...room.players.values()].some((p) => p.connected)) room.emptySince = Date.now();
}

// ---------- Giới hạn tần suất ----------

const joinFails = new Map(); // ip → { count, resetAt }

function joinLimited(ip) {
  const f = joinFails.get(ip);
  return !!f && f.resetAt > Date.now() && f.count >= JOIN_FAILS_PER_MIN;
}

function recordJoinFail(ip) {
  const now = Date.now();
  const f = joinFails.get(ip);
  if (!f || f.resetAt <= now) joinFails.set(ip, { count: 1, resetAt: now + 60_000 });
  else f.count++;
}

function messageLimited(ws) {
  const now = Date.now();
  if (now - ws.rate.windowStart >= 1000) ws.rate = { windowStart: now, count: 0 };
  return ++ws.rate.count > MESSAGES_PER_SEC;
}

// ---------- Xử lý message ----------

const ERRORS = {
  ROOM_NOT_FOUND: 'Không tìm thấy phòng.',
  ROOM_FULL: 'Phòng đã đủ người.',
  INVALID_TOKEN: 'Không thể vào lại phòng.',
  INVALID_MESSAGE: 'Dữ liệu không hợp lệ.',
  NOT_IN_ROOM: 'Bạn chưa ở trong phòng.',
  RATE_LIMITED: 'Thao tác quá nhanh, hãy thử lại sau.',
  LOG_FULL: 'Ván đấu quá dài, phòng đã đóng.',
};
const fail = (ws, code, requestId) => send(ws, { type: 'ERROR', requestId, code, message: ERRORS[code] });

const handlers = {
  CREATE_ROOM(ws, msg) {
    if (ws.ctx) return fail(ws, 'INVALID_MESSAGE', msg.requestId);
    const room = { id: newRoomId(), players: new Map(), hostId: null, log: [], seq: 0, lastActivity: Date.now(), emptySince: null };
    rooms.set(room.id, room);
    const player = addPlayer(room, ws);
    room.hostId = player.id;
    send(ws, roomSnapshot(room, player, msg.requestId, 'ROOM_CREATED'));
    emit(room, { kind: 'PLAYER_JOINED', playerId: player.id });
  },

  JOIN_ROOM(ws, msg) {
    if (ws.ctx) return fail(ws, 'INVALID_MESSAGE', msg.requestId);
    if (joinLimited(ws.ip)) return fail(ws, 'RATE_LIMITED', msg.requestId);
    const room = rooms.get(String(msg.roomId ?? '').toUpperCase());
    if (!room) {
      recordJoinFail(ws.ip);
      return fail(ws, 'ROOM_NOT_FOUND', msg.requestId);
    }
    if (room.players.size >= MAX_PLAYERS) return fail(ws, 'ROOM_FULL', msg.requestId);
    const player = addPlayer(room, ws);
    send(ws, roomSnapshot(room, player, msg.requestId));
    emit(room, { kind: 'PLAYER_JOINED', playerId: player.id });
    ensureHost(room);
    scheduleSeatGrace(room);
  },

  REJOIN_ROOM(ws, msg) {
    if (ws.ctx) return fail(ws, 'INVALID_MESSAGE', msg.requestId);
    if (joinLimited(ws.ip)) return fail(ws, 'RATE_LIMITED', msg.requestId);
    const room = rooms.get(String(msg.roomId ?? '').toUpperCase());
    const player = room && [...room.players.values()].find((p) => p.token === msg.rejoinToken);
    if (!player) {
      recordJoinFail(ws.ip);
      return fail(ws, room ? 'INVALID_TOKEN' : 'ROOM_NOT_FOUND', msg.requestId);
    }
    if (player.ws) {
      player.ws.ctx = null;
      player.ws.close(CLOSE_REPLACED, 'replaced');
    }
    const wasOffline = !player.connected;
    clearTimeout(player.graceTimer);
    Object.assign(player, { ws, connected: true, graceTimer: null });
    ws.ctx = { room, player };
    room.emptySince = null;
    send(ws, roomSnapshot(room, player, msg.requestId));
    if (wasOffline) emit(room, { kind: 'PLAYER_REJOINED', playerId: player.id });
    ensureHost(room);
  },

  PLAYER_MESSAGE(ws, msg) {
    if (!ws.ctx) return fail(ws, 'NOT_IN_ROOM');
    if (messageLimited(ws)) return fail(ws, 'RATE_LIMITED');
    if (typeof msg.payload !== 'object' || msg.payload === null) return fail(ws, 'INVALID_MESSAGE');
    const { room, player } = ws.ctx;
    if (msg.newGame === true) room.log = [];
    if (room.log.length >= LOG_LIMIT) {
      for (const p of room.players.values()) fail(p.ws, 'LOG_FULL');
      return deleteRoom(room);
    }
    emit(room, { kind: 'MESSAGE', from: player.id, payload: msg.payload });
  },
};

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws' || !ALLOWED_ORIGINS.includes(req.headers.origin)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const isLoopback = (addr) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);

wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress;
  // Chỉ tin X-Real-IP khi request đi qua Nginx trên cùng máy.
  ws.ip = (isLoopback(addr) && req.headers['x-real-ip']) || addr;
  ws.ctx = null;
  ws.alive = true;
  ws.rate = { windowStart: 0, count: 0 };

  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return fail(ws, 'INVALID_MESSAGE');
    }
    const handler = Object.hasOwn(handlers, msg?.type) && handlers[msg.type];
    if (!handler) return fail(ws, 'INVALID_MESSAGE', msg?.requestId);
    try {
      handler(ws, msg);
    } catch (err) {
      // Một lỗi không được làm sập server và mọi phòng khác.
      console.error(err);
      fail(ws, 'INVALID_MESSAGE', msg.requestId);
    }
  });
  ws.on('close', (code) => {
    if (!ws.ctx) return;
    const { room, player } = ws.ctx;
    ws.ctx = null;
    if (code === CLOSE_LEAVE) removePlayer(room, player);
    else disconnect(room, player);
  });
});

// Heartbeat + dọn phòng.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const room of rooms.values()) {
    if ((room.emptySince && now - room.emptySince > EMPTY_ROOM_MS) || now - room.lastActivity > IDLE_ROOM_MS) {
      deleteRoom(room);
    }
  }
  for (const [ip, f] of joinFails) if (f.resetAt <= now) joinFails.delete(ip);
}, HEARTBEAT_MS);

server.listen(PORT, HOST, () => console.log(`Nối từ: http://localhost:${PORT}`));
