"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";

export function EmployeeLoginRequestPanel() {
  const { user } = useDashboardUser();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const status = user?.workspaceAccessStatus;
  const label =
    status === "pending"
      ? "Pending review"
      : status === "rejected"
        ? "Not approved"
        : status === "approved"
          ? "Approved"
          : "Active (no gate)";

  const resubmit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/account/login-request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMsg("Request sent. Admins have been notified.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login / workspace access</CardTitle>
        <CardDescription>
          New employees must be approved by an admin after onboarding. You will receive a
          notification when your access is approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Current status</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{label}</p>
        </div>
        {status === "rejected" ? (
          <div className="space-y-2">
            <Button type="button" disabled={busy} onClick={() => void resubmit()}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Submit access request again"
              )}
            </Button>
            {msg ? (
              <p
                className={
                  msg.startsWith("Request sent")
                    ? "text-sm text-emerald-600 dark:text-emerald-400"
                    : "text-sm text-red-600 dark:text-red-400"
                }
              >
                {msg}
              </p>
            ) : null}
          </div>
        ) : status === "pending" ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            The dashboard stays read-only with a blocking card until an admin approves your access.
            Check the bell icon for updates after approval.
          </p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Your account is cleared to use the app. No further login request is needed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
