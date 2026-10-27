import { useState, type FormEvent } from 'react';
import styles from './WordInput.module.css';

interface Props {
  turn: number;
  canSend: boolean;
  hint: string;
  serverError: string;
  /** Trả về câu báo lỗi nếu từ không hợp lệ, null nếu đã gửi. */
  onSubmit: (word: string) => string | null;
}

// Ô nhập luôn bật để bàn phím điện thoại không bị đóng giữa các lượt; chỉ nút Gửi bị khóa.
export function WordInput({ turn, canSend, hint, serverError, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [errorTurn, setErrorTurn] = useState(turn);
  // Sang lượt mới thì xóa lỗi cũ, nhưng giữ nguyên ô nhập (và focus).
  if (turn !== errorTurn) {
    setErrorTurn(turn);
    setError('');
  }
  const shown = error || serverError;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const err = onSubmit(value);
    setError(err ?? '');
    if (!err) setValue('');
  }

  return (
    <form className={styles.composer} onSubmit={submit} noValidate>
      <p className="hint" id="word-hint">{hint}</p>
      <div className={styles.row}>
        <label className="visually-hidden" htmlFor="input-word">Nhập từ</label>
        <input
          className="input"
          id="input-word"
          lang="vi"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="Nhập từ 2 tiếng"
          aria-describedby="word-error word-hint"
          aria-invalid={!!shown}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={!canSend}>
          Gửi
        </button>
      </div>
      <p className="field-error" id="word-error" role="alert">{shown}</p>
    </form>
  );
}
