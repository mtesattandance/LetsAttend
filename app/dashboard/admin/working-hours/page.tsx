"use client";

import * as React from "react";
import JSZip from "jszip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { WorkingHoursMonthPanel } from "@/components/client/working-hours-month-panel";
import { Button } from "@/components/ui/button";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { monthLabelForMode, formatIsoForCalendar } from "@/lib/date/bs-calendar";
import { toast } from "sonner";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
};

type HoursPayload = {
  month: string;
  zone: string;
  entries: {
    id: string;
    day: string;
    kind: "on_site" | "overtime" | "off_site";
    inTime: string;
    outTime: string;
    dutyHours: number;
    workPlace: string;
    remark: string;
  }[];
  worker: { id: string; employeeId: string | null; name: string | null; designation: string | null };
  totalHours: number;
  approvedOffsiteHours: number;
  approvedClockOvertimeHours: number;
  onSiteSessionHours: number;
};

function kindLabel(kind: HoursPayload["entries"][number]["kind"]): string {
  if (kind === "on_site") return "On-site";
  if (kind === "off_site") return "Off-site";
  return "Overtime";
}

export default function AdminWorkingHoursPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [workerId, setWorkerId] = React.useState("");
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [periodMode, setPeriodMode] = React.useState<"year" | "range">("year");
  const [periodYear, setPeriodYear] = React.useState(() => DateTime.now().year);
  const [periodStartMonth, setPeriodStartMonth] = React.useState(() =>
    DateTime.now().toFormat("yyyy-MM")
  );
  const [periodEndMonth, setPeriodEndMonth] = React.useState(() => DateTime.now().toFormat("yyyy-MM"));
  const [downloadingAll, setDownloadingAll] = React.useState(false);
  const [downloadStatus, setDownloadStatus] = React.useState("Waiting to start...");
  const [downloadCurrentEmployee, setDownloadCurrentEmployee] = React.useState("");
  const [downloadDoneCount, setDownloadDoneCount] = React.useState(0);
  const [downloadTotalCount, setDownloadTotalCount] = React.useState(0);
  const cancelDownloadRef = React.useRef(false);
  const activeFetchControllerRef = React.useRef<AbortController | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const { mode } = useCalendarMode();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const monthOptions = React.useMemo(() => {
    const now = DateTime.now();
    const startYear = 2020;
    const endYear = now.year + 1;
    const out: Array<{ value: string; label: string }> = [];
    for (let y = endYear; y >= startYear; y--) {
      for (let m = 12; m >= 1; m--) {
        out.push({
          value: DateTime.fromObject({ year: y, month: m, day: 1 }).toFormat("yyyy-MM"),
          label: monthLabelForMode(y, m, mode),
        });
      }
    }
    return out;
  }, [mode]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in");
        const token = await u.getIdToken();
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
        setWorkerId((prev) => {
          if (prev && emps.some((e) => e.id === prev)) return prev;
          return emps[0]?.id ?? "";
        });
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error");
        if (!cancelled) {
          setUsers([]);
          setWorkerId("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildMonthsFromPeriod = React.useCallback(() => {
    if (periodMode === "year") {
      return Array.from({ length: 12 }, (_, i) =>
        DateTime.fromObject({ year: periodYear, month: i + 1, day: 1 }).toFormat("yyyy-MM")
      );
    }
    const s = DateTime.fromFormat(periodStartMonth, "yyyy-MM");
    const e = DateTime.fromFormat(periodEndMonth, "yyyy-MM");
    if (!s.isValid || !e.isValid || e < s) throw new Error("Invalid month range");
    const out: string[] = [];
    let c = s.startOf("month");
    while (c <= e) {
      out.push(c.toFormat("yyyy-MM"));
      c = c.plus({ months: 1 });
    }
    return out;
  }, [periodEndMonth, periodMode, periodStartMonth, periodYear]);

  const fetchLogoDataUrl = React.useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/branding/mtes-logo.png");
      if (!res.ok) return null;
      const blob = await res.blob();
      const reader = new FileReader();
      return await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }, []);

  const buildPdfBytes = React.useCallback(
    async (rows: HoursPayload[], titlePeriod: string): Promise<Uint8Array> => {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const logo = await fetchLogoDataUrl();
      const workerMeta = rows[0]?.worker;
      const marginX = 40;

      const drawHeader = (monthLabel: string) => {
        const y = 40;
        if (logo) doc.addImage(logo, "PNG", marginX, y, 48, 48);
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.text("MASS TECHNOLOGY AND ENGINEERING SOLUTION PVT. LTD", marginX + 58, y + 14);
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "normal");
        doc.text("KAGESHWORI MANOHARA-09, KATHMANDU", marginX + 58, y + 30);
        doc.text("info@masstech.com.np, masstechno2020@gmail.com", marginX + 58, y + 44);
        doc.text("9851358290, 9842995084", marginX + 58, y + 58);
        doc.setFont("helvetica", "bold");
        doc.text("Attendance Sheet", marginX, y + 82);
        doc.setFont("helvetica", "normal");
        doc.text(`Employee: ${workerMeta?.name ?? "-"}`, marginX, y + 100);
        doc.text(`Employee ID: ${workerMeta?.employeeId ?? "-"}`, marginX + 180, y + 100);
        doc.text(`Designation: ${workerMeta?.designation ?? "-"}`, marginX + 360, y + 100);
        doc.text(`Month: ${monthLabel}`, marginX, y + 116);
        doc.text(`Period: ${titlePeriod}`, marginX + 250, y + 116);
        return y + 130;
      };

      for (let i = 0; i < rows.length; i++) {
        const p = rows[i]!;
        if (i > 0) doc.addPage("a4");
        const dt = DateTime.fromFormat(p.month, "yyyy-MM");
        const monthLabel = dt.isValid ? monthLabelForMode(dt.year, dt.month, mode) : p.month;
        const startY = drawHeader(monthLabel);
        autoTable(doc, {
          startY,
          head: [["Date", "Day", "Type", "In Time", "Out Time", "Duty Hours", "Work Place", "Remark"]],
          body: p.entries.map((r) => [
            mode === "bs" ? formatIsoForCalendar(r.day, "bs", p.zone) : r.day,
            DateTime.fromISO(r.day, { zone: p.zone }).toFormat("ccc"),
            kindLabel(r.kind),
            r.inTime,
            r.outTime,
            r.dutyHours.toFixed(2),
            r.workPlace,
            r.remark || "-",
          ]),
          foot: [[
            "",
            "",
            "Month total",
            "",
            "",
            p.totalHours.toFixed(2),
            `On-site ${p.onSiteSessionHours.toFixed(2)} | OT ${p.approvedClockOvertimeHours.toFixed(2)} | Off-site ${p.approvedOffsiteHours.toFixed(2)}`,
            "",
          ]],
          styles: { fontSize: 8, cellPadding: 4.2 },
          headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
          footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20] },
        });
      }
      const ab = doc.output("arraybuffer");
      return new Uint8Array(ab);
    },
    [fetchLogoDataUrl, mode]
  );

  const downloadAllEmployeesZip = React.useCallback(async () => {
    cancelDownloadRef.current = false;
    setDownloadingAll(true);
    setDownloadStatus("Preparing data...");
    setDownloadCurrentEmployee("");
    setDownloadDoneCount(0);
    setDownloadTotalCount(users.length);
    try {
      if (users.length === 0) throw new Error("No employees found");
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months = buildMonthsFromPeriod();
      setDownloadStatus(`Building ${months.length} month(s) for each employee...`);
      const periodTitle =
        periodMode === "year" ? `${periodYear}` : `${periodStartMonth} to ${periodEndMonth}`;
      const zip = new JSZip();

      for (let idx = 0; idx < users.length; idx++) {
        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const emp = users[idx]!;
        setDownloadCurrentEmployee(emp.employeeId?.trim() ? `${emp.employeeId} (${emp.name || "Employee"})` : (emp.name || "Employee"));
        setDownloadStatus(`Preparing PDF ${idx + 1} of ${users.length}...`);
        const folderName = `${(emp.employeeId?.trim() || emp.id).replace(/[^\w.-]+/g, "_")}_${(emp.name || "Employee").replace(/[^\w.-]+/g, "_")}`;
        const folder = zip.folder(folderName);
        if (!folder) continue;
        const monthRows: HoursPayload[] = [];
        for (const m of months) {
          if (cancelDownloadRef.current) throw new Error("Download cancelled");
          const q = new URLSearchParams({ month: m, workerId: emp.id });
          const controller = new AbortController();
          activeFetchControllerRef.current = controller;
          const res = await fetch(`/api/attendance/working-hours?${q.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          activeFetchControllerRef.current = null;
          const json = (await res.json()) as HoursPayload & { error?: string };
          if (!res.ok) throw new Error(json.error ?? `Failed to load ${m} for ${emp.name}`);
          monthRows.push(json);
        }
        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const pdf = await buildPdfBytes(monthRows, periodTitle);
        const suffix = periodMode === "year" ? `${periodYear}` : `${periodStartMonth}-${periodEndMonth}`;
        folder.file(`working-hours-${suffix}.pdf`, pdf);
        setDownloadDoneCount(idx + 1);
      }

      if (cancelDownloadRef.current) throw new Error("Download cancelled");
      setDownloadStatus("Compressing ZIP file...");
      const out = await zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      });
      setDownloadStatus("Starting download...");
      const blob = new Blob([out], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = periodMode === "year" ? `${periodYear}` : `${periodStartMonth}-${periodEndMonth}`;
      a.download = `all-employees-working-hours-${suffix}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPeriodOpen(false);
      toast.success("ZIP download prepared");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download ZIP";
      if (/cancelled/i.test(msg)) toast.message("Download cancelled");
      else toast.error(msg);
    } finally {
      setDownloadingAll(false);
      setDownloadStatus("Done");
      setDownloadCurrentEmployee("");
      cancelDownloadRef.current = false;
      activeFetchControllerRef.current = null;
    }
  }, [
    buildMonthsFromPeriod,
    buildPdfBytes,
    periodEndMonth,
    periodMode,
    periodStartMonth,
    periodYear,
    users,
  ]);

  const cancelAllEmployeesDownload = React.useCallback(() => {
    cancelDownloadRef.current = true;
    setDownloadStatus("Cancelling download...");
    activeFetchControllerRef.current?.abort();
  }, []);

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Working hours</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Month view per employee: on-site, approved overtime, approved off-site, 240 h cap split.
        </p>
      </div>
      <div className="mx-auto max-w-5xl space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Worker</CardTitle>
                <CardDescription>Select an employee to load their month.</CardDescription>
              </div>
              <Button type="button" variant="secondary" disabled={loading || downloadingAll} onClick={() => setPeriodOpen(true)}>
                {downloadingAll ? "Preparing ZIP..." : "Download all employees (PDF)"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-full max-w-md rounded-lg" />
            ) : users.length === 0 ? (
              <p className="text-sm text-zinc-500">No employees found.</p>
            ) : (
              <div className="max-w-md space-y-2">
                <label
                  htmlFor="admin-wh-worker"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Employee
                </label>
                <SearchableSelect
                  id="admin-wh-worker"
                  value={workerId}
                  onValueChange={setWorkerId}
                  includeEmpty={false}
                  options={users.map((u) => ({
                    value: u.id,
                    label: u.employeeId?.trim()
                      ? `${u.employeeId} (${u.name || "Employee"})`
                      : `${u.name || "Employee"}`,
                    keywords: [u.employeeId ?? "", u.id, u.name, u.email],
                  }))}
                  emptyLabel="— Select —"
                  searchPlaceholder="Search employees…"
                />
              </div>
            )}
          </CardContent>
        </Card>
        {workerId ? (
          <WorkingHoursMonthPanel key={workerId} workerId={workerId} />
        ) : null}
        {periodOpen && mounted && typeof document !== "undefined"
          ? createPortal(
              <div className="fixed inset-0 z-1360 flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
                  aria-label="Close all-employees export modal"
                  onClick={() => setPeriodOpen(false)}
                />
                <Card className="relative z-1 w-full max-w-md border border-white/10 bg-zinc-950 text-zinc-100">
                  <CardHeader>
                    <CardTitle className="text-base">Download all employees</CardTitle>
                    <CardDescription>
                      Creates one ZIP. Inside: one folder per employee, each with a period PDF.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={periodMode === "year" ? "default" : "secondary"}
                        onClick={() => setPeriodMode("year")}
                      >
                        Yearly
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={periodMode === "range" ? "default" : "secondary"}
                        onClick={() => setPeriodMode("range")}
                      >
                        Custom range
                      </Button>
                    </div>
                    {periodMode === "year" ? (
                      <label className="block text-sm">
                        <span className="mb-1 block text-zinc-400">Year</span>
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          value={periodYear}
                          onChange={(e) => setPeriodYear(Number(e.target.value || DateTime.now().year))}
                          className="w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2"
                        />
                      </label>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-sm">
                          <span className="mb-1 block text-zinc-400">From</span>
                          <SearchableSelect
                            value={periodStartMonth}
                            onValueChange={setPeriodStartMonth}
                            includeEmpty={false}
                            options={monthOptions}
                            searchPlaceholder="Search month..."
                            triggerClassName="h-10 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-900"
                            popoverContentClassName="z-[1500] border-white/10 bg-zinc-950 text-zinc-100"
                            listClassName="max-h-[min(260px,40vh)]"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-zinc-400">To</span>
                          <SearchableSelect
                            value={periodEndMonth}
                            onValueChange={setPeriodEndMonth}
                            includeEmpty={false}
                            options={monthOptions}
                            searchPlaceholder="Search month..."
                            triggerClassName="h-10 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-900"
                            popoverContentClassName="z-[1500] border-white/10 bg-zinc-950 text-zinc-100"
                            listClassName="max-h-[min(260px,40vh)]"
                          />
                        </label>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={() => setPeriodOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="button" disabled={downloadingAll} onClick={() => void downloadAllEmployeesZip()}>
                        {downloadingAll ? "Preparing..." : "Download ZIP"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>,
              document.body
            )
          : null}
        {downloadingAll && mounted && typeof document !== "undefined"
          ? createPortal(
              <div className="fixed inset-0 z-1360 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm" />
                <Card className="relative z-1 w-full max-w-lg border border-white/10 bg-zinc-950 text-zinc-100">
                  <CardHeader>
                    <CardTitle className="text-base">Preparing download</CardTitle>
                    <CardDescription>Please wait while we prepare all employees working hours.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                      <p className="font-medium">{downloadStatus}</p>
                      <p className="mt-1 text-zinc-400">
                        Progress: {downloadDoneCount} / {downloadTotalCount}
                      </p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-cyan-500 transition-all"
                          style={{
                            width:
                              downloadTotalCount > 0
                                ? `${Math.min(
                                    100,
                                    Math.round((downloadDoneCount / downloadTotalCount) * 100)
                                  )}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                      <p className="text-zinc-400">Current employee</p>
                      <p className="font-medium">{downloadCurrentEmployee || "Starting..."}</p>
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" variant="destructive" onClick={cancelAllEmployeesDownload}>
                        Cancel download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>,
              document.body
            )
          : null}
      </div>
    </div>
  );
}
