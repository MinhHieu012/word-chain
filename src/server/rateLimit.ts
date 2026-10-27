import { config } from './config.ts';

// Số lần JOIN/REJOIN thất bại theo IP, cửa sổ 1 phút (chống dò mã phòng).
const joinFails = new Map<string, { count: number; resetAt: number }>();

export function isJoinLimited(ip: string): boolean {
  const f = joinFails.get(ip);
  return !!f && f.resetAt > Date.now() && f.count >= config.joinFailsPerMinute;
}

export function recordJoinFail(ip: string): void {
  const now = Date.now();
  const f = joinFails.get(ip);
  if (!f || f.resetAt <= now) joinFails.set(ip, { count: 1, resetAt: now + 60_000 });
  else f.count++;
}

export function pruneJoinFails(): void {
  const now = Date.now();
  for (const [ip, f] of joinFails) if (f.resetAt <= now) joinFails.delete(ip);
}

/** Cửa sổ 1 giây cho message trong ván, mỗi kết nối một bộ đếm. */
export class MessageRate {
  private windowStart = 0;
  private count = 0;

  exceeded(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.count = 0;
    }
    return ++this.count > config.messagesPerSecond;
  }
}
