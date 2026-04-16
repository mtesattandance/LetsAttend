import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export async function createNotification(
  db: Firestore,
  params: {
    userId: string;
    title: string;
    body: string;
    kind:
      | "assignment"
      | "system"
      | "overtime_request"
      | "overtime_approved"
      | "overtime_rejected"
      | "offsite_request"
      | "offsite_approved"
      | "offsite_rejected"
      | "login_request"
      | "login_approved"
      | "login_rejected"
      | "manual_punch_request"
      | "manual_punch_approved"
      | "manual_punch_rejected";
    /** For assignment: sites the worker may use for check-in (drives Work deep link). */
    assignedSiteIds?: string[];
    /** Optional link for CTAs in the notification page. */
    link?: string;
  }
): Promise<string> {
  const ref = await db.collection("notifications").add({
    userId: params.userId,
    title: params.title,
    body: params.body,
    kind: params.kind,
    ...(params.assignedSiteIds !== undefined
      ? { assignedSiteIds: params.assignedSiteIds }
      : {}),
    ...(params.link !== undefined ? { link: params.link } : {}),
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
