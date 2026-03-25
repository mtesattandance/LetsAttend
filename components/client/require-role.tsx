"use client";

import { onAuthStateChanged } from "firebase/auth";
import * as React from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";

const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

export function RequireRole({
  allowedRoles,
  fallbackTo,
  children,
}: {
  allowedRoles: string[];
  fallbackTo: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const role = (snap.data()?.role as string | undefined) ?? undefined;
        const superRole = SUPER_ADMIN_EMAIL && u.email === SUPER_ADMIN_EMAIL ? "super_admin" : null;
        const effectiveRole = superRole ?? role;
        if (cancelled) return;
        setReady(true);

        if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
          router.replace(fallbackTo);
        }
      } catch {
        if (!cancelled) {
          setReady(true);
          router.replace(fallbackTo);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [allowedRoles, fallbackTo, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Loading permissions…
      </div>
    );
  }

  return <>{children}</>;
}

