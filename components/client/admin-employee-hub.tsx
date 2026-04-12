"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  DollarSign,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkingHoursMonthPanel } from "@/components/client/working-hours-month-panel";
import { AdminSalarySheet } from "@/components/client/admin-salary-sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  designation?: string;
};

type Tab = "attendance" | "salary" | "edit";

export function AdminEmployeeHub() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = React.useState(true);
  const [workerId, setWorkerId] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<Tab>("attendance");
  const [mounted, setMounted] = React.useState(false);

  // Wage state
  const [wagesPerDay, setWagesPerDay] = React.useState<number | null>(null);
  const [overtimeRate, setOvertimeRate] = React.useState<number | null>(null);
  const [wageLoading, setWageLoading] = React.useState(false);
  const [wageSaving, setWageSaving] = React.useState(false);

  // Edit state
  const [editName, setEditName] = React.useState("");
  const [editDesignation, setEditDesignation] = React.useState("");
  const [editEmployeeId, setEditEmployeeId] = React.useState("");
  const [editBusy, setEditBusy] = React.useState(false);
  const [editMsg, setEditMsg] = React.useState<string | null>(null);

  // Delete state
  const [deletePhrase, setDeletePhrase] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  /** Auth helper */
  const getToken = async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    return u.getIdToken();
  };

  /** Load all employees */
  const loadUsers = React.useCallback(async () => {
    setLoadingUsers(true);
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
      setUsers(emps);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  React.useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  /** When a worker is selected, load their wage data and pre-fill edit form */
  React.useEffect(() => {
    if (!workerId) {
      setWagesPerDay(null);
      setOvertimeRate(null);
      setEditName("");
      setEditDesignation("");
      setEditEmployeeId("");
      setEditMsg(null);
      return;
    }
    const worker = users.find((u) => u.id === workerId);
    setEditName(worker?.name ?? "");
    setEditDesignation(worker?.designation ?? "");
    setEditEmployeeId(worker?.employeeId ?? "");
    setEditMsg(null);

    let cancelled = false;
    const run = async () => {
      setWageLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/admin/wage-rate?workerId=${workerId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = (await res.json()) as {
          wageRate: number | null;
          overtimeRate: number | null;
        };
        if (!cancelled) {
          // wageRate in API = hourly rate. Convert to per-day (×8) for display.
          setWagesPerDay(
            typeof data.wageRate === "number" ? data.wageRate * 8 : null
          );
          setOvertimeRate(data.overtimeRate);
        }
      } catch {
        if (!cancelled) {
          setWagesPerDay(null);
          setOvertimeRate(null);
        }
      } finally {
        if (!cancelled) setWageLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [workerId, users]);

  /** Save wages per day → derive hourly → store as wageRate (hourly) in Firestore */
  const saveWagesPerDay = React.useCallback(
    async (val: number | null) => {
      if (!workerId || val === null || val < 0) return;
      setWageSaving(true);
      try {
        const token = await getToken();
        const newWageHourly = val / 8;

        // Preserve the existing OT ratio so salary-edit settings stay intact.
        // If overtimeRate and current wagesPerDay are known, maintain same ratio.
        // e.g. "same" → 1×, "1.5×" → 1.5×, "custom" → exact stored rate.
        const currentWageHourly =
          typeof wagesPerDay === "number" && wagesPerDay > 0
            ? wagesPerDay / 8
            : null;
        const storedOtRate =
          typeof overtimeRate === "number" ? overtimeRate : null;

        let newOtRate: number;
        if (currentWageHourly && storedOtRate !== null && currentWageHourly > 0) {
          // Keep the same multiplier/ratio
          const ratio = storedOtRate / currentWageHourly;
          newOtRate = newWageHourly * ratio;
        } else {
          // No previous rate stored — default to 1.5×
          newOtRate = newWageHourly * 1.5;
        }

        await fetch("/api/admin/wage-rate", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workerId,
            wageRate: newWageHourly,
            overtimeRate: newOtRate,
          }),
        });
        setOvertimeRate(newOtRate);
      } catch {
        toast.error("Failed to save wage rate");
      } finally {
        setWageSaving(false);
      }
    },
    [workerId, wagesPerDay, overtimeRate]
  );

  /** Save employee profile edits */
  const saveEdit = async () => {
    setEditMsg(null);
    const name = editName.trim();
    if (!name) {
      setEditMsg("Name cannot be empty.");
      return;
    }
    setEditBusy(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/update-employee", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workerId,
          name,
          designation: editDesignation.trim(),
          employeeId: editEmployeeId.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Employee profile updated");
      setEditMsg("Saved successfully.");
      await loadUsers();
    } catch (e) {
      setEditMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditBusy(false);
    }
  };

  /** Delete employee */
  const deleteEmployee = async () => {
    if (deletePhrase.trim() !== "DELETE EMPLOYEE") {
      toast.error("Type exactly: DELETE EMPLOYEE");
      return;
    }
    setDeleteBusy(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: workerId,
          confirmPhrase: "DELETE EMPLOYEE",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Employee deleted");
      setDeleteOpen(false);
      setDeletePhrase("");
      setWorkerId("");
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const selectedWorker = users.find((u) => u.id === workerId);

  // Derive hourly for working-hours-panel
  const wageRateHourly =
    typeof wagesPerDay === "number" && wagesPerDay > 0
      ? wagesPerDay / 8
      : undefined;
  const overtimeRateHourly =
    typeof overtimeRate === "number" ? overtimeRate : undefined;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "attendance", label: "Attendance", icon: CalendarDays },
    { id: "salary", label: "Salary", icon: DollarSign },
    { id: "edit", label: "Edit", icon: Pencil },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-3 sm:p-6 md:p-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employee</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Select an employee to view their attendance, salary, or edit their
          profile.
        </p>
      </div>

      {/* Employee Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Employee</CardTitle>
          <CardDescription>
            Search by name or employee ID to load their data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <Skeleton className="h-10 w-full max-w-md rounded-lg" />
          ) : users.length === 0 ? (
            <p className="text-sm text-zinc-500">No employees found.</p>
          ) : (
            <SearchableSelect
              value={workerId}
              onValueChange={setWorkerId}
              includeEmpty
              emptyLabel="— Select an employee —"
              options={users.map((u) => ({
                value: u.id,
                label: u.employeeId?.trim()
                  ? `${u.employeeId} — ${u.name || "Employee"}`
                  : u.name || "Employee",
                keywords: [u.employeeId ?? "", u.id, u.name, u.email],
              }))}
              searchPlaceholder="Search by name or employee ID…"
              triggerClassName="h-10 w-full max-w-xl rounded-xl border border-zinc-200/80 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-950"
            />
          )}
          {selectedWorker && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <User className="size-4 shrink-0" />
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {selectedWorker.name}
              </span>
              {selectedWorker.employeeId && (
                <span className="font-mono text-xs text-zinc-400">
                  ({selectedWorker.employeeId})
                </span>
              )}
              {wageLoading && (
                <span className="text-xs text-zinc-400">
                  Loading wage info…
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs + Content */}
      {workerId && (
        <div className="space-y-5">
          {/* Tab Bar */}
          <div className="flex gap-1 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-1 dark:border-white/10 dark:bg-zinc-950/60">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                id={`employee-tab-${id}`}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                  activeTab === id
                    ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
                    : "text-zinc-500 hover:bg-white/60 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-200"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Attendance Tab */}
          {activeTab === "attendance" && (
            <WorkingHoursMonthPanel
              key={`attendance-${workerId}`}
              workerId={workerId}
              wageRate={wageRateHourly}
              overtimeRate={overtimeRateHourly}
            />
          )}

          {/* Salary Tab */}
          {activeTab === "salary" && (
            <AdminSalarySheet
              key={`salary-${workerId}`}
              workerId={workerId}
              wagesPerDay={wagesPerDay}
              storedOvertimeRate={overtimeRate}
              onWagesPerDayChange={(val) => {
                setWagesPerDay(val);
                void saveWagesPerDay(val);
              }}
              wageSaving={wageSaving}
            />
          )}

          {/* Edit Tab */}
          {activeTab === "edit" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Edit Employee Info</CardTitle>
                  <CardDescription>
                    Update name, designation, and employee ID for{" "}
                    {selectedWorker?.name ?? "this employee"}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        Full Name
                      </span>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Employee full name"
                        disabled={editBusy}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        Designation
                      </span>
                      <Input
                        value={editDesignation}
                        onChange={(e) => setEditDesignation(e.target.value)}
                        placeholder="e.g. Electrician"
                        disabled={editBusy}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        Employee ID
                      </span>
                      <Input
                        value={editEmployeeId}
                        onChange={(e) => setEditEmployeeId(e.target.value)}
                        placeholder="e.g. Mtes-001"
                        disabled={editBusy}
                      />
                    </label>
                  </div>
                  {editMsg && (
                    <p
                      className={cn(
                        "text-sm",
                        editMsg.toLowerCase().includes("success") ||
                          editMsg.toLowerCase().includes("saved")
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-500"
                      )}
                    >
                      {editMsg}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={editBusy}
                      onClick={() => void saveEdit()}
                    >
                      {editBusy ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Wage Rate in Edit Tab */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Wage Rate</CardTitle>
                  <CardDescription>
                    Set this employee&apos;s daily wage. Hourly and overtime rates are derived automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Wages per Day (Rs.)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={wagesPerDay ?? ""}
                        placeholder="e.g. 2500"
                        disabled={wageLoading}
                        onChange={(e) =>
                          setWagesPerDay(
                            e.target.value !== ""
                              ? Number(e.target.value)
                              : null
                          )
                        }
                        onBlur={() => void saveWagesPerDay(wagesPerDay)}
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Wages per Hour
                      </p>
                      <div className="flex h-9 items-center rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 text-sm text-zinc-600 dark:border-white/8 dark:bg-zinc-900/60 dark:text-zinc-300">
                        {wagesPerDay != null && wagesPerDay > 0
                          ? `Rs. ${(wagesPerDay / 8).toFixed(4)}`
                          : "—"}
                      </div>
                      <p className="mt-0.5 text-[10px] text-zinc-400">= wages/day ÷ 8</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Overtime Rate (1.5×)
                      </p>
                      <div className="flex h-9 items-center rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-300">
                        {wagesPerDay != null && wagesPerDay > 0
                          ? `Rs. ${((wagesPerDay / 8) * 1.5).toFixed(4)}`
                          : "—"}
                      </div>
                      <p className="mt-0.5 text-[10px] text-zinc-400">= hourly × 1.5</p>
                    </div>
                  </div>
                  {wageSaving && (
                    <p className="mt-2 text-xs text-zinc-400">Saving wage…</p>
                  )}
                </CardContent>
              </Card>

              {/* Danger zone */}
              <Card className="border-red-200/60 dark:border-red-500/20">
                <CardHeader>
                  <CardTitle className="text-base text-red-600 dark:text-red-400">
                    Danger Zone
                  </CardTitle>
                  <CardDescription>
                    Permanently delete{" "}
                    <strong>{selectedWorker?.name ?? "this employee"}</strong>.
                    This removes their profile, attendance, overtime/off-site
                    history, and Firebase auth account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      setDeletePhrase("");
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete Employee
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteOpen &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1360] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
              aria-label="Close delete dialog"
              onClick={() => {
                if (deleteBusy) return;
                setDeleteOpen(false);
                setDeletePhrase("");
              }}
            />
            <Card className="relative z-[1] w-full max-w-lg border-red-500/30 bg-zinc-950 text-zinc-100">
              <CardHeader>
                <CardTitle className="text-red-400">Confirm Deletion</CardTitle>
                <CardDescription className="text-zinc-400">
                  Delete{" "}
                  <strong className="text-zinc-200">
                    {selectedWorker?.name ?? "this employee"}
                  </strong>{" "}
                  permanently. This cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-400">
                    Type{" "}
                    <strong className="text-zinc-100">DELETE EMPLOYEE</strong>{" "}
                    to confirm
                  </span>
                  <input
                    value={deletePhrase}
                    onChange={(e) => setDeletePhrase(e.target.value)}
                    className="w-full rounded-xl border border-red-500/30 bg-zinc-900 px-3 py-2 font-mono text-sm"
                    placeholder="DELETE EMPLOYEE"
                    disabled={deleteBusy}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={deleteBusy}
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeletePhrase("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteBusy || deletePhrase.trim() !== "DELETE EMPLOYEE"}
                    onClick={() => void deleteEmployee()}
                  >
                    {deleteBusy ? "Deleting…" : "Delete Employee"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>,
          document.body
        )}
    </div>
  );
}
