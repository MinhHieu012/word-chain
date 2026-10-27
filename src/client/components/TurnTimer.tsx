import { TURN_SECONDS } from '../../shared/game.ts';
import styles from './TurnTimer.module.css';

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const LOW_SECONDS = 5;

export function TurnTimer({ remaining }: { remaining: number }) {
  const low = remaining <= LOW_SECONDS;
  return (
    <div className={`${styles.timer} ${low ? styles.low : ''}`} role="timer" aria-label="Thời gian còn lại">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className={styles.track} cx="22" cy="22" r={RADIUS} />
        <circle
          className={styles.bar}
          cx="22"
          cy="22"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - remaining / TURN_SECONDS)}
        />
      </svg>
      <span>{Math.ceil(remaining)}</span>
    </div>
  );
}
