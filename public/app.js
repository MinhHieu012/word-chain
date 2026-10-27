// Giao diện + kết nối WebSocket. Luật chơi nằm trong game.js.
import { applyEvent, checkWord, currentPlayer, initialState, isPaused, makeDict, TURN_SECONDS } from './game.js';

const DICT_VERSION = 'v1';
const SEAT_GRACE_SECONDS = 60;
const RETRY_DELAYS = [1000, 2000, 4000];
const RETRY_MAX = 5000;
const CLOSE_LEAVE = 4000;
const CLOSE_REPLACED = 4001;
const CLOSE_ROOM_GONE = 4002;
const SESSION_KEY = 'word-chain-session';
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 19;

const $ = (id) => document.getElementById(id);

const app = {
  ws: null,
  open: false,
  inRoom: false,
  replaced: false,
  leaving: false,
  retries: 0,
  reconnectTimer: null,
  requestId: 0,
  pendingRequest: false,
  homeError: '',
  dict: null,
  dictError: false,
  session: loadSession(), // { roomId, playerId, rejoinToken }
  hostId: null,
  players: new Map(), // playerId → connected
  events: [],
  lastSeq: 0,
  game: initialState(),
  pendingTurn: null, // đã gửi từ cho lượt này, chờ server phát lại
  turnKeySeen: null,
  turnDeadline: 0,
  timeoutSentFor: null,
  pausedAt: 0,
  renderedWords: 0,
};

// ---------- sessionStorage ----------

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  app.session = session;
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Trình duyệt chặn storage: vẫn chơi được, chỉ mất khả năng vào lại sau khi tải lại trang.
  }
}

// ---------- Kết nối ----------

function connect() {
  clearTimeout(app.reconnectTimer);
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  app.ws = ws;

  ws.onopen = () => {
    app.open = true;
    if (app.session) {
      send({ type: 'REJOIN_ROOM', roomId: app.session.roomId, rejoinToken: app.session.rejoinToken });
    }
    render();
  };

  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));

  ws.onclose = (e) => {
    if (app.ws !== ws) return;
    app.open = false;
    app.inRoom = false;
    app.pendingRequest = false;
    if (e.code === CLOSE_REPLACED) {
      app.replaced = true;
      render();
      return;
    }
    if (e.code === CLOSE_ROOM_GONE) endSession('Phòng đã đóng.');
    if (app.leaving || e.code === CLOSE_ROOM_GONE) {
      app.leaving = false;
      connect();
      return;
    }
    const delay = RETRY_DELAYS[app.retries] ?? RETRY_MAX;
    app.retries++;
    app.reconnectTimer = setTimeout(connect, delay);
    render();
  };
}

function send(msg) {
  if (app.ws?.readyState !== WebSocket.OPEN) return false;
  app.ws.send(JSON.stringify({ requestId: `r${++app.requestId}`, ...msg }));
  return true;
}

// Điện thoại hay ngắt WebSocket khi chuyển app: quay lại thì kết nối ngay, không chờ backoff.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !app.open && !app.replaced) {
    app.retries = 0;
    connect();
  }
});

// ---------- Xử lý message từ server ----------

function handleMessage(msg) {
  switch (msg.type) {
    case 'ROOM_CREATED':
    case 'ROOM_JOINED':
      saveSession({ roomId: msg.roomId, playerId: msg.playerId, rejoinToken: msg.rejoinToken });
      app.inRoom = true;
      app.pendingRequest = false;
      app.retries = 0;
      app.homeError = '';
      app.hostId = msg.hostId;
      app.players = new Map(msg.players.map((p) => [p.playerId, p.connected]));
      app.events = msg.log;
      app.lastSeq = msg.seq;
      app.renderedWords = 0;
      $('chain').replaceChildren();
      rebuildGame();
      if (location.search) history.replaceState(null, '', location.pathname);
      break;

    case 'EVENT':
      if (msg.seq <= app.lastSeq) return;
      app.lastSeq = msg.seq;
      if (msg.kind === 'PLAYER_JOINED' || msg.kind === 'PLAYER_REJOINED') app.players.set(msg.playerId, true);
      if (msg.kind === 'PLAYER_DISCONNECTED') app.players.set(msg.playerId, false);
      if (msg.kind === 'PLAYER_LEFT') app.players.delete(msg.playerId);
      app.events.push(msg);
      if (app.dict) app.game = applyEvent(app.game, msg, app.dict);
      break;

    case 'HOST_CHANGED':
      app.hostId = msg.hostId;
      break;

    case 'ERROR':
      app.pendingRequest = false;
      if (msg.code === 'LOG_FULL') endSession(msg.message);
      else if (app.session && !app.inRoom && ['ROOM_NOT_FOUND', 'INVALID_TOKEN'].includes(msg.code)) {
        endSession('Phòng cũ không còn nữa.');
      } else if (!app.inRoom) app.homeError = msg.message;
      else showWordError(msg.message);
      break;
  }
  render();
}

