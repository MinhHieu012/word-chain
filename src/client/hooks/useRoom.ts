// Kết nối WebSocket + trạng thái phòng: tự kết nối lại, tự vào lại phòng, các hành động gửi lên server.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { CloseCode, WS_PATH } from '../../shared/protocol.ts';
import type { ClientMessage, GamePayload, ServerMessage } from '../../shared/protocol.ts';
import { loadSession, saveSession } from '../lib/session.ts';
import { initialRoomState, roomReducer } from '../state/roomReducer.ts';

const RETRY_DELAYS = [1000, 2000, 4000];
const RETRY_MAX = 5000;
const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`;

export function useRoom() {
  const [state, dispatch] = useReducer(roomReducer, null, () => initialRoomState(loadSession()));
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef(state.session);
  const leavingRef = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    sessionRef.current = state.session;
    saveSession(state.session);
  }, [state.session]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ requestId: `r${++requestId.current}`, ...msg }));
    return true;
  }, []);

  useEffect(() => {
    let disposed = false;
    let replaced = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      clearTimeout(timer);
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        retries = 0;
        dispatch({ type: 'socketOpen' });
        const s = sessionRef.current;
        if (s) send({ type: 'REJOIN_ROOM', roomId: s.roomId, rejoinToken: s.rejoinToken });
      };
      ws.onmessage = (e) => dispatch({ type: 'server', msg: JSON.parse(e.data) as ServerMessage });
      ws.onclose = (e) => {
        if (disposed || wsRef.current !== ws) return;
        if (e.code === CloseCode.REPLACED) {
          replaced = true;
          dispatch({ type: 'socketClosed', replaced: true });
          return;
        }
        dispatch({ type: 'socketClosed' });
        if (e.code === CloseCode.ROOM_GONE) {
          sessionRef.current = null;
          dispatch({ type: 'reset', notice: 'Phòng đã đóng.' });
        }
        if (leavingRef.current || e.code === CloseCode.ROOM_GONE) {
          leavingRef.current = false;
          connect();
          return;
        }
        timer = setTimeout(connect, RETRY_DELAYS[retries++] ?? RETRY_MAX);
      };
    }

    // Điện thoại hay ngắt WebSocket khi chuyển app: quay lại thì kết nối ngay, không chờ backoff.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !replaced && wsRef.current?.readyState === WebSocket.CLOSED) {
        retries = 0;
        connect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      wsRef.current?.close();
    };
  }, [send]);

  const listRooms = useCallback(() => send({ type: 'LIST_ROOMS' }), [send]);
  // before = order của phòng cuối đã có; bỏ trống để tải lại từ đầu.
  const loadRoomPage = useCallback(
    (before?: number) => {
      if (send({ type: 'ROOM_PAGE', before })) dispatch({ type: 'pageRequest', first: before === undefined });
    },
    [send],
  );

  const request = (msg: ClientMessage) => {
    if (send(msg)) dispatch({ type: 'request' });
  };

  return {
    state,
    me: state.session?.playerId ?? null,
    createRoom: (isPrivate: boolean) => request({ type: 'CREATE_ROOM', private: isPrivate }),
    listRooms,
    loadRoomPage,
    joinRoom: (roomId: string) => request({ type: 'JOIN_ROOM', roomId }),
    setHomeError: (message: string) => dispatch({ type: 'homeError', message }),
    sendGame: (payload: GamePayload, newGame = false) => send({ type: 'PLAYER_MESSAGE', payload, newGame }),
    leave: () => {
      sessionRef.current = null;
      dispatch({ type: 'reset' });
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        leavingRef.current = true;
        ws.close(CloseCode.LEAVE, 'leave');
      }
    },
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
