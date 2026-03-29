"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ensureEmployeeUserDoc } from "@/lib/firebase/ensure-employee-user-doc";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = auth.currentUser;
      if (!u?.email) throw new Error("Missing email on account.");

      await u.reload();
      await u.getIdToken(true);

      let displayName = u.displayName ?? u.email.split("@")[0] ?? "Employee";
      try {
        const raw = sessionStorage.getItem("attendance_pending_profile");
        if (raw) {
          const p = JSON.parse(raw) as { name?: string; email?: string };
          if (
            p.email?.toLowerCase() === u.email?.toLowerCase() &&
            typeof p.name === "string" &&
            p.name.trim()
          ) {
            displayName = p.name.trim();
            sessionStorage.removeItem("attendance_pending_profile");
          }
        }
      } catch {
        /* ignore */
      }

      await ensureEmployeeUserDoc(u, displayName);
      router.replace("/dashboard/employee");
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code ?? "")
          : "";
      if (e instanceof Error && e.message === "VERIFY_EMAIL") {
        setError("Could not open your workspace profile. Try again or use Google sign-in below.");
      } else if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found" ||
        code === "auth/invalid-email"
      ) {
        setError("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Try again in a few minutes.");
      } else if (e instanceof Error && e.message) {
        setError(e.message);
      } else {
        setError("Sign-in failed. Try again.");
      }
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
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);

      const u = auth.currentUser;
      if (!u?.uid || !u.email) throw new Error("Google sign-in failed.");
      await u.reload();
      await u.getIdToken(true);
      const name = u.displayName ?? u.email.split("@")[0] ?? "Employee";
      await ensureEmployeeUserDoc(u, name);

      router.replace("/dashboard/employee");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign-in failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Sign in with email and password, or use Google at the bottom.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <label className="flex flex-col gap-1.5">
            <span className={formFieldLabelClass}>Email</span>
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={formFieldLabelClass}>Password</span>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className={cn(
                  "absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg",
                  "text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900",
                  "dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                )}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
          {error ? (
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-200/90 dark:border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-zinc-500 dark:text-zinc-400">OR</span>
          </div>
        </div>

        <Button type="button" variant="secondary" onClick={() => void signInWithGoogle()} disabled={busy}>
          {busy ? "Working…" : "Continue with Google"}
        </Button>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          No account?{" "}
          <Link
            href="/signup"
            className="font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-400"
          >
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
