/** Parse "HH:mm" 24h UTC. Returns null if invalid. */
export function parseUtcHm(s: string): { h: number; m: number } | null {
  const t = s.trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

/** Milliseconds UTC at `dayKey` (YYYY-MM-DD) + HH:mm on that calendar day. */
export function utcMillisForDayAndHm(dayKey: string, hhmm: string): number | null {
  const hm = parseUtcHm(hhmm);
  if (!hm) return null;
  const parts = dayKey.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [y, mo, d] = parts;
  if (!y || !mo || !d) return null;
  return Date.UTC(y, mo - 1, d, hm.h, hm.m, 0, 0);
}

export function previousUtcDayKey(dayKey: string): string {
  const [y, mo, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, mo! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
