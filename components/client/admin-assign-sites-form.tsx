"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { CardBlockSkeleton } from "@/components/client/dashboard-skeletons";
import { ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  assignedSites: string[];
};

type SiteRow = { id: string; name?: string };

export function AdminAssignSitesForm() {
  const [workers, setWorkers] = React.useState<UserRow[]>([]);
  const [sites, setSites] = React.useState<SiteRow[]>([]);
  const [workerId, setWorkerId] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = React.useCallback(async () => {
    const h = await authHeaders();
    const [uRes, sRes] = await Promise.all([
      fetch("/api/admin/users", { headers: h }),
      fetch("/api/sites", { headers: h }),
    ]);
    const uJson = (await uRes.json()) as { users?: UserRow[]; error?: string };
    const sJson = (await sRes.json()) as { sites?: SiteRow[]; error?: string };
    if (!uRes.ok) throw new Error(uJson.error ?? "Failed to load users");
    if (!sRes.ok) throw new Error(sJson.error ?? "Failed to load sites");
    const emps = (uJson.users ?? []).filter((r) => r.role === "employee");
    setWorkers(emps);
    setSites(sJson.sites ?? []);
  }, [authHeaders]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        await load();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) void run();
      else {
        setWorkers([]);
        setSites([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [load]);

  React.useEffect(() => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(w.assignedSites ?? []));
  }, [workerId, workers]);

  const toggleSite = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!workerId) {
      setErr("Choose an employee.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/admin/assign-sites", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId,
          siteIds: [...selected],
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        unchanged?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.unchanged) {
        toast.info("No changes — assignments already match what you selected.");
        await load();
        return;
      }
      setSaveSuccess(
        selected.size === 0
          ? "Assignments cleared. They cannot check in until you assign sites again."
          : `Saved ${selected.size} site(s). They were notified.`
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const siteById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sites) m.set(s.id, s.name ?? s.id);
    return m;
  }, [sites]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Assign work sites</CardTitle>
        <CardDescription>
          Choose an employee, tick the sites they may use for check-in and site switch. Until at least
          one site is assigned, they cannot check in. They receive an in-app notification when you save.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <CardBlockSkeleton lines={2} />
        ) : err && !workers.length ? (
          <p className="text-sm text-red-400" role="alert">
            {err}
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-zinc-400">Employee</span>
              <SearchableSelect
                value={workerId}
                onValueChange={setWorkerId}
                options={workers.map((w) => ({
                  value: w.id,
                  label: w.employeeId?.trim()
                    ? `${w.employeeId} (${w.name || "Employee"})`
                    : `${w.name || "Employee"}`,
                  keywords: [w.employeeId ?? "", w.id, w.name ?? "", w.email ?? ""],
                }))}
                emptyLabel="Select…"
                searchPlaceholder="Search by employee ID, name, email…"
                listClassName="max-h-[min(320px,50vh)]"
                triggerClassName="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground"
              />
            </label>

            {workerId ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Allowed sites
                </p>
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                  {sites.length === 0 ? (
                    <p className="text-sm text-zinc-500">No sites in the system yet. Create one under Sites.</p>
                  ) : (
                    sites.map((s) => (
                      <label
                        key={s.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-2 py-1.5",
                          "hover:border-white/10 hover:bg-white/[0.04]"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 rounded border-white/20"
                          checked={selected.has(s.id)}
                          onChange={() => toggleSite(s.id)}
                        />
                        <span className="text-sm">
                          <span className="font-medium">{s.name ?? s.id}</span>
                          <span className="ml-2 font-mono text-xs text-zinc-500">{s.id}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !workerId} onClick={() => void save()}>
                {busy ? "Saving…" : "Save assignments"}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
                Reload
              </Button>
            </div>

            {workerId && selected.size > 0 ? (
              <p className="text-xs text-zinc-500">
                Preview: <span className="text-zinc-300">{[...selected].map((id) => siteById.get(id) ?? id).join(", ")}</span>
              </p>
            ) : null}

            {saveSuccess ? (
              <ResultModal
                open
                variant="success"
                title="Assignments saved"
                description={saveSuccess}
                onDismiss={() => setSaveSuccess(null)}
              />
            ) : null}
            {err && workers.length > 0 ? (
              <p className="text-sm text-red-400" role="alert">
                {err}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
