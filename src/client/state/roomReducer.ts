// Trạng thái phòng phía client: hàm thuần, dễ test. Game state được suy ra từ `events` (xem game.ts).
import type { RoomEvent, ServerMessage } from '../../shared/protocol.ts';
import type { Session } from '../lib/session.ts';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'replaced';

export interface Player {
  id: string;
  connected: boolean;
}

export interface RoomState {
  status: ConnStatus;
  session: Session | null;
  inRoom: boolean; // đã nhận ROOM_CREATED/ROOM_JOINED trên kết nối hiện tại
  pending: boolean; // đang chờ phản hồi tạo/vào phòng
  homeError: string;
  roomError: string;
  hostId: string | null;
  players: Player[];
  events: RoomEvent[]; // sự kiện của ván hiện tại
  lastSeq: number;
}

export type RoomAction =
  | { type: 'socketOpen' }
  | { type: 'socketClosed'; replaced?: boolean }
  | { type: 'request' }
  | { type: 'homeError'; message: string }
  | { type: 'reset'; notice?: string }
  | { type: 'server'; msg: ServerMessage };

export const initialRoomState = (session: Session | null): RoomState => ({
  status: 'connecting',
  session,
  inRoom: false,
  pending: false,
  homeError: '',
  roomError: '',
  hostId: null,
  players: [],
  events: [],
  lastSeq: 0,
});

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'socketOpen':
      return { ...state, status: 'open' };
    case 'socketClosed':
      return { ...state, status: action.replaced ? 'replaced' : 'reconnecting', inRoom: false, pending: false };
    case 'request':
      return { ...state, pending: true, homeError: '' };
    case 'homeError':
      return { ...state, homeError: action.message };
    case 'reset':
      return { ...initialRoomState(null), status: state.status, homeError: action.notice ?? '' };
    case 'server':
      return applyServerMessage(state, action.msg);
  }
}

function applyServerMessage(state: RoomState, msg: ServerMessage): RoomState {
  switch (msg.type) {
    case 'ROOM_CREATED':
    case 'ROOM_JOINED':
      return {
        ...state,
        session: { roomId: msg.roomId, playerId: msg.playerId, rejoinToken: msg.rejoinToken },
        inRoom: true,
        pending: false,
        homeError: '',
        roomError: '',
        hostId: msg.hostId,
        players: msg.players.map((p) => ({ id: p.playerId, connected: p.connected })),
        events: msg.log,
        lastSeq: msg.seq,
      };

    case 'EVENT': {
      if (msg.seq <= state.lastSeq) return state;
      // GAME_STARTED đặt lại toàn bộ game state, nên sự kiện của ván cũ không còn cần.
      const newGame = msg.kind === 'MESSAGE' && msg.payload.event === 'GAME_STARTED';
      return {
        ...state,
        lastSeq: msg.seq,
        roomError: '',
        players: updatePlayers(state.players, msg),
        events: newGame ? [msg] : [...state.events, msg],
      };
    }

    case 'HOST_CHANGED':
      return { ...state, hostId: msg.hostId };

    case 'ERROR':
      if (msg.code === 'LOG_FULL') return roomReducer(state, { type: 'reset', notice: msg.message });
      if (state.session && !state.inRoom && (msg.code === 'ROOM_NOT_FOUND' || msg.code === 'INVALID_TOKEN')) {
        return roomReducer(state, { type: 'reset', notice: 'Phòng cũ không còn nữa.' });
      }
      if (!state.inRoom) return { ...state, pending: false, homeError: msg.message };
      return { ...state, roomError: msg.message };
  }
}

function updatePlayers(players: Player[], e: RoomEvent): Player[] {
  if (e.kind === 'MESSAGE') return players;
  const rest = players.filter((p) => p.id !== e.playerId);
  switch (e.kind) {
    case 'PLAYER_LEFT':
      return rest;
    case 'PLAYER_DISCONNECTED':
      return players.map((p) => (p.id === e.playerId ? { ...p, connected: false } : p));
    default: // JOINED, REJOINED
      return players.some((p) => p.id === e.playerId)
        ? players.map((p) => (p.id === e.playerId ? { ...p, connected: true } : p))
        : [...players, { id: e.playerId, connected: true }];
  }
}