function rebuildGame() {
  app.game = app.dict ? app.events.reduce((s, e) => applyEvent(s, e, app.dict), initialState()) : initialState();
}

function endSession(notice) {
  saveSession(null);
  Object.assign(app, { inRoom: false, hostId: null, events: [], lastSeq: 0, game: initialState(), homeError: notice });
  app.players = new Map();
}

function leaveRoom() {
  endSession('');
  if (app.ws?.readyState === WebSocket.OPEN) {
    app.leaving = true;
    app.ws.close(CLOSE_LEAVE, 'leave');
  }
  render();
}

// ---------- Hành động ----------

const me = () => app.session?.playerId;
const opponent = () => [...app.players.keys()].find((p) => p !== me());
const bothOnline = () => app.players.size === 2 && [...app.players.values()].every(Boolean);

function startGame() {
  const g = app.game;
  const opp = opponent();
  // Ván đầu: host đi trước. Ván sau: người thua đi trước (nếu vẫn còn trong phòng).
  const first = g.phase === 'over' && app.players.has(g.loser) && app.players.has(g.winner) ? g.loser : me();
  const players = [first, first === me() ? opp : me()];
  send({ type: 'PLAYER_MESSAGE', newGame: true, payload: { event: 'GAME_STARTED', players, dictVersion: DICT_VERSION } });
}

function submitWord(raw) {
  const g = app.game;
  if (g.phase !== 'playing' || currentPlayer(g) !== me() || isPaused(g) || app.pendingTurn === g.turn) return;
  const error = checkWord(g, raw, app.dict);
  if (error) return showWordError(error);
  if (send({ type: 'PLAYER_MESSAGE', payload: { event: 'WORD_SUBMITTED', turn: g.turn, word: raw.trim() } })) {
    app.pendingTurn = g.turn;
    $('input-word').value = '';
    showWordError('');
  }
  render();
}

function showWordError(text) {
  $('word-error').textContent = text;
  $('input-word').setAttribute('aria-invalid', text ? 'true' : 'false');
}

async function copyCode() {
  const code = app.session?.roomId;
  try {
    await navigator.clipboard.writeText(code);
    const label = $('btn-copy').querySelector('span');
    label.textContent = 'Đã chép!';
    setTimeout(() => (label.textContent = 'Sao chép'), 1500);
  } catch {
    prompt('Sao chép mã phòng:', code);
  }
}

function shareCode() {
  const code = app.session?.roomId;
  navigator.share({ title: 'Nối Từ', text: `Vào chơi nối từ với mình! Mã phòng: ${code}`, url: `${location.origin}/?room=${code}` }).catch(() => {});
}

// ---------- Render ----------

const show = (el, visible) => (el.hidden = !visible);

function render() {
  const g = app.game;
  const inGame = g.phase === 'playing' || (g.phase === 'over' && g.players.includes(me()) && g.players.every((p) => app.players.has(p)));
  const screen = !app.session ? 'home' : inGame ? 'game' : 'lobby';
  show($('screen-home'), screen === 'home');
  show($('screen-lobby'), screen === 'lobby');
  show($('screen-game'), screen === 'game');
  show($('footer'), screen === 'home');
  show($('timer'), g.phase === 'playing');

  renderBanner();
  if (screen === 'home') renderHome();
  if (screen === 'lobby') renderLobby();
  if (screen === 'game') renderGame();
}

function renderBanner() {
  const banner = $('conn-banner');
  let text = '';
  if (app.replaced) text = 'Phòng đang được mở ở tab khác.';
  else if (!app.open) text = app.session ? 'Mất kết nối. Đang kết nối lại…' : 'Đang kết nối máy chủ…';
  else if (app.session && !app.inRoom) text = 'Đang vào lại phòng…';
  else if (app.dictError) text = 'Không tải được từ điển. Hãy tải lại trang.';
  banner.textContent = text;
  show(banner, !!text);
}

function renderHome() {
  const ready = app.open && !app.pendingRequest;
  $('btn-create').disabled = !ready;
  $('btn-join').disabled = !ready;
  $('home-error').textContent = app.homeError;
  $('input-code').setAttribute('aria-invalid', app.homeError ? 'true' : 'false');
}

