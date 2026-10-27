import { useEffect, useRef } from 'react';
import { RoomList } from '../components/RoomList.tsx';
import type { RoomApi } from '../hooks/useRoom.ts';
import styles from './RoomsScreen.module.css';

// Trang "Tất cả phòng": tải 10 phòng một lần, cuộn tới cuối thì tự tải tiếp.
export function RoomsScreen({ room, onBack }: { room: RoomApi; onBack: () => void }) {
  const { state, loadRoomPage } = room;
  const { rooms, hasMore, loading } = state.roomPage;
  const ready = state.status === 'open' && !state.pending;
  const lastOrder = rooms.at(-1)?.order;
  const moreRef = useRef<HTMLButtonElement>(null);

  // Tải trang đầu khi mở trang và mỗi lần kết nối lại.
  useEffect(() => {
    if (state.status === 'open') loadRoomPage();
  }, [state.status, loadRoomPage]);

  // Nút "Tải thêm" lọt vào màn hình thì tự tải; vẫn bấm được nếu trình duyệt không hỗ trợ.
  useEffect(() => {
    const el = moreRef.current;
    if (!el || loading || !hasMore || lastOrder === undefined) return;
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && loadRoomPage(lastOrder));
    io.observe(el);
    return () => io.disconnect();
  }, [loading, hasMore, lastOrder, loadRoomPage]);

  const firstLoad = loading && rooms.length === 0;

  return (
    <section className="screen" aria-labelledby="rooms-title">
      <header className="topbar">
        <button className="btn btn-ghost btn-small" type="button" onClick={onBack}>
          ← Quay lại
        </button>
        <button className="btn btn-secondary btn-small" type="button" disabled={!ready || loading} onClick={() => loadRoomPage()}>
          Làm mới
        </button>
      </header>
      <h2 id="rooms-title">Phòng đang chờ</h2>
      <p className="field-error" role="alert">{state.homeError}</p>

      <RoomList rooms={firstLoad ? null : rooms} disabled={!ready} onJoin={room.joinRoom} labelledBy="rooms-title" />

      {rooms.length > 0 && hasMore && (
        <button
          ref={moreRef}
          className="btn btn-ghost btn-block"
          type="button"
          disabled={loading}
          onClick={() => lastOrder !== undefined && loadRoomPage(lastOrder)}
        >
          {loading ? 'Đang tải…' : 'Tải thêm'}
        </button>
      )}
      {rooms.length > 0 && !hasMore && <p className={styles.end}>Đã hiện hết {rooms.length} phòng.</p>}
    </section>
  );
}
