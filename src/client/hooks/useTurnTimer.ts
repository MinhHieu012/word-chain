import { useEffect, useRef, useState } from 'react';
import { isPaused, TURN_SECONDS, type GameState } from '../../shared/game.ts';

const TICK_MS = 200;

/**
 * Đồng hồ lượt chỉ để hiển thị: đếm lại mỗi khi turnKey đổi, đứng yên khi ván tạm dừng.
 * Kết quả hết giờ đi qua sự kiện TURN_TIMEOUT, do host gửi đúng một lần mỗi lượt.
 */
export function useTurnTimer(game: GameState, opts: { isHost: boolean; canSend: boolean; onTimeout: (turn: number) => void }) {
  const playing = game.phase === 'playing';
  const paused = isPaused(game);
  const [tracked, setTracked] = useState({ key: game.turnKey, deadline: Date.now() + TURN_SECONDS * 1000 });
  const [now, setNow] = useState(Date.now);
  const sentFor = useRef<number | null>(null);

  if (tracked.key !== game.turnKey) setTracked({ key: game.turnKey, deadline: Date.now() + TURN_SECONDS * 1000 });

  useEffect(() => {
    if (!playing || paused) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [playing, paused]);

  const remaining = playing ? Math.min(TURN_SECONDS, Math.max(0, (tracked.deadline - now) / 1000)) : 0;
  const { isHost, canSend, onTimeout } = opts;

  useEffect(() => {
    if (!playing || paused || remaining > 0 || !isHost || !canSend || sentFor.current === game.turnKey) return;
    sentFor.current = game.turnKey;
    onTimeout(game.turn);
  }, [playing, paused, remaining, isHost, canSend, game.turnKey, game.turn, onTimeout]);

  return remaining;
}
