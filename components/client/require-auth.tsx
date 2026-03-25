"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import * as React from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    let auth;
    try {
      auth = getFirebaseAuth();
    } catch {
      setReady(true);
      setSignedIn(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u);
      setReady(true);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Loading session…
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Redirecting to login…
      </div>
    );
  }

  return <>{children}</>;
}