function playerItem(id, connected) {
  const li = document.createElement('li');
  li.className = 'player';
  const isMe = id === me();
  li.innerHTML = `
    <span class="avatar ${isMe ? 'me' : 'opp'}" aria-hidden="true">${isMe ? 'B' : 'Đ'}</span>
    <span class="name">${isMe ? 'Bạn' : 'Đối thủ'}</span>
    ${id === app.hostId ? '<span class="tag">Chủ phòng</span>' : ''}
    <span class="status-dot ${connected ? '' : 'off'}" role="img" aria-label="${connected ? 'Đang kết nối' : 'Mất kết nối'}"></span>`;
  return li;
}

function renderLobby() {
  const g = app.game;
  const isHost = app.hostId === me();
  $('lobby-code').textContent = app.session.roomId;
  show($('btn-share'), !!navigator.share);

  let notice = '';
  if (g.phase === 'over' && g.reason === 'OPPONENT_LEFT' && g.winner === me() && app.players.size < 2) notice = 'Đối thủ đã rời phòng. Bạn thắng ván vừa rồi!';
  if (g.reason === 'DICT_MISMATCH') notice = 'Từ điển của bạn khác phiên bản với chủ phòng. Hãy tải lại trang.';
  $('lobby-notice').textContent = notice;
  show($('lobby-notice'), !!notice);

  const list = $('lobby-players');
  list.replaceChildren(...[...app.players].map(([id, connected]) => playerItem(id, connected)));
  if (app.players.size < 2) {
    const empty = document.createElement('li');
    empty.className = 'player empty';
    empty.innerHTML = '<span class="avatar" aria-hidden="true">?</span><span class="name">Đang chờ đối thủ…</span>';
    list.append(empty);
  }

  const start = $('btn-start');
  show(start, isHost);
  start.disabled = !(bothOnline() && app.dict && app.inRoom);

  let hint = '';
  if (!app.dict) hint = 'Đang tải từ điển…';
  else if (app.players.size < 2) hint = 'Gửi mã phòng cho bạn bè để bắt đầu.';
  else if (!bothOnline()) hint = 'Đối thủ đang mất kết nối…';
  else if (!isHost) hint = 'Chờ chủ phòng bắt đầu…';
  $('lobby-hint').textContent = hint;
}

function bubble(entry, index) {
  const li = document.createElement('li');
  li.className = `bubble ${entry.by === me() ? 'me' : 'opp'}`;
  const [first, second] = entry.word.split(' ');
  if (index > 0) {
    const link = document.createElement('span');
    link.className = 'link';
    link.textContent = first;
    li.append(link, ` ${second}`);
  } else li.textContent = entry.word;
  li.setAttribute('aria-label', `${entry.by === me() ? 'Bạn' : 'Đối thủ'}: ${entry.word}`);
  return li;
}

function renderGame() {
  const g = app.game;
  const playing = g.phase === 'playing';
  const myTurn = playing && currentPlayer(g) === me();
  const paused = isPaused(g);

  // Chuỗi từ: chỉ thêm phần mới để giữ hiệu ứng và vị trí cuộn.
  const chain = $('chain');
  if (app.renderedWords === 0 || g.words.length < app.renderedWords) {
    chain.replaceChildren();
    app.renderedWords = 0;
  }
  if (g.words.length === 0) {
    const whoFirst = g.players[0] === me() ? 'Bạn đi trước' : 'Đối thủ đi trước';
    chain.innerHTML = `<li class="empty-chain">${whoFirst}.<br>Từ đầu tiên là bất kỳ từ nào có 2 tiếng.</li>`;
  } else {
    for (let i = app.renderedWords; i < g.words.length; i++) chain.append(bubble(g.words[i], i));
    if (g.words.length > app.renderedWords) chain.lastElementChild.scrollIntoView({ block: 'end' });
    app.renderedWords = g.words.length;
  }

  const status = $('turn-status');
  status.textContent = !playing ? 'Hết ván' : myTurn ? 'Lượt của bạn' : 'Lượt đối thủ';
  status.classList.toggle('mine', myTurn);

  // Ô nhập luôn bật để bàn phím điện thoại không bị đóng giữa các lượt; chỉ nút Gửi bị khóa.
  show($('form-word'), playing);
  if (app.pendingTurn !== null && app.pendingTurn !== g.turn) app.pendingTurn = null;
  $('btn-send').disabled = !myTurn || paused || app.pendingTurn === g.turn || !app.inRoom;
  const last = g.words.at(-1);
  $('word-hint').textContent = !myTurn
    ? 'Đợi đối thủ nối từ…'
    : last ? `Bắt đầu bằng “${last.word.split(' ')[1]}”` : 'Nhập một từ bất kỳ có 2 tiếng';
  if (!myTurn) showWordError('');

  renderResult(g);

  if (paused && !app.pausedAt) app.pausedAt = Date.now();
  if (!paused) app.pausedAt = 0;
  show($('pause-overlay'), paused && !g.offline.includes(me()));
}

