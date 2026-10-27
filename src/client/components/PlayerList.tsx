import type { Player } from '../state/roomReducer.ts';
import styles from './PlayerList.module.css';

interface Props {
  players: Player[];
  me: string | null;
  hostId: string | null;
}

export function PlayerList({ players, me, hostId }: Props) {
  return (
    <ul className={styles.players} aria-label="Người chơi">
      {players.map((p) => {
        const isMe = p.id === me;
        return (
          <li key={p.id} className={styles.player}>
            <span className={`${styles.avatar} ${isMe ? styles.me : styles.opp}`} aria-hidden="true">
              {isMe ? 'B' : 'Đ'}
            </span>
            <span className={styles.name}>{isMe ? 'Bạn' : 'Đối thủ'}</span>
            {p.id === hostId && <span className={styles.tag}>Chủ phòng</span>}
            <span
              className={`${styles.dot} ${p.connected ? '' : styles.off}`}
              role="img"
              aria-label={p.connected ? 'Đang kết nối' : 'Mất kết nối'}
            />
          </li>
        );
      })}
      {players.length < 2 && (
        <li className={`${styles.player} ${styles.empty}`}>
          <span className={styles.avatar} aria-hidden="true">?</span>
          <span className={styles.name}>Đang chờ đối thủ…</span>
        </li>
      )}
    </ul>
  );
}
