"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import * as React from "react";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";

export type DashboardUser = {
  uid: string;
  name: string;
  email: string;
  role: string;
  designation?: string;
  employeeId?: string;
  /** Employee work sites (from Firestore). Empty until an admin assigns. */
  assignedSites: string[];
  /** IANA timezone for attendance calendar days (default Nepal). */
  timeZone: string;
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

  /** No-op: user doc is kept in sync via `onSnapshot`. Call sites still invoke this after writes. */
  const refresh = React.useCallback(() => {}, []);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    let unsubDoc: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubDoc?.();
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const db = getFirebaseDb();
      const userRef = doc(db, "users", u.uid);

      unsubDoc = onSnapshot(
        userRef,
        async (snap) => {
          const email = u.email;
          const data = snap.data();
          const name = (data?.name as string) || email?.split("@")[0] || "User";
          let role = (data?.role as string) || "employee";
          if (SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL) {
            role = "super_admin";
          }
          const fsEmail = typeof data?.email === "string" ? data.email : "";
          const assignedSites = Array.isArray(data?.assignedSites)
            ? (data.assignedSites as unknown[]).filter((x): x is string => typeof x === "string")
            : [];
          const timeZone = normalizeTimeZoneId(
            typeof data?.timeZone === "string" ? data.timeZone : undefined
          );
          const designation =
            typeof data?.designation === "string" ? data.designation.trim() : "";
          const employeeId =
            typeof data?.employeeId === "string" ? data.employeeId.trim() : "";

          if (email && snap.exists() && fsEmail !== email) {
            try {
              await updateDoc(userRef, { email });
            } catch {
              /* ignore sync errors */
            }
          }

          setUser({
            uid: u.uid,
            name,
            email: email ?? "",
            role,
            designation,
            employeeId,
            assignedSites,
            timeZone,
          });
          setLoading(false);
        },
        () => {
          // Keep last good snapshot so assignedSites does not flash empty on transient errors.
          setUser((prev) =>
            prev && prev.uid === u.uid
              ? prev
              : {
                  uid: u.uid,
                  name: u.email?.split("@")[0] || "User",
                  email: u.email ?? "",
                  role:
                    SUPER_ADMIN_EMAIL && u.email === SUPER_ADMIN_EMAIL ? "super_admin" : "employee",
                  designation: "",
                  employeeId: "",
                  assignedSites: [],
                  timeZone: normalizeTimeZoneId(undefined),
                }
          );
          setLoading(false);
        }
      );
    });

    return () => {
      unsubDoc?.();
      unsubAuth();
    };
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, refresh }}>{children}</Ctx.Provider>
  );
}

export function useDashboardUser() {
  return React.useContext(Ctx);
}
