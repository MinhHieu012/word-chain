import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialRoomState, roomReducer, type RoomAction, type RoomState } from '../src/client/state/roomReducer.ts';
import type { RoomEvent, RoomSnapshot, ServerMessage } from '../src/shared/protocol.ts';

const session = { roomId: 'KX7P4M', playerId: 'a', rejoinToken: 't' };
const joined: RoomSnapshot = {
  type: 'ROOM_JOINED', roomId: 'KX7P4M', playerId: 'a', rejoinToken: 't', hostId: 'a',
  players: [{ playerId: 'a', connected: true }], seq: 3, log: [],
};
const server = (msg: ServerMessage): RoomAction => ({ type: 'server', msg });
const run = (state: RoomState, ...actions: RoomAction[]) => actions.reduce(roomReducer, state);
const joinEvent = (seq: number, playerId: string): RoomEvent => ({ type: 'EVENT', seq, kind: 'PLAYER_JOINED', playerId });

test('vào phòng: lưu phiên, danh sách người chơi, seq', () => {
  const s = run(initialRoomState(null), server(joined));
  assert.deepEqual(s.session, session);
  assert.equal(s.inRoom, true);
  assert.equal(s.lastSeq, 3);
});

test('bỏ qua sự kiện trùng hoặc cũ (seq <= lastSeq)', () => {
  const s = run(initialRoomState(null), server(joined), server(joinEvent(3, 'b')));
  assert.equal(s.players.length, 1);
  const s2 = roomReducer(s, server(joinEvent(4, 'b')));
  assert.deepEqual(s2.players.map((p) => p.id), ['a', 'b']);
});

test('mất kết nối / vào lại / rời phòng cập nhật danh sách người chơi', () => {
  let s = run(initialRoomState(null), server(joined), server(joinEvent(4, 'b')));
  s = roomReducer(s, server({ type: 'EVENT', seq: 5, kind: 'PLAYER_DISCONNECTED', playerId: 'b' }));
  assert.equal(s.players.find((p) => p.id === 'b')?.connected, false);
  s = roomReducer(s, server({ type: 'EVENT', seq: 6, kind: 'PLAYER_REJOINED', playerId: 'b' }));
  assert.equal(s.players.find((p) => p.id === 'b')?.connected, true);
  s = roomReducer(s, server({ type: 'EVENT', seq: 7, kind: 'PLAYER_LEFT', playerId: 'b' }));
  assert.deepEqual(s.players.map((p) => p.id), ['a']);
});

test('vào lại phòng không còn tồn tại: xóa phiên, về trang chủ kèm thông báo', () => {
  const s = run(initialRoomState(session), { type: 'socketOpen' }, server({ type: 'ERROR', code: 'ROOM_NOT_FOUND', message: '' }));
  assert.equal(s.session, null);
  assert.equal(s.homeError, 'Phòng cũ không còn nữa.');
  assert.equal(s.status, 'open');
});

test('lỗi khi đang ở trang chủ hiện dưới ô nhập mã', () => {
  const s = run(initialRoomState(null), { type: 'request' }, server({ type: 'ERROR', code: 'ROOM_FULL', message: 'Phòng đã đủ người.' }));
  assert.equal(s.pending, false);
  assert.equal(s.homeError, 'Phòng đã đủ người.');
});

test('mất kết nối thì chưa còn ở trong phòng, nhưng giữ phiên để vào lại', () => {
  const s = run(initialRoomState(null), server(joined), { type: 'socketClosed' });
  assert.equal(s.inRoom, false);
  assert.equal(s.status, 'reconnecting');
  assert.deepEqual(s.session, session);
});

test('danh sách phòng chờ thay mới mỗi lần nhận ROOM_LIST', () => {
  assert.equal(initialRoomState(null).openRooms, null);
  const room = (roomId: string) => ({ roomId, createdAt: 0 });
  const s = run(initialRoomState(null), server({ type: 'ROOM_LIST', rooms: [room('AAAAAA'), room('BBBBBB')] }), server({ type: 'ROOM_LIST', rooms: [room('CCCCCC')] }));
  assert.deepEqual(s.openRooms, [room('CCCCCC')]);
});
