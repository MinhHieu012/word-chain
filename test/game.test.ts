import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, checkWord, currentPlayer, initialState, isPaused, makeDict } from '../src/shared/game.ts';
import type { GamePayload, RoomEvent } from '../src/shared/protocol.ts';

// Từ điển nhỏ: "xanh lá" → "lá cây" → "cây cối"; "cối xay" là từ cụt (không có từ nào bắt đầu bằng "xay").
const dict = makeDict(['trời xanh', 'xanh lá', 'lá cây', 'cây cối', 'cối xay', 'bác sĩ', 'sĩ quan', 'quan tâm', 'tâm sự', 'sự thật', 'thật thà'].join('\n'), 'v1');

type PlayerEventKind = Exclude<RoomEvent['kind'], 'MESSAGE'>;

let seq = 0;
const msg = (from: string, payload: GamePayload): RoomEvent => ({ type: 'EVENT', seq: ++seq, kind: 'MESSAGE', from, payload });
const ev = (kind: PlayerEventKind, playerId: string): RoomEvent => ({ type: 'EVENT', seq: ++seq, kind, playerId });
const start = (players: [string, string] = ['a', 'b']) => msg('a', { event: 'GAME_STARTED', players, dictVersion: 'v1' });
const word = (from: string, turn: number, w: string) => msg(from, { event: 'WORD_SUBMITTED', turn, word: w });
const timeout = (turn: number) => msg('a', { event: 'TURN_TIMEOUT', turn });
const play = (...events: RoomEvent[]) => events.reduce((s, e) => applyEvent(s, e, dict), initialState());

test('nối đúng thì đổi lượt', () => {
  const s = play(start(), word('a', 0, 'trời xanh'), word('b', 1, 'xanh lá'));
  assert.deepEqual(s.words.map((w) => w.word), ['trời xanh', 'xanh lá']);
  assert.equal(s.turn, 2);
  assert.equal(currentPlayer(s), 'a');
});

test('bỏ qua từ sai: sai tiếng đầu, không có trong từ điển, đã dùng, sai lượt, sai người', () => {
  const base = play(start(), word('a', 0, 'trời xanh'));
  for (const e of [
    word('b', 1, 'lá cây'), // không bắt đầu bằng "xanh"
    word('b', 1, 'xanh rờn'), // không có trong từ điển
    word('b', 1, 'trời xanh'), // sai tiếng đầu và đã dùng
    word('b', 5, 'xanh lá'), // sai turn
    word('a', 1, 'xanh lá'), // không phải lượt của a
  ]) {
    assert.equal(applyEvent(base, e, dict), base);
  }
  assert.match(checkWord(base, 'trời xanh', dict) ?? '', /bắt đầu bằng/);
  const loop = play(start(), word('a', 0, 'sĩ quan'), word('b', 1, 'quan tâm'));
  assert.equal(checkWord(loop, 'tâm sự', dict), null);
});

test('chuẩn hoá: NFD và i/y vẫn được chấp nhận và nối đúng', () => {
  const s = play(start(), word('a', 0, 'BÁC SỸ'.normalize('NFD')), word('b', 1, 'sĩ quan'));
  assert.equal(s.turn, 2);
});

test('từ cụt: người vừa đi thắng; nước đầu không được là từ cụt', () => {
  const s = play(start(), word('a', 0, 'lá cây'), word('b', 1, 'cây cối'), word('a', 2, 'cối xay'));
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 'a');
  assert.equal(s.reason, 'DEAD_END');
  assert.match(checkWord(play(start()), 'cối xay', dict) ?? '', /từ cụt/);
});

test('hết giờ và gửi từ cùng turn: chỉ sự kiện đến trước có tác dụng', () => {
  const base = play(start(), word('a', 0, 'trời xanh'));
  const wordFirst = [word('b', 1, 'xanh lá'), timeout(1)].reduce((s, e) => applyEvent(s, e, dict), base);
  assert.equal(wordFirst.phase, 'playing');
  assert.equal(wordFirst.turn, 2);
  const timeoutFirst = [timeout(1), word('b', 1, 'xanh lá')].reduce((s, e) => applyEvent(s, e, dict), base);
  assert.equal(timeoutFirst.phase, 'over');
  assert.equal(timeoutFirst.loser, 'b');
  assert.equal(timeoutFirst.words.length, 1);
});

test('tạm dừng khi mất kết nối, tiếp tục và reset lượt khi quay lại', () => {
  const paused = play(start(), ev('PLAYER_DISCONNECTED', 'b'));
  assert.ok(isPaused(paused));
  assert.equal(applyEvent(paused, word('a', 0, 'trời xanh'), dict), paused);
  assert.equal(applyEvent(paused, timeout(0), dict), paused);
  const back = ev('PLAYER_REJOINED', 'b');
  const resumed = applyEvent(paused, back, dict);
  assert.ok(!isPaused(resumed));
  assert.equal(resumed.turnKey, back.seq);
});

test('đối thủ rời giữa ván: người còn lại thắng; rời khi chưa chơi thì không sao', () => {
  const s = play(start(), ev('PLAYER_DISCONNECTED', 'b'), ev('PLAYER_LEFT', 'b'));
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 'a');
  assert.equal(s.reason, 'OPPONENT_LEFT');
  assert.equal(play(ev('PLAYER_LEFT', 'b')).phase, 'lobby');
});

test('từ điển xuống dòng kiểu CRLF vẫn đọc đúng', () => {
  assert.ok(makeDict('học sinh\r\nsinh viên\r\n', 'v1').words.has('sinh viên'));
});

test('khác phiên bản từ điển thì báo lỗi', () => {
  const s = play(msg('a', { event: 'GAME_STARTED', players: ['a', 'b'], dictVersion: 'v0' }));
  assert.equal(s.phase, 'error');
  assert.equal(s.reason, 'DICT_MISMATCH');
});
