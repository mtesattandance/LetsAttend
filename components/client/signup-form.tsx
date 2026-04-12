"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
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

function firebaseErrorMessage(e: unknown): string {
  const code =
    e && typeof e === "object" && "code" in e
      ? String((e as { code?: string }).code ?? "")
      : "";
  if (code === "auth/email-already-in-use") {
    return "That email already has an account. Sign in instead.";
  }
  if (code === "auth/weak-password") {
    return "Password is too weak. Use at least 8 characters.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Google sign-in was cancelled.";
  }
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Try again.";
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submitEmailSignup = async (e: React.FormEvent) => {
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
      await cred.user.getIdToken(true);
      const display =
        name.trim() ||
        cred.user.displayName ||
        cred.user.email?.split("@")[0] ||
        "Employee";
      await ensureEmployeeUserDoc(cred.user, display);
      router.replace("/dashboard/employee/check-in");
    } catch (e) {
      setError(firebaseErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const signUpWithGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      const u = auth.currentUser;
      if (!u?.email) throw new Error("Google sign-in failed.");
      await u.reload();
      await u.getIdToken(true);
      const display =
        (name.trim() || u.displayName || u.email.split("@")[0] || "Employee").trim();
      await ensureEmployeeUserDoc(u, display);
      router.replace("/dashboard/employee/check-in");
    } catch (e) {
      setError(firebaseErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          Sign up with email and password, or use Google at the bottom.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form className="flex flex-col gap-4" onSubmit={(e) => void submitEmailSignup(e)}>
          <label className="flex flex-col gap-1.5">
            <span className={formFieldLabelClass}>Full name</span>
            <Input
              required
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
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
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
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
            {busy ? "Creating…" : "Sign up with email"}
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

        <Button type="button" variant="secondary" disabled={busy} onClick={() => void signUpWithGoogle()}>
          {busy ? "Working…" : "Continue with Google"}
        </Button>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-400"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
