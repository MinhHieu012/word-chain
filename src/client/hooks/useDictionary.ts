import { useEffect, useState } from 'react';
import { DICT_VERSION, makeDict, type Dict } from '../../shared/game.ts';

/** Tải từ điển một lần khi mở trang. */
export function useDictionary() {
  const [dict, setDict] = useState<Dict | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/dict-${DICT_VERSION}.txt`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => !cancelled && setDict(makeDict(text, DICT_VERSION)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { dict, error };
}
