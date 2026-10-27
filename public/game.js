// Luật chơi nối từ: hàm thuần, dùng chung cho trình duyệt và test.
// Game state = log.reduce((s, e) => applyEvent(s, e, dict), initialState()).
import { normalize } from './normalize.js';

export const TURN_SECONDS = 20;

export function makeDict(text, version) {
  const words = new Set(text.split(/\r?\n/).filter(Boolean));
  const firsts = new Set([...words].map((w) => w.split(' ')[0]));
  return { words, firsts, version };
}

export const initialState = () => ({
  phase: 'lobby', // lobby | playing | over | error
  players: [], // [người đi trước, người đi sau]
  turn: 0,
  turnKey: 0, // seq của sự kiện bắt đầu/khởi động lại lượt; UI reset đồng hồ khi giá trị này đổi
  words: [], // { word, by }
  used: [],
  offline: [],
  winner: null,
  loser: null,
  reason: null, // TIMEOUT | DEAD_END | OPPONENT_LEFT | DICT_MISMATCH
});

export const currentPlayer = (s) => s.players[s.turn % 2];
export const otherPlayer = (s, id) => s.players.find((p) => p !== id);
const lastSyllable = (key) => key.split(' ')[1];

// Trả về câu báo lỗi, hoặc null nếu từ hợp lệ ở lượt hiện tại.
export function checkWord(s, raw, dict) {
  const key = normalize(raw);
  if (key.split(' ').length !== 2) return 'Từ phải gồm đúng 2 tiếng.';
  if (!dict.words.has(key)) return 'Từ này không có trong từ điển.';
  const prev = s.words.at(-1);
  if (prev) {
    const need = lastSyllable(normalize(prev.word));
    if (key.split(' ')[0] !== need) return `Từ phải bắt đầu bằng “${prev.word.split(' ')[1]}”.`;
  } else if (!dict.firsts.has(lastSyllable(key))) {
    return 'Từ đầu tiên không được là từ cụt.';
  }
  if (s.used.includes(key)) return 'Từ này đã được dùng trong ván.';
  return null;
}

const display = (raw) => raw.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

export function applyEvent(s, e, dict) {
  switch (e.kind) {
    case 'MESSAGE':
      return applyMessage(s, e, dict);
    case 'PLAYER_DISCONNECTED':
      return { ...s, offline: [...new Set([...s.offline, e.playerId])] };
    case 'PLAYER_REJOINED': {
      const offline = s.offline.filter((p) => p !== e.playerId);
      // Ván tiếp tục khi đủ người: lượt hiện tại được tính lại từ đầu.
      const resumed = s.phase === 'playing' && s.offline.length > 0 && offline.length === 0;
      return { ...s, offline, turnKey: resumed ? e.seq : s.turnKey };
    }
    case 'PLAYER_LEFT': {
      const offline = s.offline.filter((p) => p !== e.playerId);
      if (s.phase !== 'playing' || !s.players.includes(e.playerId)) return { ...s, offline };
      const winner = otherPlayer(s, e.playerId);
      return { ...s, offline, phase: 'over', winner, loser: e.playerId, reason: 'OPPONENT_LEFT' };
    }
    default:
      return s;
  }
}

export const isPaused = (s) => s.phase === 'playing' && s.offline.length > 0;

function applyMessage(s, e, dict) {
  const p = e.payload ?? {};
  if (p.event === 'GAME_STARTED') {
    if (p.dictVersion !== dict.version) return { ...initialState(), phase: 'error', reason: 'DICT_MISMATCH' };
    return { ...initialState(), phase: 'playing', players: p.players, turnKey: e.seq };
  }
  if (s.phase !== 'playing' || isPaused(s) || p.turn !== s.turn) return s;

  if (p.event === 'WORD_SUBMITTED') {
    if (e.from !== currentPlayer(s) || typeof p.word !== 'string' || checkWord(s, p.word, dict)) return s;
    const key = normalize(p.word);
    const next = {
      ...s,
      words: [...s.words, { word: display(p.word), by: e.from }],
      used: [...s.used, key],
      turn: s.turn + 1,
      turnKey: e.seq,
    };
    if (!dict.firsts.has(lastSyllable(key))) {
      return { ...next, phase: 'over', winner: e.from, loser: otherPlayer(s, e.from), reason: 'DEAD_END' };
    }
    return next;
  }
  if (p.event === 'TURN_TIMEOUT') {
    const loser = currentPlayer(s);
    return { ...s, phase: 'over', loser, winner: otherPlayer(s, loser), reason: 'TIMEOUT' };
  }
  return s;
}
