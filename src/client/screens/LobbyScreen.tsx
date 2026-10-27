import { useState } from 'react';
import type { GameState } from '../../shared/game.ts';
import { Icon } from '../components/Icon.tsx';
import { PlayerList } from '../components/PlayerList.tsx';
import type { RoomApi } from '../hooks/useRoom.ts';
import styles from './LobbyScreen.module.css';

interface Props {
  room: RoomApi;
  game: GameState;
  dictReady: boolean;
  bothOnline: boolean;
  onStart: () => void;
}

export function LobbyScreen({ room, game, dictReady, bothOnline, onStart }: Props) {
  const { state, me } = room;
  const code = state.session?.roomId ?? '';
  const isHost = state.hostId === me;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Sao chép mã phòng:', code); // clipboard chỉ có trên https
    }
  }

  function share() {
    navigator
      .share({ title: 'Nối Từ', text: `Vào chơi nối từ với mình! Mã phòng: ${code}`, url: `${location.origin}/?room=${code}` })
      .catch(() => {});
  }

  let notice = '';
  if (game.phase === 'over' && game.reason === 'OPPONENT_LEFT' && game.winner === me && state.players.length < 2) {
    notice = 'Đối thủ đã rời phòng. Bạn thắng ván vừa rồi!';
  }
  if (game.reason === 'DICT_MISMATCH') notice = 'Từ điển của bạn khác phiên bản với chủ phòng. Hãy tải lại trang.';

  let hint = '';
  if (!dictReady) hint = 'Đang tải từ điển…';
  else if (state.players.length < 2) hint = 'Gửi mã phòng cho bạn bè để bắt đầu.';
  else if (!bothOnline) hint = 'Đối thủ đang mất kết nối…';
  else if (!isHost) hint = 'Chờ chủ phòng bắt đầu…';

  return (
    <section className="screen" aria-labelledby="lobby-title">
      <header className="topbar">
        <h2 id="lobby-title">Phòng chờ</h2>
        <button className="btn btn-ghost btn-small" type="button" onClick={room.leave}>
          Rời phòng
        </button>
      </header>

      <div className={`card ${styles.codeCard}`}>
        <p className="label">Gửi mã này cho bạn của bạn</p>
        <p className={styles.code} aria-live="polite">{code}</p>
        <div className="row">
          <button className="btn btn-secondary" type="button" onClick={copy}>
            <Icon name="copy" />
            <span>{copied ? 'Đã chép!' : 'Sao chép'}</span>
          </button>
          {'share' in navigator && (
            <button className="btn btn-secondary" type="button" onClick={share}>
              <Icon name="share" />
              <span>Chia sẻ</span>
            </button>
          )}
        </div>
      </div>

      {notice && <p className="notice">{notice}</p>}

      <PlayerList players={state.players} me={me} hostId={state.hostId} />

      {isHost && (
        <button className="btn btn-primary btn-block" type="button" disabled={!(bothOnline && dictReady && state.inRoom)} onClick={onStart}>
          Bắt đầu
        </button>
      )}
      <p className="hint" aria-live="polite">{hint}</p>
    </section>
  );
}
