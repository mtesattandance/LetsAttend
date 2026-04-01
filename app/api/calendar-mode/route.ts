import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const snap = await adminDb().doc("system/appSettings").get();
  const mode = snap.exists && snap.get("calendarMode") === "ad" ? "ad" : "bs";
  return Response.json({ mode });
}
