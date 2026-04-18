import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { serializeFirestoreForJson } from "@/lib/firestore/serialize-for-json";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

// POST handled natively in Checkin/Checkout API

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") || "pending";
  const siteIdFilter = searchParams.get("siteId");
  const typeFilter = searchParams.get("type"); // 'overtime' or 'late'

  const db = adminDb();
  const isAdmin = (await assertAdmin(uid, email)) === null;

  let query = db.collection("attendance") as any;

  if (!isAdmin) {
    query = query.where("workerId", "==", uid);
  }

  if (statusFilter === "pending") {
    query = query.where("status", "==", "pending_admin_approval");
  } else if (statusFilter === "rejected") {
    query = query.where("status", "==", "rejected");
  } else if (statusFilter === "approved") {
    query = query.where("status", "==", "present");
  }

  try {
    // Cannot use orderBy combined with where without a composite index, so fetch and sort in memory API-side.
    const snap = await query.limit(200).get();

    let items = snap.docs.map((d: any) => {
      const data = d.data();
      return serializeFirestoreForJson({
        id: d.id,
        workerId: data.workerId,
        date: data.date,
        siteId: data.siteId,
        status: data.status === "pending_admin_approval" ? "pending" : (data.status === "present" ? "approved" : "rejected"),
        createdAt: data.updatedAt,
        overtimeCheckIn: data.checkIn,
        overtimeCheckOut: data.checkOut,
        reason: `[Checkin: ${data.checkInTag || "regular"}] [Checkout: ${data.checkOutTag || "regular"}]`,
      });
    });

    items.sort((a: any, b: any) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });

    if (statusFilter === "approved") {
      items = items.filter((i: any) => i.reason.includes("overtime") || i.reason.includes("late"));
    }

    if (typeFilter === "overtime") {
      items = items.filter((i: any) => i.reason.includes("overtime"));
    } else if (typeFilter === "late") {
      items = items.filter((i: any) => i.reason.includes("late"));
    }
    
    if (siteIdFilter?.trim()) {
      const sid = siteIdFilter.trim();
      items = items.filter((row: any) => row.siteId === sid);
    }
    
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch attendance" }, { status: 500 });
  }
}
