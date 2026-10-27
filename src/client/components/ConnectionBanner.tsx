import type { ConnStatus } from '../state/roomReducer.ts';
import styles from './ConnectionBanner.module.css';

interface Props {
  status: ConnStatus;
  hasSession: boolean;
  inRoom: boolean;
  dictError: boolean;
}

export function ConnectionBanner({ status, hasSession, inRoom, dictError }: Props) {
  let text = '';
  if (status === 'replaced') text = 'Phòng đang được mở ở tab khác.';
  else if (status !== 'open') text = hasSession ? 'Mất kết nối. Đang kết nối lại…' : 'Đang kết nối máy chủ…';
  else if (hasSession && !inRoom) text = 'Đang vào lại phòng…';
  else if (dictError) text = 'Không tải được từ điển. Hãy tải lại trang.';

  return (
    <div className={styles.banner} role="status" hidden={!text}>
      {text}
    </div>
  );
}
