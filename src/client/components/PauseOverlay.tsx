import { useEffect, useState } from 'react';
import styles from './PauseOverlay.module.css';

const SEAT_GRACE_SECONDS = 60;

/** Hiện khi đối thủ mất kết nối. Đếm ngược tính từ lúc overlay xuất hiện. */
export function PauseOverlay() {
  const [startedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, SEAT_GRACE_SECONDS - Math.floor((now - startedAt) / 1000));

  return (
    <div className={styles.overlay}>
      <div className={`card ${styles.card}`} role="alertdialog" aria-labelledby="pause-title" aria-describedby="pause-detail">
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.title} id="pause-title">Đối thủ mất kết nối</p>
        <p id="pause-detail">Ván tạm dừng. Chờ tối đa {left} giây.</p>
      </div>
    </div>
  );
}
