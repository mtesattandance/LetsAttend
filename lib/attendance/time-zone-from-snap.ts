import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";

export function timeZoneFromUserSnapshot(snap: DocumentSnapshot<DocumentData>): string {
  const raw = snap.get("timeZone");
  return normalizeTimeZoneId(typeof raw === "string" ? raw : undefined);
}
