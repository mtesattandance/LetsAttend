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
import { formFieldLabelClass } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { toast } from "sonner";
import { UtcTimePicker } from "@/components/client/utc-time-picker";
import { getGpsFix } from "@/lib/client/geolocation";
import { formatWallHm12h } from "@/lib/time/format-wall-time";
import { cn } from "@/lib/utils";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar } from "@/lib/date/bs-calendar";

type Assignee = { id: string; name: string; email: string; role: string };

type OffsiteRow = {
  id: string;
  status?: string;
  date?: string;
  reason?: string;
  assigneeAdminUid?: string | null;
  assigneeAdminName?: string | null;
  assigneeAdminEmail?: string | null;
  requestedStartHm?: string;
  requestedEndHm?: string;
  approvedStartHm?: string | null;
  approvedEndHm?: string | null;
  requestGps?: { latitude?: number; longitude?: number; accuracyM?: number } | null;
};

function hmMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function fmtGps(g: OffsiteRow["requestGps"]) {
  if (!g || typeof g.latitude !== "number" || typeof g.longitude !== "number") return "—";
  const acc = typeof g.accuracyM === "number" ? ` ±${Math.round(g.accuracyM)}m` : "";
  return `${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}${acc}`;
}

export function EmployeeOffsiteRequestPanel() {
  const { mode } = useCalendarMode();
  const [assignees, setAssignees] = React.useState<Assignee[]>([]);
  const [assigneeUid, setAssigneeUid] = React.useState("");
  const [date, setDate] = React.useState(() =>
    calendarDateKeyInTimeZone(new Date(), normalizeTimeZoneId(undefined))
  );
  const [reason, setReason] = React.useState("");
  const [workStartHm, setWorkStartHm] = React.useState("09:00");
  const [workEndHm, setWorkEndHm] = React.useState("17:00");
  const [busy, setBusy] = React.useState(false);
  const [requests, setRequests] = React.useState<OffsiteRow[]>([]);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadAssignees = React.useCallback(async () => {
    try {
      const h = await authHeaders();
      const res = await fetch("/api/offsite-work/assignees", { headers: h });
      const data = (await res.json()) as { assignees?: Assignee[]; error?: string };
      if (res.ok && data.assignees) setAssignees(data.assignees);
    } catch {
      setAssignees([]);
    }
  }, [authHeaders]);

  const loadMine = React.useCallback(async () => {
    try {
      const h = await authHeaders();
      const res = await fetch("/api/offsite-work", { headers: h });
      const data = (await res.json()) as { items?: OffsiteRow[] };
      if (res.ok) setRequests(data.items ?? []);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        void loadAssignees();
        void loadMine();
      }
    });
    return () => unsub();
  }, [loadAssignees, loadMine]);

  const submit = async () => {
    if (reason.trim().length < 3) {
      toast.message("Describe the off-site work (at least a few words).");
      return;
    }
    if (!assigneeUid.trim()) {
      toast.message("Choose an admin assignee.");
      return;
    }
    if (hmMinutes(workEndHm) <= hmMinutes(workStartHm)) {
      toast.message("End time must be after start on the same day.");
      return;
    }
    setBusy(true);
    try {
      const gps = await getGpsFix();
      const h = await authHeaders();
      const res = await fetch("/api/offsite-work", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.trim(),
          assigneeAdminUid: assigneeUid.trim(),
          reason: reason.trim(),
          workStartHm,
          workEndHm,
          latitude: gps.latitude,
          longitude: gps.longitude,
          ...(typeof gps.accuracyM === "number" ? { accuracyM: gps.accuracyM } : {}),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      toast.success("Off-site request sent. Any admin can review it.");
      setReason("");
      void loadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="employee-offsite">
      <CardHeader>
        <CardTitle>Off-site work</CardTitle>

      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DateField
          label="Work date"
          value={date}
          onChange={setDate}
          id="offsite-work-date"
        />

        <div>
          <span className={cn("mb-1.5 block", formFieldLabelClass)}>Assignee (admin)</span>
          <SearchableSelect
            value={assigneeUid}
            onValueChange={setAssigneeUid}
            options={assignees.map((a) => ({
              value: a.id,
              label: a.name?.trim() || "Admin",
              keywords: [a.id, a.name, a.email],
            }))}
            emptyLabel="— Select admin —"
            searchPlaceholder="Search admins…"
            listClassName="max-h-[min(280px,50vh)]"
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={formFieldLabelClass}>Reason</span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Where you’re going and what you’ll do…"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <UtcTimePicker
            id="offsite-start"
            label="Planned start (local)"
            value={workStartHm}
            onChange={setWorkStartHm}
            variant="light"
          />
          <UtcTimePicker
            id="offsite-end"
            label="Planned end (local)"
            value={workEndHm}
            onChange={setWorkEndHm}
            variant="light"
          />
        </div>

        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Getting location & sending…" : "Submit off-site request"}
        </Button>

        <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
          <p className={cn("text-sm font-medium text-zinc-800 dark:text-zinc-300")}>Your requests</p>
          <ul className="mt-3 space-y-3">
            {requests.map((r) => {
              const dispStart =
                r.status === "approved" && r.approvedStartHm
                  ? r.approvedStartHm
                  : r.requestedStartHm ?? "—";
              const dispEnd =
                r.status === "approved" && r.approvedEndHm
                  ? r.approvedEndHm
                  : r.requestedEndHm ?? "—";
              return (
                <li
                  key={r.id}
                  className={cn(
                    "rounded-xl border p-3 text-sm",
                    "border-zinc-200 bg-zinc-50/80 text-zinc-800",
                    "dark:border-white/10 dark:bg-black/20 dark:text-zinc-300"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-500">{r.id}</span>
                    <span className="text-xs capitalize text-amber-800 dark:text-amber-200/90">
                      {r.status ?? "?"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-500">
                    Date{" "}
                    <span className="text-zinc-900 dark:text-zinc-300">
                      {r.date ? formatIsoForCalendar(r.date, mode) : "—"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                    Assignee:{" "}
                    <strong className="font-medium text-zinc-900 dark:text-zinc-200">
                      {r.assigneeAdminName || r.assigneeAdminEmail || r.assigneeAdminUid || "—"}
                    </strong>
                  </p>
                  <p className="mt-1 text-xs">
                    Window:{" "}
                    <span className="font-mono text-cyan-800 dark:text-cyan-200/90">
                      {formatWallHm12h(dispStart)} → {formatWallHm12h(dispEnd)}
                    </span>{" "}
                    (local)
                  </p>
                  <div className="mt-2 space-y-1 border-t border-zinc-200/80 pt-2 dark:border-white/5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                      Request location (when you submitted)
                    </p>
                    <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {fmtGps(r.requestGps ?? null)}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                      Location is shown to admins on the live map only.
                    </p>
                  </div>
                  {r.reason ? <p className="mt-2 text-zinc-600 dark:text-zinc-400">{r.reason}</p> : null}
                </li>
              );
            })}
          </ul>
          {requests.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">No requests yet.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
