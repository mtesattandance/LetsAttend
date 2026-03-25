"use client";

import * as React from "react";
import { AttendanceCalendar } from "@/components/client/attendance-calendar";
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

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export function AdminUsersPanel() {
  const { user: viewer } = useDashboardUser();
  const [users, setUsers] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [resetEmail, setResetEmail] = React.useState("");
  const [resetLink, setResetLink] = React.useState<string | null>(null);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetMsg, setResetMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { users?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      const list = data.users ?? [];
      setUsers(list);
      setSelectedId((prev) =>
        prev && list.some((x) => x.id === prev) ? prev : list[0]?.id ?? ""
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const requestResetLink = async () => {
    setResetMsg(null);
    setResetLink(null);
    const email = resetEmail.trim().toLowerCase();
    if (!email) {
      setResetMsg("Enter user email.");
      return;
    }
    setResetBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/password-reset-link", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { resetLink?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResetLink(data.resetLink ?? null);
      setResetMsg("Copy the link and send it to the user securely (not over public chat).");
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setResetBusy(false);
    }
  };

  const canManageAdmins = viewer?.role === "super_admin";

  const demoteAdmin = async (email: string, name: string) => {
    if (
      !window.confirm(
        `Remove admin access for “${name}” (${email})? They will become an employee.`
      )
    ) {
      return;
    }
    setResetMsg(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/demote-admin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const selected = users.find((r) => r.id === selectedId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            All accounts from Firestore (no passwords — Firebase never exposes
            them). Generate a password reset link if someone forgot their
            password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    {canManageAdmins ? <th className="px-3 py-2">Admin</th> : null}
                    <th className="px-3 py-2">Calendar</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-white/5 hover:bg-white/[0.02]"
                    >
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.email}</td>
                      <td className="px-3 py-2 capitalize">{r.role}</td>
                      {canManageAdmins ? (
                        <td className="px-3 py-2">
                          {r.role === "admin" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-amber-400 hover:text-amber-300"
                              onClick={() => void demoteAdmin(r.email, r.name)}
                            >
                              Remove admin
                            </Button>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-cyan-400"
                          onClick={() => setSelectedId(r.id)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-sm font-medium text-zinc-200">Password reset link</p>
            <p className="mt-1 text-xs text-zinc-500">
              Passwords cannot be viewed or stored in plain text. Send this link
              only through a private channel.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                placeholder="user@example.com"
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={resetBusy}
                onClick={() => void requestResetLink()}
              >
                {resetBusy ? "…" : "Generate link"}
              </Button>
            </div>
            {resetMsg ? <p className="mt-2 text-sm text-zinc-400">{resetMsg}</p> : null}
            {resetLink ? (
              <textarea
                readOnly
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-xs text-zinc-300"
                rows={3}
                value={resetLink}
                onFocus={(e) => e.target.select()}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <AttendanceCalendar
          workerId={selected.id}
          title={`Attendance — ${selected.name}`}
          description={`Worker ID ${selected.id}. UTC month (same as employee view).`}
        />
      ) : null}
    </div>
  );
}
