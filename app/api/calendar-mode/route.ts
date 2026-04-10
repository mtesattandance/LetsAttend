import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import {
  getCalendarModeCache,
  setCalendarModeCache,
  CALENDAR_MODE_CACHE_TTL_MS,
} from "@/lib/cache/calendar-mode-cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const cached = getCalendarModeCache();
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ mode: cached.mode });
  }

  const snap = await adminDb().doc("system/appSettings").get();
  const mode = snap.exists && snap.get("calendarMode") === "ad" ? "ad" : "bs";
  setCalendarModeCache({ mode, expiresAt: Date.now() + CALENDAR_MODE_CACHE_TTL_MS });
  return Response.json({ mode });
}
