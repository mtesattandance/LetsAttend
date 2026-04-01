import JSZip from "jszip";
import { DateTime } from "luxon";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

type AnyObj = Record<string, unknown>;

function collectImageUrlsFromObject(node: unknown, out: Set<string>) {
  if (!node) return;
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node) && /vercel-storage|blob|selfies\//i.test(node)) {
      out.add(node);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectImageUrlsFromObject(x, out);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as AnyObj)) collectImageUrlsFromObject(v, out);
  }
}

function sanitizeName(s: string): string {
  return s.replace(/[^\w.-]+/g, "_");
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const denied = await assertAdmin(auth.decoded.uid, auth.decoded.email);
  if (denied) return denied;

  const db = adminDb();
  const usersSnap = await db.collection("users").where("role", "==", "employee").get();
  const zip = new JSZip();

  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    const employeeId =
      (typeof u.employeeId === "string" && u.employeeId.trim()) || userDoc.id;
    const employeeName =
      (typeof u.name === "string" && u.name.trim()) || "Employee";
    const folder = zip.folder(`${sanitizeName(employeeId)}_${sanitizeName(employeeName)}`);
    if (!folder) continue;

    const profile = {
      uid: userDoc.id,
      employeeId,
      name: employeeName,
      email: typeof u.email === "string" ? u.email : "",
      designation: typeof u.designation === "string" ? u.designation : "",
      assignedSites: Array.isArray(u.assignedSites) ? u.assignedSites : [],
      timeZone: typeof u.timeZone === "string" ? u.timeZone : "",
      exportedAt: DateTime.now().toISO(),
    };
    folder.file("worker-profile.json", JSON.stringify(profile, null, 2));

    const [attendance, overtime, offsite] = await Promise.all([
      db.collection("attendance").where("workerId", "==", userDoc.id).get(),
      db.collection("overtimeRequests").where("workerId", "==", userDoc.id).get(),
      db.collection("offsiteWorkRequests").where("workerId", "==", userDoc.id).get(),
    ]);

    const attendanceRows = attendance.docs.map((d) => ({ id: d.id, ...d.data() }));
    const overtimeRows = overtime.docs.map((d) => ({ id: d.id, ...d.data() }));
    const offsiteRows = offsite.docs.map((d) => ({ id: d.id, ...d.data() }));

    folder.file("attendance.json", JSON.stringify(attendanceRows, null, 2));
    folder.file("overtime-requests.json", JSON.stringify(overtimeRows, null, 2));
    folder.file("offsite-requests.json", JSON.stringify(offsiteRows, null, 2));

    const imageUrls = new Set<string>();
    collectImageUrlsFromObject(attendanceRows, imageUrls);
    collectImageUrlsFromObject(overtimeRows, imageUrls);
    const imageFolder = folder.folder("images");
    if (imageFolder) {
      let idx = 1;
      for (const url of imageUrls) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            imageFolder.file(`missing-${idx}.txt`, url);
            idx++;
            continue;
          }
          const bytes = await res.arrayBuffer();
          const extMatch = /(?:\.([a-zA-Z0-9]+))(?:\?|$)/.exec(url);
          const ext = extMatch?.[1] ?? "bin";
          imageFolder.file(`image-${idx}.${ext}`, Buffer.from(bytes));
          idx++;
        } catch {
          imageFolder.file(`missing-${idx}.txt`, url);
          idx++;
        }
      }
    }
  }

  const output = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  return new Response(Buffer.from(output), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="workers-archive-${DateTime.now().toFormat("yyyy-LL-dd")}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
