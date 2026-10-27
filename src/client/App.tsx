import { useCallback, useEffect, useMemo } from 'react';
import { applyEvent, DICT_VERSION, initialState } from '../shared/game.ts';
import { ConnectionBanner } from './components/ConnectionBanner.tsx';
import { useDictionary } from './hooks/useDictionary.ts';
import { useRoom } from './hooks/useRoom.ts';
import { GameScreen } from './screens/GameScreen.tsx';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';

export function App() {
  const room = useRoom();
  const { dict, error: dictError } = useDictionary();
  const { state, me } = room;

  // Game state luôn được suy ra từ log sự kiện của ván: hai client cùng log → cùng kết quả.
  const game = useMemo(
    () => (dict ? state.events.reduce((s, e) => applyEvent(s, e, dict), initialState()) : initialState()),
    [state.events, dict],
  );

  // Đã vào phòng thì bỏ ?room=... khỏi URL, để tải lại trang không điền lại mã cũ.
  useEffect(() => {
    if (state.inRoom && location.search) history.replaceState(null, '', location.pathname);
  }, [state.inRoom]);

  const inRoomIds = state.players.map((p) => p.id);
  const bothOnline = state.players.length === 2 && state.players.every((p) => p.connected);

  // Ván đầu: host đi trước. Ván sau: người thua đi trước (nếu cả hai vẫn còn trong phòng).
  const { sendGame } = room;
  const startGame = useCallback(() => {
    if (!me) return;
    const opp = inRoomIds.find((id) => id !== me);
    if (!opp) return;
    const rematch = game.phase === 'over' && game.loser && game.winner && inRoomIds.includes(game.loser) && inRoomIds.includes(game.winner);
    const first = rematch ? game.loser! : me;
    sendGame({ event: 'GAME_STARTED', players: [first, first === me ? opp : me], dictVersion: DICT_VERSION }, true);
  }, [me, inRoomIds, game, sendGame]);

  const inGame =
    game.phase === 'playing' ||
    (game.phase === 'over' && !!me && game.players.includes(me) && game.players.every((p) => inRoomIds.includes(p)));
  const screen = !state.session ? 'home' : inGame ? 'game' : 'lobby';

  return (
    <>
      <ConnectionBanner status={state.status} hasSession={!!state.session} inRoom={state.inRoom} dictError={dictError} />
      <main className="app">
        {screen === 'home' && <HomeScreen room={room} />}
        {screen === 'lobby' && <LobbyScreen room={room} game={game} dictReady={!!dict} bothOnline={bothOnline} onStart={startGame} />}
        {screen === 'game' && dict && <GameScreen room={room} game={game} dict={dict} bothOnline={bothOnline} onRematch={startGame} />}
      </main>
      {screen === 'home' && <footer className="footer">Dữ liệu từ điển: Wiktionary (CC BY-SA 4.0), qua kaikki.org</footer>}
    </>
  );
}
