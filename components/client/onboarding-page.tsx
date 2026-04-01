"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";

export function OnboardingPage() {
  const { user } = useDashboardUser();
  const router = useRouter();
  const [designation, setDesignation] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const submit = async () => {
    setMsg(null);
    const trimmed = designation.trim();
    if (trimmed.length < 2) {
      setMsg("Please enter your designation.");
      return;
    }
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ designation: trimmed }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.replace("/dashboard/employee");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            One last step. Add your designation to complete onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-500">
            Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-200">{user?.name}</span>
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Designation</span>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Electrician"
              autoFocus
            />
          </label>
          {msg ? <p className="text-sm text-red-500">{msg}</p> : null}
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving..." : "Complete onboarding"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
