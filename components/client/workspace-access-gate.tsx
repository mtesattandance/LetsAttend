"use client";

import * as React from "react";
import { signOut } from "firebase/auth";
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

export function WorkspaceAccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useDashboardUser();
  const [resubmitBusy, setResubmitBusy] = React.useState(false);
  const [resubmitMsg, setResubmitMsg] = React.useState<string | null>(null);

  const blockState = React.useMemo(() => {
    if (loading || !user) return null;
    if (user.role !== "employee") return null;
    const s = user.workspaceAccessStatus;
    if (s === "pending") return "pending" as const;
    if (s === "rejected") return "rejected" as const;
    return null;
  }, [loading, user]);

  const resubmit = async () => {
    setResubmitMsg(null);
    setResubmitBusy(true);
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
      setResubmitMsg("Request sent. An admin will review it shortly.");
    } catch (e) {
      setResubmitMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setResubmitBusy(false);
    }
  };

  if (blockState === null) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="pointer-events-none opacity-40 blur-[0.5px]">{children}</div>
      <div
        className="fixed inset-0 z-[1300] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-access-title"
      >
        <Card className="w-full max-w-md border-zinc-200/90 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
          <CardHeader>
            <CardTitle id="workspace-access-title">
              {blockState === "pending" ? "Waiting for admin approval" : "Workspace access on hold"}
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">
              {blockState === "pending"
                ? "Your profile is complete. An administrator must approve your login before you can use check-in, requests, and the rest of the dashboard. You will get a notification when that happens."
                : "An administrator did not approve access for this account. You can send a new request, or sign out and contact your supervisor."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {blockState === "rejected" ? (
              <>
                <Button
                  type="button"
                  disabled={resubmitBusy}
                  onClick={() => void resubmit()}
                  className="w-full"
                >
                  {resubmitBusy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Submit access request again"
                  )}
                </Button>
                {resubmitMsg ? (
                  <p
                    className={
                      resubmitMsg.startsWith("Request sent")
                        ? "text-sm text-emerald-600 dark:text-emerald-400"
                        : "text-sm text-red-600 dark:text-red-400"
                    }
                  >
                    {resubmitMsg}
                  </p>
                ) : null}
              </>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void signOut(getFirebaseAuth())}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
