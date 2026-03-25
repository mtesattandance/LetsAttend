"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function AdminAddAdminForm() {
  const [email, setEmail] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/admin/promote-admin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await res.json()) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to promote admin");
      }
      setMsg("Admin promoted successfully.");
      setEmail("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add admin</CardTitle>
        <CardDescription>
          Promote an existing account to <code>admin</code> by email. Only the super admin can use
          this; creating additional super admins is not supported here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Employee email</span>
            <input
              required
              type="email"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Promoting…" : "Promote to admin"}
          </Button>
          {msg ? <p className="text-sm text-zinc-300">{msg}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

