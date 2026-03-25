import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let adminApp: App | undefined;

function initAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const parseFromEnv = () => {
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) return null;
    raw = raw.trim();
    if (
      (raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith('"') && raw.endsWith('"'))
    ) {
      raw = raw.slice(1, -1);
    }
    try {
      return JSON.parse(raw) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
    } catch {
      // Often caused by pasting multi-line JSON into .env without converting to a single line.
      return null;
    }
  };

  const parseFromFile = () => {
    const p = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FILE;
    if (!p) return null;
    try {
      // Avoid tracing the whole repo into serverless NFT output (Next.js / Turbopack).
      const abs = resolve(/* turbopackIgnore: true */ process.cwd(), p);
      const txt = readFileSync(abs, "utf8");
      return JSON.parse(txt) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
    } catch {
      return null;
    }
  };

  const cred = parseFromEnv() ?? parseFromFile();
  if (cred?.project_id && cred?.client_email && cred?.private_key) {
    adminApp = initializeApp({
      credential: cert({
        projectId: cred.project_id,
        clientEmail: cred.client_email,
        privateKey: cred.private_key.replace(/\\n/g, "\n"),
      }),
    });
    return adminApp;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      adminApp = initializeApp({ credential: applicationDefault() });
      return adminApp;
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    "Firebase Admin service account not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY to a one-line JSON string, or FIREBASE_SERVICE_ACCOUNT_KEY_FILE to a service account .json path, or set GOOGLE_APPLICATION_CREDENTIALS to that json file path."
  );
}

/** True if Admin SDK can initialize (env / JSON file / ADC). Used before verifying ID tokens. */
export function isFirebaseAdminConfigured(): boolean {
  try {
    initAdminApp();
    return true;
  } catch {
    return false;
  }
}

export function adminAuth() {
  return getAuth(initAdminApp());
}

export function adminDb() {
  return getFirestore(initAdminApp());
}

export { FieldValue };
