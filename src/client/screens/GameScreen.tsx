import { useCallback, useState } from 'react';
import { checkWord, currentPlayer, isPaused, type Dict, type GameState } from '../../shared/game.ts';
import { PauseOverlay } from '../components/PauseOverlay.tsx';
import { ResultCard } from '../components/ResultCard.tsx';
import { TurnTimer } from '../components/TurnTimer.tsx';
import { WordChain } from '../components/WordChain.tsx';
import { WordInput } from '../components/WordInput.tsx';
import type { RoomApi } from '../hooks/useRoom.ts';
import { useTurnTimer } from '../hooks/useTurnTimer.ts';
import styles from './GameScreen.module.css';

interface Props {
  room: RoomApi;
  game: GameState;
  dict: Dict;
  bothOnline: boolean;
  onRematch: () => void;
}

export function GameScreen({ room, game, dict, bothOnline, onRematch }: Props) {
  const { state, me, sendGame } = room;
  const isHost = state.hostId === me;
  const playing = game.phase === 'playing';
  const paused = isPaused(game);
  const myTurn = playing && currentPlayer(game) === me;
  // Đã gửi từ cho lượt này, chờ server phát lại; tự hết hiệu lực khi sang lượt khác.
  const [pendingTurn, setPendingTurn] = useState<number | null>(null);
  const canSend = myTurn && !paused && pendingTurn !== game.turn && state.inRoom;

  const onTimeout = useCallback((turn: number) => sendGame({ event: 'TURN_TIMEOUT', turn }), [sendGame]);
  const remaining = useTurnTimer(game, { isHost, canSend: state.inRoom, onTimeout });

  function submitWord(raw: string): string | null {
    const error = checkWord(game, raw, dict);
    if (error) return error;
    if (!sendGame({ event: 'WORD_SUBMITTED', turn: game.turn, word: raw.trim() })) return 'Mất kết nối, hãy thử lại.';
    setPendingTurn(game.turn);
    return null;
  }

  const last = game.words.at(-1);
  const hint = !myTurn ? 'Đợi đối thủ nối từ…' : last ? `Bắt đầu bằng “${last.word.split(' ')[1]}”` : 'Nhập một từ bất kỳ có 2 tiếng';

  return (
    <section className={`screen ${styles.screen}`} aria-labelledby="game-title">
      <header className="topbar">
        <h2 id="game-title" className="visually-hidden">Ván đấu</h2>
        <div className={`${styles.turn} ${myTurn ? styles.mine : ''}`} aria-live="polite">
          {!playing ? 'Hết ván' : myTurn ? 'Lượt của bạn' : 'Lượt đối thủ'}
        </div>
        {playing && <TurnTimer remaining={remaining} />}
      </header>

      <WordChain words={game.words} me={me} meFirst={game.players[0] === me} />

      {game.phase === 'over' && (
        <ResultCard game={game} me={me} isHost={isHost} canRematch={bothOnline && state.inRoom} onRematch={onRematch} onLeave={room.leave} />
      )}

      {playing && (
        <WordInput turn={game.turn} canSend={canSend} hint={hint} serverError={state.roomError} onSubmit={submitWord} />
      )}

      {paused && me && !game.offline.includes(me) && <PauseOverlay />}
    </section>
  );
}
