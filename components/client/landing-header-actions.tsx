"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { nameToInitials } from "@/lib/profile/initials";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingHeaderActions() {
  const [profile, setProfile] = React.useState<{ name: string } | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setProfile(null);
        setReady(true);
        return;
      }
      try {
        const db = getFirebaseDb();
        const snap = await getDoc(doc(db, "users", u.uid));
        const name =
          (snap.data()?.name as string) ||
          u.displayName ||
          u.email?.split("@")[0] ||
          "User";
        setProfile({ name });
      } catch {
        setProfile({
          name: u.displayName || u.email?.split("@")[0] || "User",
        });
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) {
    return <div className="h-9 w-28 animate-pulse rounded-full bg-white/10" aria-hidden />;
  }

  if (profile) {
    return (
      <Link
        href="/dashboard/settings"
        className={cn(
          "flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3",
          "transition hover:bg-white/10"
        )}
      >
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            "bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-semibold text-white"
          )}
        >
          {nameToInitials(profile.name)}
        </span>
        <span className="max-w-[min(40vw,180px)] truncate text-sm font-medium text-foreground">
          {profile.name}
        </span>
      </Link>
    );
  }

  return (
    <Button variant="secondary" asChild>
      <Link href="/login">Sign in</Link>
    </Button>
  );
}
