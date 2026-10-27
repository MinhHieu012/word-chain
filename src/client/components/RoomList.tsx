// Danh sách phòng công khai đang chờ: dùng ở trang chủ (vài phòng mới nhất) và trang "Tất cả phòng".
import { useEffect, useState } from 'react';
import type { OpenRoom } from '../../shared/protocol.ts';
import styles from './RoomList.module.css';

const waitingLabel = (ms: number) => {
  const min = Math.floor(ms / 60_000);
  return min < 1 ? 'vừa tạo' : `chờ ${min} phút`;
};

// Giờ hiện tại, cập nhật định kỳ để nhãn "chờ N phút" tự đổi.
function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface Props {
  rooms: OpenRoom[] | null; // null = đang tải
  disabled: boolean;
  onJoin: (roomId: string) => void;
  labelledBy: string;
}

export function RoomList({ rooms, disabled, onJoin, labelledBy }: Props) {
  const now = useNow(30_000);

  if (!rooms) return <p className={styles.empty}>Đang tải…</p>;
  if (rooms.length === 0) return <p className={styles.empty}>Chưa có ai mở phòng. Tạo phòng mới để người khác vào cùng!</p>;

  return (
    <ul className={styles.list} aria-labelledby={labelledBy}>
      {rooms.map((r) => {
        const meta = `1/2 người · ${waitingLabel(now - r.createdAt)}`;
        return (
          <li key={r.roomId}>
            <button
              className={styles.item}
              type="button"
              disabled={disabled}
              aria-label={`Vào phòng ${r.roomId}, ${meta}`}
              onClick={() => onJoin(r.roomId)}
            >
              <span className={styles.info}>
                <span className={styles.code}>{r.roomId}</span>
                <span className={styles.meta}>{meta}</span>
              </span>
              <span className={styles.join} aria-hidden="true">Vào</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
