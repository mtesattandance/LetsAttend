"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithPopup,
  sendEmailVerification,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [awaitingGoogle, setAwaitingGoogle] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await sendEmailVerification(cred.user);
      const db = getFirebaseDb();
      await setDoc(doc(db, "users", cred.user.uid), {
        name: name.trim(),
        email: email.trim(),
        role: "employee",
        assignedSites: [],
        createdAt: serverTimestamp(),
      });
      setAwaitingGoogle(true);
    } catch {
      setError("Could not sign up. Email may already be in use.");
    } finally {
      setBusy(false);
    }
  };

  const verifyWithGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("No active session.");

      const provider = new GoogleAuthProvider();
      await linkWithPopup(user, provider);
      router.replace("/dashboard/employee");
    } catch (e) {
      // Common codes: auth/credential-already-in-use, auth/provider-already-linked
      const msg = e instanceof Error ? e.message : "Google verification failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-white/10">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          1) Create account with email/password 2) Verify email 3) Link Google
          (same email) to complete verification — no OTP.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!awaitingGoogle ? (
          <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Full name</span>
            <input
              required
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
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
              minLength={8}
              autoComplete="new-password"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Sign up"}
          </Button>
          <p className="text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="text-cyan-400 hover:underline">
              Sign in
            </Link>
          </p>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-300">
              Account created. Now verify your email, then click the Google button
              below. Firebase will link providers only when the email matches.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="button" disabled={busy} onClick={() => void verifyWithGoogle()}>
              {busy ? "Linking Google…" : "Verify with Google"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setAwaitingGoogle(false);
                setError(null);
              }}
            >
              Back
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
