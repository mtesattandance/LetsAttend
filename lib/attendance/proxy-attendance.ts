import type { DocumentSnapshot } from "firebase-admin/firestore";

function asStringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

export function assignedSitesOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  return b.some((x) => setA.has(x));
}

/**
 * Whether `caller` may record check-in / switch / check-out for `subject` (friend phone / kiosk).
 * - Admins may record for any employee.
 * - Employees may record for another employee only if they share at least one assigned site
 *   (or both have no site assignments, same as loose check-in rules).
 */
export function canRecordAttendanceFor(
  callerSnap: DocumentSnapshot,
  subjectSnap: DocumentSnapshot
): boolean {
  const callerRole = (callerSnap.get("role") as string | undefined) ?? "";
  const subjectRole = (subjectSnap.get("role") as string | undefined) ?? "";

  if (callerRole === "admin" || callerRole === "super_admin") {
    return (
      subjectRole === "employee" ||
      subjectRole === "admin" ||
      subjectRole === "super_admin"
    );
  }

  if (callerRole !== "employee" || subjectRole !== "employee") {
    return false;
  }

  const ca = asStringList(callerSnap.get("assignedSites"));
  const sa = asStringList(subjectSnap.get("assignedSites"));

  if (ca.length === 0 && sa.length === 0) return true;
  if (ca.length === 0 || sa.length === 0) return false;
  return assignedSitesOverlap(ca, sa);
}
