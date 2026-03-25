import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { attendanceDayKeyUTC } from "@/lib/date/today-key";
import { previousUtcDayKey, utcMillisForDayAndHm } from "@/lib/site/utc-day-time";

function placeholderPhotoUrl(): string {
  return (
    process.env.AUTO_CHECKOUT_PLACEHOLDER_URL?.trim() ||
    "https://invalid.invalid/attendance-auto-checkout"
  );
}

export async function runAutoCheckout(): Promise<{ processed: number; errors: string[] }> {
  const db = adminDb();
  const today = attendanceDayKeyUTC();
  const yesterday = previousUtcDayKey(today);
  const errors: string[] = [];
  let processed = 0;

  const snap = await db.collection("attendance").where("date", "in", [today, yesterday]).get();

  for (const doc of snap.docs) {
    const data = doc.data() as {
      checkIn?: unknown;
      checkOut?: unknown;
      siteId?: string;
      date?: string;
    };
    if (!data.checkIn || data.checkOut) continue;

    const dayKey = typeof data.date === "string" ? data.date : "";
    if (!dayKey) continue;

    const siteId = typeof data.siteId === "string" ? data.siteId : "";
    if (!siteId) continue;

    try {
      const siteSnap = await db.collection("sites").doc(siteId).get();
      if (!siteSnap.exists) continue;
      const site = siteSnap.data()!;
      const hhmm =
        typeof site.autoCheckoutUtc === "string" && site.autoCheckoutUtc.trim()
          ? site.autoCheckoutUtc.trim()
          : "23:59";

      const deadline = utcMillisForDayAndHm(dayKey, hhmm);
      if (deadline == null) continue;

      const now = Date.now();
      const shouldClose =
        dayKey < today || (dayKey === today && now >= deadline);

      if (!shouldClose) continue;

      const lat = Number(site.latitude);
      const lng = Number(site.longitude);
      const t = FieldValue.serverTimestamp();

      await doc.ref.set(
        {
          checkOut: {
            time: t,
            gps: {
              latitude: Number.isFinite(lat) ? lat : 0,
              longitude: Number.isFinite(lng) ? lng : 0,
            },
            photoUrl: placeholderPhotoUrl(),
            auto: true,
          },
          updatedAt: t,
        },
        { merge: true }
      );
      processed++;
    } catch (e) {
      errors.push(`${doc.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processed, errors };
}
