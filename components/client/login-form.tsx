"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const ensureUserDoc = React.useCallback(
    async (uid: string, name: string, emailAddr: string) => {
      const db = getFirebaseDb();
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return;

      // Must match Firestore rules: role=employee, email matches Auth token email.
      await setDoc(ref, {
        name,
        email: emailAddr,
        role: "employee",
        assignedSites: [],
        createdAt: serverTimestamp(),
      });
    },
    []
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = auth.currentUser;
      if (u?.uid && u.email) {
        const name = u.displayName ?? u.email.split("@")[0] ?? "Employee";
        await ensureUserDoc(u.uid, name, u.email);
      }
      router.replace("/dashboard/employee");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      const u = auth.currentUser;
      if (!u?.uid || !u.email) throw new Error("Google sign-in failed.");
      const name = u.displayName ?? u.email.split("@")[0] ?? "Employee";
      await ensureUserDoc(u.uid, name, u.email);

      router.replace("/dashboard/employee");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign-in failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-white/10">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use email/password or sign in with Google (no OTP).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-zinc-500">OR</span>
            </div>
          </div>

          <Button type="button" variant="secondary" onClick={() => void signInWithGoogle()} disabled={busy}>
            {busy ? "Working…" : "Continue with Google"}
          </Button>

          <p className="text-center text-sm text-zinc-500">
            No account?{" "}
            <Link href="/signup" className="text-cyan-400 hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
