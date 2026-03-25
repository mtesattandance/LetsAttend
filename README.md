# LetsAttend

Attendance app: **Next.js**, **Firebase Auth + Firestore**, **Vercel Blob**, GPS check-in/out, admin dashboard.

## Setup

See [docs/SETUP.md](./docs/SETUP.md) for Firebase, env vars, Firestore rules, and Vercel.

## Develop

Requires **Node 20.9+** and **pnpm 9+** (Corepack will use the version in `packageManager`).

```bash
corepack enable
pnpm install
cp .env.example .env.local
# edit .env.local with your keys
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

- Set all server env vars on the host (Firebase Admin JSON, `BLOB_READ_WRITE_TOKEN`, `SUPER_ADMIN_EMAIL`, etc.).
- `next.config` uses **`output: "standalone"`** for a minimal Node bundle (useful for Docker); Vercel works with this build as usual.

## Deploy

Vercel: connect the repo, set **Install Command** to `pnpm install` if needed, add env vars from `.env.example`.
