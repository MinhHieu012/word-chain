// Phiên chơi của tab hiện tại, lưu trong sessionStorage để tải lại trang vẫn vào lại được phòng.
export interface Session {
  roomId: string;
  playerId: string;
  rejoinToken: string;
}

const KEY = 'word-chain-session';

export function loadSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Trình duyệt chặn storage: vẫn chơi được, chỉ mất khả năng vào lại sau khi tải lại trang.
  }
}
