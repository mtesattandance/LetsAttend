"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import * as React from "react";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";

export type DashboardUser = {
  uid: string;
  name: string;
  email: string;
  role: string;
};

const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

const Ctx = React.createContext<{
  user: DashboardUser | null;
  loading: boolean;
  refresh: () => void;
}>({ user: null, loading: true, refresh: () => {} });

export function DashboardUserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<DashboardUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const version = React.useRef(0);

  const load = React.useCallback(async (uid: string, email: string | null) => {
    const v = ++version.current;
    try {
      const db = getFirebaseDb();
      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.data();
      const name = (data?.name as string) || email?.split("@")[0] || "User";
      let role = (data?.role as string) || "employee";
      if (SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL) {
        role = "super_admin";
      }
      const fsEmail = typeof data?.email === "string" ? data.email : "";
      if (email && snap.exists() && fsEmail !== email) {
        try {
          await updateDoc(doc(db, "users", uid), { email });
        } catch {
          /* ignore sync errors */
        }
      }
      if (v !== version.current) return;
      setUser({ uid, name, email: email ?? "", role });
    } catch {
      if (v !== version.current) return;
      setUser({
        uid,
        name: email?.split("@")[0] || "User",
        email: email ?? "",
        role: SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL ? "super_admin" : "employee",
      });
    } finally {
      if (v === version.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      void load(u.uid, u.email);
    });
    return () => unsub();
  }, [load]);

  const refresh = React.useCallback(() => {
    const u = getFirebaseAuth().currentUser;
    if (u) void load(u.uid, u.email);
  }, [load]);

  return (
    <Ctx.Provider value={{ user, loading, refresh }}>{children}</Ctx.Provider>
  );
}

export function useDashboardUser() {
  return React.useContext(Ctx);
}
