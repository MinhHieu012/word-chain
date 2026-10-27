import { useEffect, useRef } from 'react';
import type { GameState } from '../../shared/game.ts';
import styles from './WordChain.module.css';

interface Props {
  words: GameState['words'];
  me: string | null;
  meFirst: boolean;
}

export function WordChain({ words, me, meFirst }: Props) {
  const lastRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    lastRef.current?.scrollIntoView({ block: 'end' });
  }, [words.length]);

  return (
    <ol className={styles.chain} aria-label="Chuỗi từ đã nối">
      {words.length === 0 && (
        <li className={styles.empty}>
          {meFirst ? 'Bạn đi trước.' : 'Đối thủ đi trước.'}
          <br />
          Từ đầu tiên là bất kỳ từ nào có 2 tiếng.
        </li>
      )}
      {words.map((w, i) => {
        const mine = w.by === me;
        const [first, second] = w.word.split(' ');
        return (
          <li
            key={i}
            ref={i === words.length - 1 ? lastRef : undefined}
            className={`${styles.bubble} ${mine ? styles.me : styles.opp}`}
            aria-label={`${mine ? 'Bạn' : 'Đối thủ'}: ${w.word}`}
          >
            {i > 0 ? (
              <>
                <span className={styles.link}>{first}</span> {second}
              </>
            ) : (
              w.word
            )}
          </li>
        );
      })}
    </ol>
  );
}
