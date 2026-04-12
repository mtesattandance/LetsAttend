"use client";

import * as React from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
};

type OvertimeType = "same" | "1.5x" | "custom";

type WageEntry = {
  wagesPerDay: string;
  overtimeType: OvertimeType;
  customOvertime: string;
  salaryAccess: boolean;
  accessSaving: boolean;
  saving: boolean;
  saved: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveOtRate(entry: WageEntry): number | null {
  const perDay = Number(entry.wagesPerDay);
  if (!Number.isFinite(perDay) || perDay <= 0) return null;
  const perHour = perDay / 8;
  if (entry.overtimeType === "1.5x") return perHour * 1.5;
  if (entry.overtimeType === "custom") {
    const c = Number(entry.customOvertime);
    return Number.isFinite(c) && c >= 0 ? c : null;
  }
  return perHour;
}

const OT_OPTS: { value: OvertimeType; label: string }[] = [
  { value: "same", label: "Same" },
  { value: "1.5x", label: "1.5×" },
  { value: "custom", label: "Custom" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSalaryEditPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [wages, setWages] = React.useState<Record<string, WageEntry>>({});

  const getToken = async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    return u.getIdToken();
  };

  // ─── Load employees + wages + access ──────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const token = await getToken();

        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { users?: UserRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load users");
        const emps = (data.users ?? []).filter((r) => r.role === "employee");
        emps.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        if (cancelled) return;
        setUsers(emps);

        const [wageResults, accessResults] = await Promise.all([
          Promise.allSettled(
            emps.map(async (emp) => {
              const r = await fetch(`/api/admin/wage-rate?workerId=${emp.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const d = (await r.json()) as { wageRate: number | null; overtimeRate: number | null };
              return { id: emp.id, wageRate: d.wageRate, overtimeRate: d.overtimeRate };
            })
          ),
          Promise.allSettled(
            emps.map(async (emp) => {
              const r = await fetch(`/api/admin/salary-access?workerId=${emp.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const d = (await r.json()) as { salarySheetAccess: boolean };
              return { id: emp.id, access: d.salarySheetAccess };
            })
          ),
        ]);

        if (cancelled) return;
        const initial: Record<string, WageEntry> = {};
        for (let i = 0; i < emps.length; i++) {
          const wr = wageResults[i];
          const ar = accessResults[i];
          const emp = emps[i]!;

          let perDay = "";
          let overtimeType: OvertimeType = "same";
          let customOvertime = "";
          if (wr?.status === "fulfilled") {
            const { wageRate, overtimeRate } = wr.value;
            if (wageRate !== null) perDay = (wageRate * 8).toFixed(2);
            if (wageRate !== null && overtimeRate !== null) {
              const ratio = overtimeRate / wageRate;
              if (Math.abs(ratio - 1.5) < 0.01) overtimeType = "1.5x";
              else if (Math.abs(ratio - 1.0) >= 0.01) {
                overtimeType = "custom";
                customOvertime = overtimeRate.toFixed(4);
              }
            }
          }
          const salaryAccess = ar?.status === "fulfilled" ? ar.value.access : false;

          initial[emp.id] = {
            wagesPerDay: perDay,
            overtimeType,
            customOvertime,
            salaryAccess,
            accessSaving: false,
            saving: false,
            saved: false,
          };
        }
        setWages(initial);
      } catch (e) {
        if (!cancelled)
          toast.error(e instanceof Error ? e.message : "Failed to load employees");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Save wage ────────────────────────────────────────────────────────────
  const saveFor = async (userId: string, overrideEntry?: Partial<WageEntry>) => {
    const entry = { ...(wages[userId] ?? {}), ...overrideEntry } as WageEntry;
    const raw = entry.wagesPerDay.trim();
    if (raw === "") return;
    const perDay = Number(raw);
    if (!Number.isFinite(perDay) || perDay < 0) { toast.error("Invalid wage value"); return; }

    const otRate = effectiveOtRate(entry);
    if (otRate === null && entry.overtimeType === "custom") return;

    setWages((p) => ({ ...p, [userId]: { ...p[userId]!, saving: true, saved: false } }));
    try {
      const token = await getToken();
      const wageRateHourly = perDay / 8;
      await fetch("/api/admin/wage-rate", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: userId,
          wageRate: wageRateHourly,
          overtimeRate: otRate ?? wageRateHourly,
        }),
      });
      setWages((p) => ({ ...p, [userId]: { ...p[userId]!, saving: false, saved: true } }));
      setTimeout(() => {
        setWages((p) => p[userId] ? { ...p, [userId]: { ...p[userId]!, saved: false } } : p);
      }, 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      setWages((p) => ({ ...p, [userId]: { ...p[userId]!, saving: false } }));
    }
  };

  // ─── Toggle salary sheet access ───────────────────────────────────────────
  const toggleAccess = async (userId: string, val: boolean) => {
    setWages((p) => ({
      ...p,
      [userId]: { ...p[userId]!, salaryAccess: val, accessSaving: true },
    }));
    try {
      const token = await getToken();
      await fetch("/api/admin/salary-access", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: userId, salarySheetAccess: val }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update access");
      setWages((p) => ({ ...p, [userId]: { ...p[userId]!, salaryAccess: !val } }));
    } finally {
      setWages((p) => ({ ...p, [userId]: { ...p[userId]!, accessSaving: false } }));
    }
  };

  // ─── OT toggle ────────────────────────────────────────────────────────────
  const handleOtTypeChange = (userId: string, ot: OvertimeType) => {
    setWages((p) => ({ ...p, [userId]: { ...p[userId]!, overtimeType: ot, saved: false } }));
    if (ot !== "custom") {
      const entry = wages[userId];
      if (entry && entry.wagesPerDay.trim() !== "") void saveFor(userId, { overtimeType: ot });
    }
  };

  const updateField = (userId: string, patch: Partial<WageEntry>) => {
    setWages((p) => ({ ...p, [userId]: { ...p[userId]!, ...patch, saved: false } }));
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-3 sm:p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Salary Edit</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Edit wages, overtime type, and salary sheet access for all employees. Changes auto-save on blur or toggle.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Employee Wage Table</CardTitle>
          <CardDescription>
            Wages/day → hourly (÷8) · Overtime:{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Same</span> (1×) ·{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">1.5×</span> ·{" "}
            <span className="font-medium text-violet-600 dark:text-violet-400">Custom</span> rate · Toggle salary sheet access per employee.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No employees found.</p>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-200 bg-zinc-50/80 text-left dark:border-white/10 dark:bg-white/[0.03]">
                  <th className="border-r border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10">S.N</th>
                  <th className="border-r border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10">Employee ID</th>
                  <th className="border-r border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10">Employee Name</th>
                  <th className="border-r border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10">
                    Wages/Day
                    <span className="ml-1 text-[10px] font-normal text-zinc-400 normal-case">(रू)</span>
                  </th>
                  <th className="border-r border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10">
                    Wages/hr
                    <span className="ml-1 text-[10px] font-normal text-zinc-400 normal-case">(रू)</span>
                  </th>
                  <th className="border-r border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10">OT Type</th>
                  <th className="border-r border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10">
                    OT Rate
                    <span className="ml-1 text-[10px] font-normal text-zinc-400 normal-case">(रू/hr)</span>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Allow Access
                    <span className="ml-1 block text-[10px] font-normal normal-case text-zinc-400">Salary Sheet</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((emp, idx) => {
                  const entry = wages[emp.id];
                  const raw = entry?.wagesPerDay ?? "";
                  const perDay = Number(raw);
                  const validDay = raw !== "" && Number.isFinite(perDay) && perDay > 0;
                  const perHour = validDay ? perDay / 8 : null;
                  const otType = entry?.overtimeType ?? "same";
                  const otRate = entry ? effectiveOtRate(entry) : null;

                  return (
                    <tr
                      key={emp.id}
                      className={cn(
                        "border-b border-zinc-100 transition-colors dark:border-white/5",
                        idx % 2 === 1
                          ? "bg-zinc-50/40 dark:bg-white/[0.01]"
                          : "bg-white dark:bg-transparent"
                      )}
                    >
                      {/* S.N */}
                      <td className="border-r border-zinc-100 px-4 py-3.5 tabular-nums text-zinc-400 dark:border-white/5">
                        {idx + 1}
                      </td>

                      {/* Employee ID */}
                      <td className="border-r border-zinc-100 px-4 py-3.5 font-mono text-xs text-zinc-500 dark:border-white/5 dark:text-zinc-400">
                        {emp.employeeId || "—"}
                      </td>

                      {/* Name */}
                      <td className="border-r border-zinc-100 px-4 py-3.5 font-medium dark:border-white/5">
                        {emp.name}
                      </td>

                      {/* Wages per Day */}
                      <td className="border-r border-zinc-100 px-4 py-2.5 dark:border-white/5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-zinc-400">रू</span>
                          <input
                            type="number" min={0} step={0.01}
                            value={raw} placeholder="0.00"
                            disabled={entry?.saving}
                            onChange={(e) => updateField(emp.id, { wagesPerDay: e.target.value })}
                            onBlur={() => void saveFor(emp.id)}
                            className="h-8 w-24 rounded-lg border border-zinc-200 bg-transparent px-2 text-sm tabular-nums focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:text-zinc-100"
                          />
                          {entry?.saving && <Loader2 className="size-3.5 animate-spin text-zinc-400" />}
                          {entry?.saved && !entry.saving && <Check className="size-3.5 text-emerald-500" />}
                        </div>
                      </td>

                      {/* Wages per Hour */}
                      <td className="border-r border-zinc-100 px-4 py-3.5 tabular-nums dark:border-white/5">
                        {perHour !== null ? (
                          <span className="text-zinc-700 dark:text-zinc-200">
                            <span className="text-xs text-zinc-400">रू </span>
                            {perHour.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">—</span>
                        )}
                      </td>

                      {/* OT Type toggle */}
                      <td className="border-r border-zinc-100 px-3 py-2.5 dark:border-white/5">
                        <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-[11px] dark:border-white/15">
                          {OT_OPTS.map((opt, oi) => (
                            <button
                              key={opt.value}
                              type="button"
                              id={`ot-${opt.value}-${emp.id}`}
                              onClick={() => handleOtTypeChange(emp.id, opt.value)}
                              className={cn(
                                "flex-1 px-2 py-1.5 text-center font-semibold transition-colors",
                                oi > 0 && "border-l border-zinc-200 dark:border-white/15",
                                otType === opt.value
                                  ? opt.value === "custom"
                                    ? "bg-violet-600 text-white"
                                    : opt.value === "1.5x"
                                    ? "bg-amber-500 text-white"
                                    : "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                                  : "bg-white text-zinc-400 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* OT Rate — custom input or computed display */}
                      <td className="border-r border-zinc-100 px-4 py-2.5 tabular-nums dark:border-white/5">
                        {otType === "custom" ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-zinc-400">रू</span>
                            <input
                              type="number" min={0} step={0.01}
                              value={entry?.customOvertime ?? ""}
                              placeholder="0.00"
                              disabled={entry?.saving}
                              onChange={(e) => updateField(emp.id, { customOvertime: e.target.value })}
                              onBlur={() => void saveFor(emp.id)}
                              className="h-8 w-24 rounded-lg border border-violet-300 bg-violet-50/50 px-2 text-sm tabular-nums text-violet-800 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-300"
                            />
                          </div>
                        ) : otRate !== null ? (
                          <span className={cn(
                            "font-medium",
                            otType === "1.5x"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-zinc-700 dark:text-zinc-200"
                          )}>
                            <span className="text-xs font-normal text-zinc-400">रू </span>
                            {otRate.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Allow Access toggle */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          id={`access-toggle-${emp.id}`}
                          disabled={entry?.accessSaving}
                          onClick={() => void toggleAccess(emp.id, !(entry?.salaryAccess))}
                          className={cn(
                            "relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:opacity-50",
                            entry?.salaryAccess
                              ? "bg-emerald-500 dark:bg-emerald-600"
                              : "bg-zinc-200 dark:bg-zinc-700"
                          )}
                          role="switch"
                          aria-checked={entry?.salaryAccess}
                          aria-label={`Allow ${emp.name} to access salary sheet`}
                        >
                          <span className={cn(
                            "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                            entry?.salaryAccess ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                        {entry?.accessSaving && (
                          <Loader2 className="mx-auto mt-1 size-3 animate-spin text-zinc-400" />
                        )}
                        <p className={cn(
                          "mt-0.5 text-[10px] font-medium",
                          entry?.salaryAccess
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-zinc-400"
                        )}>
                          {entry?.salaryAccess ? "Allowed" : "Hidden"}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-zinc-400">
        Formula: Wages/hr = Wages/day ÷ 8 &nbsp;|&nbsp;
        <span className="font-medium text-zinc-500">Same</span> = 1× hourly ·{" "}
        <span className="font-medium text-amber-600">1.5×</span> = 1.5× hourly ·{" "}
        <span className="font-medium text-violet-600">Custom</span> = your specified रू/hr &nbsp;|&nbsp;
        Changes auto-save on blur or toggle.
      </p>
    </div>
  );
}
