# LetsAttend — Firebase, Vercel Blob, and GPS setup

This project uses **Next.js App Router** (server-first), **Firebase Auth + Firestore**, **Vercel Blob** for selfies, and **browser Geolocation** with **Haversine** validation on the server.

### Prerequisites

- **Node.js** 20.9 or newer
- **pnpm** 9+ (recommended: enable Corepack so the repo’s `packageManager` version is used)

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

---

## 1. Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Add project** → name it (e.g. `letsattend-prod`).
2. Disable Google Analytics if you do not need it (optional).
3. **Build** → **Authentication** → **Get started** → enable:
   - **Email/Password**
   - **Google** (for the “verify via same email” flow later)
4. **Build** → **Firestore Database** → **Create database** → start in **production mode** (you will deploy rules from this repo: `firestore.rules`).

### Web app config (client env)

1. Project **Settings** (gear) → **Your apps** → **Web** (`</>`) → register app.
2. Copy the `firebaseConfig` values into `.env.local` using the names in `.env.example` (`NEXT_PUBLIC_FIREBASE_*`).

### Service account (server / API routes)

1. Project **Settings** → **Service accounts** → **Generate new private key**.
2. Download the JSON.

   Option A (recommended for reliability): create a file `service-account.json` in the project root and set:

   `FIREBASE_SERVICE_ACCOUNT_KEY_FILE=./service-account.json`

   Option B: set `FIREBASE_SERVICE_ACCOUNT_KEY` as a single-line JSON string where the `private_key` newlines are escaped as `\\n`.

3. On **Vercel**: use Option A only if you can provide the JSON securely as an env var/file artifact; otherwise use Option B (single-line JSON). Never commit the service account file.

### Firestore collections (logical schema)

| Collection       | Purpose |
|-----------------|--------|
| `users`         | Profile, `role`, `assignedSites` |
| `sites`         | `name`, `latitude`, `longitude`, `radius` (meters) |
| `attendance`    | Daily doc id `{workerId}_{YYYY-MM-DD}` (UTC key in code) |
| `live_tracking` | One doc per worker `{workerId}` |

Indexes: not required for the starter APIs (single-doc reads/writes). Add composite indexes when you build analytics queries.

### Deploy Firestore rules

1. Install [Firebase CLI](https://firebase.google.com/docs/cli#install_the_cli) (e.g. `npm i -g firebase-tools` or `pnpm add -g firebase-tools`) → `firebase login`.
2. In project root, add a `firebase.json` if you use CLI deploy, or paste `firestore.rules` manually in **Firestore** → **Rules**.

**Critical:** the email in `firestore.rules` (`isSuperAdminEmail()`) must match the account you use as super admin. It is set to match `.env.example`; if you use a different address, update **both** the rules and env.

Also set:

- `SUPER_ADMIN_EMAIL` (server, admin API bypass)
- `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` (optional UI parity)

---

## 2. Super admin and roles (final rules behavior)

- **`isSuperAdminEmail()`** in `firestore.rules` matches `request.auth.token.email` to your fixed super admin address. That account bypasses normal role checks for user updates/deletes (see rules file).
- **Self-signup** creates `users/{uid}` with `role: "employee"` only (enforced in rules).
- **Admins** (`role` in `admin` / `super_admin` on their user doc) can manage `sites` and read broad data per rules.
- **Rule:** regular **admins cannot promote** someone to `admin` / `super_admin` via client writes; only the **super admin email** path can change privileged roles (or use Admin SDK / Console intentionally).

To promote your first admin after signup:

1. Sign in once as super admin email, **or**
2. In Console, edit the user document `role` / `assignedSites`, **or**
3. Use a one-off script with Admin SDK.

**Attendance / live_tracking:** client **cannot** write directly; only your Next.js APIs using **Firebase Admin** write those collections. Clients may **read** according to rules (own worker or admin).

---

## 3. Google “no OTP” verification pattern

1. User signs up with **email/password** → `sendEmailVerification` (optional but recommended).
2. User completes **Google sign-in** with the **same email** → Firebase links providers; you treat verified email + linked Google as your policy.
3. Enforce in UI/API as needed (e.g. require `user.emailVerified` or linked provider).

Exact linking UX can be a small client flow (`linkWithPopup` / `linkWithCredential`); this repo documents the pattern; wire it when you harden auth.

---

## 4. Vercel Blob (selfies)

1. In [Vercel Dashboard](https://vercel.com/dashboard) → your project → **Storage** → **Blob** → create store.
2. Create a **read/write token** and set `BLOB_READ_WRITE_TOKEN` in `.env.local` and Vercel env.
3. Flow: client compresses to **WebP** → POST `/api/upload` with `base64` data URL → server `put()` to Blob → returns `url` → check-in API stores `photoUrl` in Firestore.

### 7-day cleanup (cron)

Use **Vercel Cron** or an external scheduler hitting a **secret-protected** route that lists/deletes blobs older than retention (implement using Blob SDK list + del). Store `uploadedAt` metadata if you need precise cutoff.

---

## 5. GPS and validation

- Browser: `navigator.geolocation.getCurrentPosition` (HTTPS required on real devices).
- Server: `lib/geo/haversine.ts` + `lib/geo/validate-site.ts` compare user lat/lng to `sites/{id}` center and `radius` (meters).
- **Never trust the client:** latitude/longitude are re-validated on every check-in/out API.

### Fake GPS / jumps

For production, add heuristics: max speed between pings, accuracy thresholds, anomaly flags — see roadmap in your master spec.

---

## 6. Local development

```bash
cp .env.example .env.local
# fill Firebase + Blob + SUPER_ADMIN_EMAIL + service account JSON
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 7. Deploying to Vercel

1. Push the repo → **Import** in Vercel.
2. Set **Install Command** to `pnpm install` (or leave default if Vercel detects `pnpm-lock.yaml`).
3. Set **all** env vars from `.env.example`.
4. Ensure `FIREBASE_SERVICE_ACCOUNT_KEY` (or file-based / `GOOGLE_APPLICATION_CREDENTIALS` on your host) and `BLOB_READ_WRITE_TOKEN` are set for **Production**.

Self-hosted Docker-style runs can use `pnpm build` then start from `.next/standalone` (see [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)).

---

## 8. “Missing or insufficient permissions” (Firestore)

Common causes:

1. **Rules not deployed** — Publish `firestore.rules` in the Firebase console.
2. **Super-admin email mismatch** — The address in `isSuperAdminEmail()` must match the signed-in Auth email exactly; align `SUPER_ADMIN_EMAIL` / `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` the same way.
3. **`/api/admin/*` failing** — Admin aggregates use the **Firebase Admin** service account on the server; set `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY_FILE`, or `GOOGLE_APPLICATION_CREDENTIALS` on the host.

---

## 9. Security checklist

- [ ] Firestore rules published; super admin email replaced.
- [ ] Service account key only in server env.
- [ ] Blob token not exposed to client (only server uses it).
- [ ] Rate limiting on `/api/*` (add middleware or Vercel KV / Upstash) — recommended before public launch.
- [ ] CORS: APIs are same-origin by default for the Next app.

---

Questions or changes to the ruleset should be done in `firestore.rules` and redeployed; keep **Admin SDK** paths in sync for any new collections.
