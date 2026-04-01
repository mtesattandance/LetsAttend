import type { Firestore } from "firebase-admin/firestore";

const STATE_DOC_PATH = "system/employeeIdState";
const PREFIX = "MTES-";

function formatEmployeeId(n: number): string {
  return `${PREFIX}${String(n).padStart(4, "0")}`;
}

function parseEmployeeNumber(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^MTES-(\d{4,})$/.exec(raw.trim().toUpperCase());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function claimEmployeeId(db: Firestore): Promise<string> {
  const stateRef = db.doc(STATE_DOC_PATH);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const data = snap.data() ?? {};
    const reusable = Array.isArray(data.reusableNumbers)
      ? data.reusableNumbers.filter((x) => Number.isInteger(x) && x > 0)
      : [];
    reusable.sort((a, b) => a - b);

    let chosen = 0;
    if (reusable.length > 0) {
      chosen = reusable[0]!;
      tx.set(
        stateRef,
        {
          reusableNumbers: reusable.slice(1),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } else {
      const nextNumber =
        typeof data.nextNumber === "number" && Number.isInteger(data.nextNumber) && data.nextNumber > 0
          ? data.nextNumber
          : 1;
      chosen = nextNumber;
      tx.set(
        stateRef,
        {
          nextNumber: nextNumber + 1,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }
    return formatEmployeeId(chosen);
  });
}

export async function releaseEmployeeId(db: Firestore, employeeId: unknown): Promise<void> {
  const n = parseEmployeeNumber(employeeId);
  if (!n) return;
  const stateRef = db.doc(STATE_DOC_PATH);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const data = snap.data() ?? {};
    const reusable = Array.isArray(data.reusableNumbers)
      ? data.reusableNumbers.filter((x) => Number.isInteger(x) && x > 0)
      : [];
    if (!reusable.includes(n)) reusable.push(n);
    reusable.sort((a, b) => a - b);
    tx.set(
      stateRef,
      {
        reusableNumbers: reusable,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });
}
