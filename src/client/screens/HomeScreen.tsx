import { useState, type FormEvent } from 'react';
import type { RoomApi } from '../hooks/useRoom.ts';
import styles from './HomeScreen.module.css';

const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const roomFromUrl = () => (new URLSearchParams(location.search).get('room') ?? '').toUpperCase().slice(0, 6);

export function HomeScreen({ room }: { room: RoomApi }) {
  const { state } = room;
  const [code, setCode] = useState(roomFromUrl);
  const ready = state.status === 'open' && !state.pending;
  const error = state.homeError;

  function join(e: FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!CODE_PATTERN.test(value)) room.setHomeError('Mã phòng gồm 6 ký tự.');
    else room.joinRoom(value);
  }

  return (
    <section className="screen" aria-labelledby="home-title">
      <header className={styles.brand}>
        <h1 id="home-title">Nối&nbsp;Từ</h1>
        <p className={styles.tagline}>Đấu 1-1 với bạn bè. Mỗi lượt 20 giây.</p>
      </header>

      <div className="card">
        <button className="btn btn-primary btn-block" type="button" disabled={!ready} onClick={room.createRoom}>
          Tạo phòng mới
        </button>
      </div>

      <div className={styles.divider} aria-hidden="true">
        <span>hoặc</span>
      </div>

      <form className="card" onSubmit={join} noValidate>
        <label className="label" htmlFor="input-code">Mã phòng</label>
        <input
          className={`input ${styles.code}`}
          id="input-code"
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="KX7P4M"
          aria-describedby="home-error"
          aria-invalid={!!error}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) room.setHomeError('');
          }}
        />
        <p className="field-error" id="home-error" role="alert">{error}</p>
        <button className="btn btn-secondary btn-block" type="submit" disabled={!ready}>
          Vào phòng
        </button>
      </form>

      <details className={styles.rules}>
        <summary>Cách chơi</summary>
        <ul>
          <li>Mỗi từ gồm <strong>2 tiếng</strong> và có trong từ điển, ví dụ <em>học sinh</em>.</li>
          <li>Từ sau bắt đầu bằng tiếng cuối của từ trước: <em>học sinh → sinh viên</em>.</li>
          <li>Không dùng lại từ đã có trong ván.</li>
          <li>Hết 20 giây mà chưa nối được là thua. Nối ra từ không ai nối tiếp được là thắng.</li>
        </ul>
      </details>
    </section>
  );
}