function renderResult(g) {
  const over = g.phase === 'over';
  show($('result'), over);
  if (!over) return;
  const won = g.winner === me();
  const title = $('result-title');
  title.textContent = won ? 'Bạn thắng!' : 'Bạn thua';
  title.className = `result-title ${won ? 'win' : 'lose'}`;
  const lastWord = g.words.at(-1)?.word ?? '';
  $('result-detail').textContent = {
    TIMEOUT: won ? 'Đối thủ đã hết 20 giây.' : 'Bạn đã hết 20 giây.',
    DEAD_END: `“${lastWord}” là từ cụt, không ai nối tiếp được.`,
    OPPONENT_LEFT: 'Đối thủ đã rời phòng.',
  }[g.reason] ?? '';
  const isHost = app.hostId === me();
  show($('btn-again'), isHost);
  $('btn-again').disabled = !(bothOnline() && app.inRoom);
  $('result-hint').textContent = isHost ? '' : 'Chờ chủ phòng bắt đầu ván mới…';
}

// ---------- Đồng hồ ----------

function tick() {
  const g = app.game;
  if (g.turnKey !== app.turnKeySeen) {
    app.turnKeySeen = g.turnKey;
    app.turnDeadline = Date.now() + TURN_SECONDS * 1000;
  }

  if (isPaused(g)) {
    const left = Math.max(0, SEAT_GRACE_SECONDS - Math.floor((Date.now() - app.pausedAt) / 1000));
    $('pause-seconds').textContent = left;
    return; // đồng hồ lượt đứng yên khi tạm dừng
  }

  const remaining = g.phase === 'playing' ? Math.max(0, (app.turnDeadline - Date.now()) / 1000) : 0;
  $('timer-text').textContent = Math.ceil(remaining);
  $('timer-bar').style.strokeDashoffset = TIMER_CIRCUMFERENCE * (1 - remaining / TURN_SECONDS);
  $('timer').classList.toggle('low', g.phase === 'playing' && remaining <= 5);

  // Chỉ host gửi hết giờ, mỗi lượt một lần.
  if (g.phase === 'playing' && remaining === 0 && app.hostId === me() && app.inRoom && app.timeoutSentFor !== g.turnKey) {
    app.timeoutSentFor = g.turnKey;
    send({ type: 'PLAYER_MESSAGE', payload: { event: 'TURN_TIMEOUT', turn: g.turn } });
  }
}

// ---------- Khởi động ----------

$('timer-bar').style.strokeDasharray = TIMER_CIRCUMFERENCE;

$('btn-create').addEventListener('click', () => {
  app.homeError = '';
  if (send({ type: 'CREATE_ROOM' })) app.pendingRequest = true;
  render();
});

$('form-join').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('input-code').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    app.homeError = 'Mã phòng gồm 6 ký tự.';
  } else {
    app.homeError = '';
    if (send({ type: 'JOIN_ROOM', roomId: code })) app.pendingRequest = true;
  }
  render();
  if (app.homeError) $('input-code').focus();
});

$('input-code').addEventListener('input', () => {
  app.homeError = '';
  renderHome();
});

$('form-word').addEventListener('submit', (e) => {
  e.preventDefault();
  submitWord($('input-word').value);
});
$('input-word').addEventListener('input', () => showWordError(''));

$('btn-start').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-copy').addEventListener('click', copyCode);
$('btn-share').addEventListener('click', shareCode);
document.querySelectorAll('[data-action="leave"]').forEach((b) => b.addEventListener('click', leaveRoom));

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam && !app.session) $('input-code').value = roomParam.toUpperCase().slice(0, 6);

fetch(`dict-${DICT_VERSION}.txt`)
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
  .then((text) => {
    app.dict = makeDict(text, DICT_VERSION);
    rebuildGame();
  })
  .catch(() => (app.dictError = true))
  .finally(render);

render();
connect();
setInterval(tick, 200);
