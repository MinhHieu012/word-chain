import type { GameState } from '../../shared/game.ts';
import styles from './ResultCard.module.css';

interface Props {
  game: GameState;
  me: string | null;
  isHost: boolean;
  canRematch: boolean;
  onRematch: () => void;
  onLeave: () => void;
}

export function ResultCard({ game, me, isHost, canRematch, onRematch, onLeave }: Props) {
  const won = game.winner === me;
  const lastWord = game.words.at(-1)?.word ?? '';
  const detail = {
    TIMEOUT: won ? 'Đối thủ đã hết 20 giây.' : 'Bạn đã hết 20 giây.',
    DEAD_END: `“${lastWord}” là từ cụt, không ai nối tiếp được.`,
    OPPONENT_LEFT: 'Đối thủ đã rời phòng.',
    DICT_MISMATCH: '',
  }[game.reason ?? 'DICT_MISMATCH'];

  return (
    <div className={`card ${styles.result}`}>
      <p className={`${styles.title} ${won ? styles.win : styles.lose}`}>{won ? 'Bạn thắng!' : 'Bạn thua'}</p>
      <p className={styles.detail}>{detail}</p>
      <div className="row">
        {isHost && (
          <button className="btn btn-primary" type="button" disabled={!canRematch} onClick={onRematch}>
            Chơi lại
          </button>
        )}
        <button className="btn btn-ghost" type="button" onClick={onLeave}>
          Rời phòng
        </button>
      </div>
      {!isHost && <p className="hint">Chờ chủ phòng bắt đầu ván mới…</p>}
    </div>
  );
}
