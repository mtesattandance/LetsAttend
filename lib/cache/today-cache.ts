// Shared cache module — imported by checkin/checkout routes to invalidate today's attendance cache
export const todayCache = new Map<string, { data: unknown; expiresAt: number }>();

export function invalidateTodayCache(uid: string) {
  for (const key of todayCache.keys()) {
    if (key.startsWith(`${uid}:`)) todayCache.delete(key);
  }
}
