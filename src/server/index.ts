// Một tiến trình: phục vụ bản build của client (dist/) và WebSocket relay tại /ws.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { WS_PATH } from '../shared/protocol.ts';
import { config } from './config.ts';
import { pruneJoinFails, MessageRate } from './rateLimit.ts';
import { handleClose, handleMessage, sweepRooms, type Client } from './rooms.ts';

const DIST_DIR = join(import.meta.dirname, '..', '..', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ---------- File tĩnh ----------

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = normalize(join(DIST_DIR, pathname === '/' ? 'index.html' : pathname));
  const type = TYPES[extname(file)];
  if (!file.startsWith(DIST_DIR + sep) || !type || req.method !== 'GET') {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    // File trong assets/ có hash trong tên, cache lâu được; còn lại luôn kiểm tra lại.
    const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayloadBytes });

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path !== WS_PATH || !config.allowedOrigins.includes(req.headers.origin ?? '')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const isLoopback = (addr = '') => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
const clients = new Set<Client>();

wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress ?? '';
  const realIp = req.headers['x-real-ip'];
  // Chỉ tin X-Real-IP khi request đi qua reverse proxy trên cùng máy.
  const ip = isLoopback(addr) && typeof realIp === 'string' ? realIp : addr;
  const client: Client = { ws, ip, alive: true, rate: new MessageRate(), seat: null };
  clients.add(client);

  ws.on('pong', () => (client.alive = true));
  ws.on('message', (data) => handleMessage(client, data.toString()));
  ws.on('close', (code) => {
    clients.delete(client);
    handleClose(client, code);
  });
});

// Heartbeat + dọn phòng.
setInterval(() => {
  for (const client of clients) {
    if (!client.alive) {
      client.ws.terminate();
      continue;
    }
    client.alive = false;
    client.ws.ping();
  }
  sweepRooms();
  pruneJoinFails();
}, config.heartbeatMs);

server.listen(config.port, config.host, () => console.log(`Nối từ: http://localhost:${config.port}`));
