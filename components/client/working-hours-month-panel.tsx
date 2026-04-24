"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getBrowserTimeZone, normalizeTimeZoneId } from "@/lib/date/time-zone";
import { MONTHLY_REGULAR_CAP_HOURS } from "@/lib/attendance/month-hours-cap";
import { WorkingHoursMonthPickerCard } from "@/components/client/working-hours-month-picker-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar, monthLabelForModeYm, convertMonthMode, currentMonthYyyyMmForMode, adIsoToBsIso } from "@/lib/date/bs-calendar";
import { Loader2 } from "lucide-react";

type DayRow = {
  day: string;
  regularSessionMs: number;
  approvedOvertimeMs: number;
  approvedOffsiteMs: number;
  totalMs: number;
};

type Payload = {
  month: string;
  zone: string;
  days: DayRow[];
  entries: {
    id: string;
    day: string;
    kind: "on_site" | "overtime" | "off_site";
    inTime: string;
    outTime: string;
    dutyHours: number;
    workPlace: string;
    schedule: string;
    remark: string;
  }[];
  worker: { id: string; employeeId: string | null; name: string | null; designation: string | null };
  totalHours: number;
  approvedOffsiteHours: number;
  approvedClockOvertimeHours: number;
  onSiteSessionHours: number;
  regularHoursUpToCap: number;
  hoursOverCapAsOvertime: number;
};

function fmtHr(h: number): string {
  return `${h.toFixed(2)}`;
}



function kindLabel(kind: Payload["entries"][number]["kind"]): string {
  if (kind === "on_site") return "On-site";
  if (kind === "off_site") return "Off-site";
  return "Overtime";
}

export function WorkingHoursMonthPanel({
  workerId,
  wageRate,
  overtimeRate,
}: {
  /** When set, loads that user (admin only). When omitted, loads the signed-in user. */
  workerId?: string;
  /** Regular hourly wage rate in Rs. Used to compute Regular Wage. */
  wageRate?: number;
  /** Overtime hourly wage rate in Rs. Used to compute Overtime Wage (separate from regular). */
  overtimeRate?: number;
}) {
  const { mode } = useCalendarMode();
  const { user: viewer } = useDashboardUser();
  const canEdit = viewer?.role === "admin" || viewer?.role === "super_admin";

  const isEmployeeSelf = !workerId;
  const effectiveSalaryAccess =
    viewer?.role === "admin" || viewer?.role === "super_admin"
      ? true
      : isEmployeeSelf
      ? viewer?.salarySheetAccess
      : false;
  const effectiveWageRate = wageRate ?? (isEmployeeSelf && effectiveSalaryAccess ? viewer?.wageRate : undefined);
  const effectiveOvertimeRate = overtimeRate ?? (isEmployeeSelf && effectiveSalaryAccess ? viewer?.overtimeRate : undefined);

  let otTypeStr = "Same";
  if (typeof effectiveWageRate === "number" && typeof effectiveOvertimeRate === "number") {
    const ratio = effectiveOvertimeRate / effectiveWageRate;
    if (Math.abs(ratio - 1.5) < 0.01) otTypeStr = "1.5x";
    else if (Math.abs(ratio - 1.0) >= 0.01) otTypeStr = "Custom";
  }

  const [data, setData] = React.useState<Payload | null>(null);
  const zone = React.useMemo(() => {
    if (data?.zone) return data.zone;
    if (!workerId) return normalizeTimeZoneId(viewer?.timeZone) ?? getBrowserTimeZone();
    return getBrowserTimeZone();
  }, [data?.zone, workerId, viewer?.timeZone]);

  const [month, setMonth] = React.useState(() =>
    currentMonthYyyyMmForMode(mode, getBrowserTimeZone())
  );
  const [loading, setLoading] = React.useState(false);
  const [edits, setEdits] = React.useState<
    Record<string, { inTime: string; outTime: string; dutyHours: string; workPlace: string; remark: string }>
  >({});
  const [year, setYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode(mode, zone);
    return Number(current.split("-")[0]) || DateTime.now().setZone(zone).year;
  });
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [periodMode, setPeriodMode] = React.useState<"year" | "range">("year");
  const [periodYear, setPeriodYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode(mode, zone);
    return Number(current.split("-")[0]) || DateTime.now().setZone(zone).year;
  });
  const [periodStartMonth, setPeriodStartMonth] = React.useState(() => currentMonthYyyyMmForMode(mode, zone));
  const [periodEndMonth, setPeriodEndMonth] = React.useState(() => currentMonthYyyyMmForMode(mode, zone));
  const [mounted, setMounted] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [savingEdits, setSavingEdits] = React.useState(false);
  
  const [downloadStatus, setDownloadStatus] = React.useState("");
  const [downloadDoneCount, setDownloadDoneCount] = React.useState(0);
  const [downloadTotalCount, setDownloadTotalCount] = React.useState(0);
  const cancelDownloadRef = React.useRef(false);
  const activeFetchControllerRef = React.useRef<AbortController | null>(null);

  const cancelDownload = React.useCallback(() => {
    cancelDownloadRef.current = true;
    setDownloadStatus("Cancelling download...");
    activeFetchControllerRef.current?.abort();
  }, []);

  const prevModeRef = React.useRef(mode);

  React.useEffect(() => {
    if (prevModeRef.current !== mode) {
      setMonth(prev => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodStartMonth(prev => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodEndMonth(prev => convertMonthMode(prev, prevModeRef.current, mode));
      prevModeRef.current = mode;
    }
  }, [mode]);

  const monthOptions = React.useMemo(() => {
    const now = DateTime.now().setZone(zone);
    let startYear = 2020;
    let endYear = now.year + 1;
    if (mode === "bs") {
       const bsNow = adIsoToBsIso(now.toISODate()!).split("-").map(Number);
       startYear = 2077;
       endYear = bsNow[0]! + 1;
    }
    const out: Array<{ value: string; label: string }> = [];
    for (let y = endYear; y >= startYear; y--) {
      for (let m = 12; m >= 1; m--) {
        const value = `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}`;
        out.push({ value, label: monthLabelForModeYm(y, m, mode) });
      }
    }
    return out;
  }, [mode, zone]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const q = new URLSearchParams({ month, mode });
      if (workerId) q.set("workerId", workerId);
      const res = await fetch(`/api/attendance/working-hours?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, workerId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setEdits({});
  }, [month, workerId]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const titleMonth = React.useMemo(() => {
    const dt = month.split("-").map(Number);
    if (dt.length === 2 && Number.isFinite(dt[0]) && Number.isFinite(dt[1])) {
      return monthLabelForModeYm(dt[0]!, dt[1]!, mode);
    }
    return month;
  }, [mode, month]);

  const handleEditChange = React.useCallback(
    (id: string, field: string, value: string, r: Payload["entries"][number]) => {
      setEdits((prev) => {
        const current = prev[id] || {
          inTime: r.inTime,
          outTime: r.outTime,
          dutyHours: r.dutyHours.toFixed(2),
          workPlace: r.workPlace,
          remark: r.remark,
        };
        const updated = { ...current, [field]: value };
        
        if (field === "inTime" || field === "outTime") {
          const t1 = DateTime.fromFormat(updated.inTime.trim(), "h:mm a");
          const t2 = DateTime.fromFormat(updated.outTime.trim(), "h:mm a");
          if (t1.isValid && t2.isValid) {
            let diff = t2.diff(t1, "hours").hours;
            if (diff < 0) diff += 24;
            updated.dutyHours = diff.toFixed(2);
          }
        }
        return { ...prev, [id]: updated };
      });
    },
    []
  );

  const saveEdits = React.useCallback(async () => {
    const editKeys = Object.keys(edits);
    if (editKeys.length === 0) return;
    setSavingEdits(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      
      const payloadEdits = editKeys.map((rowId) => ({
        rowId,
        inTime: edits[rowId]!.inTime,
        outTime: edits[rowId]!.outTime,
        dutyHours: Number(edits[rowId]!.dutyHours),
        workPlace: edits[rowId]!.workPlace,
        remark: edits[rowId]!.remark,
      }));

      const res = await fetch("/api/attendance/update-records", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workerId: workerId || u.uid,
          month,
          edits: payloadEdits,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save edits");
      
      toast.success("Changes saved successfully!");
      setEdits({});
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save edits");
    } finally {
      setSavingEdits(false);
    }
  }, [edits, month, workerId, load]);

  const mergedRows = React.useMemo(() => {
    if (!data) return [];
    return data.entries.map((r) => {
      const override = edits[r.id];
      const duty =
        override && override.dutyHours.trim().length > 0
          ? Number(override.dutyHours)
          : r.dutyHours;
      return {
        ...r,
        inTime: override?.inTime ?? r.inTime,
        outTime: override?.outTime ?? r.outTime,
        dutyHours: Number.isFinite(duty) ? Math.max(0, duty) : r.dutyHours,
        workPlace: override?.workPlace ?? r.workPlace,
        remark: override?.remark ?? r.remark,
      };
    });
  }, [data, edits]);

  const groupedRows = React.useMemo(() => {
    const map = new Map<string, typeof mergedRows>();
    for (const row of mergedRows) {
      const list = map.get(row.day);
      if (list) list.push(row);
      else map.set(row.day, [row]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mergedRows]);

  const totalsFromRows = React.useMemo(() => {
    let onSite = 0;
    let offSite = 0;
    let overtime = 0;
    for (const r of mergedRows) {
      if (r.kind === "on_site") onSite += r.dutyHours;
      else if (r.kind === "off_site") offSite += r.dutyHours;
      else overtime += r.dutyHours;
    }
    const total = onSite + offSite + overtime;
    return { onSite, offSite, overtime, total };
  }, [mergedRows]);

  async function fetchLogoDataUrl(): Promise<string | null> {
    try {
      const res = await fetch("/branding/mtes-logo.png");
      if (!res.ok) return null;
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return dataUrl || null;
    } catch {
      return null;
    }
  }

  const renderPdf = React.useCallback(async (list: Payload[], titlePeriod: string, fileSuffix: string, pdfWageRate?: number, pdfOvertimeRate?: number) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const logo = await fetchLogoDataUrl();
    const workerMeta = list[0]?.worker;
    const marginX = 40;

    const drawHeader = (monthLabel: string) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      const centerX = pageWidth / 2;
      const y = 14;
      // Logo left-aligned, compact size
      if (logo) doc.addImage(logo, "PNG", marginX, y, 36, 36);
      // Company name centered
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("MASS TECHNOLOGY AND ENGINEERING SOLUTION PVT. LTD", centerX, y + 12, { align: "center" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("KAGESHWORI MANOHARA-09, KATHMANDU", centerX, y + 22, { align: "center" });
      doc.text("info@masstech.com.np  |  masstechno2020@gmail.com", centerX, y + 31, { align: "center" });
      doc.text("9851358290  |  9842995084", centerX, y + 40, { align: "center" });
      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(marginX, y + 46, pageWidth - marginX, y + 46);
      // "Attendance Sheet"
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Attendance Sheet", centerX, y + 57, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`Employee: ${workerMeta?.name ?? "-"}`, marginX, y + 69);
      doc.text(`Employee ID: ${workerMeta?.employeeId ?? "-"}`, marginX + 175, y + 69);
      doc.text(`Designation: ${workerMeta?.designation ?? "-"}`, marginX + 355, y + 69);
      doc.text(`Month: ${monthLabel}`, marginX, y + 80);
      doc.text(`Period: ${titlePeriod}`, marginX + 250, y + 80);
      return y + 92;
    };

    let yearlyOn = 0;
    let yearlyOt = 0;
    let yearlyOff = 0;
    let yearlyTotal = 0;

    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (i > 0) doc.addPage("a4");
      const pMonthParts = p.month.split("-").map(Number);
      const monthLabel =
        pMonthParts.length === 2 && Number.isFinite(pMonthParts[0]) && Number.isFinite(pMonthParts[1])
          ? monthLabelForModeYm(pMonthParts[0]!, pMonthParts[1]!, mode)
          : p.month;
      const startY = drawHeader(monthLabel);
      const tableRows: Array<[string, string, string, string, string, string, string, string]> =
        p.entries.map((r) => [
          mode === "bs" ? formatIsoForCalendar(r.day, "bs", p.zone) : r.day,
          DateTime.fromISO(r.day, { zone: p.zone }).toFormat("ccc"),
          kindLabel(r.kind),
          r.inTime,
          r.outTime,
          r.dutyHours.toFixed(2),
          r.workPlace,
          r.remark === "No work entry" ? "No entry" : (r.remark || "-"),
        ]);
      autoTable(doc, {
        startY,
        head: [
          [
            "Date",
            "Day",
            "Type",
            "In Time",
            "Out Time",
            "Duty Hours",
            "Work Place",
            "Remark",
          ],
        ],
        body: tableRows,
        foot: [
          [
            { content: "", colSpan: 2 },
            { content: "Month total" },
            { content: "", colSpan: 2 },
            { content: p.totalHours.toFixed(2) },
            { content: `On-site ${p.onSiteSessionHours.toFixed(2)} | OT ${p.approvedClockOvertimeHours.toFixed(2)} | Off-site ${p.approvedOffsiteHours.toFixed(2)}`, colSpan: 3 },
          ],
          ...((typeof pdfWageRate === "number" || typeof pdfOvertimeRate === "number")
            ? (() => {
                const rRate = pdfWageRate ?? 0;
                const oRate = pdfOvertimeRate ?? 0;
                const regWage = p.regularHoursUpToCap * rRate;
                const otWage = p.hoursOverCapAsOvertime * oRate;
                return [[
                  { content: `Regular Wage: Rs. ${regWage.toFixed(2)}`, colSpan: 3 },
                  { content: `Overtime Wage: Rs. ${otWage.toFixed(2)}`, colSpan: 3 },
                  { content: `Total Wage: Rs. ${(regWage + otWage).toFixed(2)}`, colSpan: 3 },
                ]];
              })()
            : []),
        ],
        showFoot: "lastPage",
        styles: { fontSize: 8, cellPadding: 5.5 },
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontSize: 8, cellPadding: 5.5 },
        footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontSize: 8, cellPadding: 5.5 },
      });
      yearlyOn += p.onSiteSessionHours;
      yearlyOt += p.approvedClockOvertimeHours;
      yearlyOff += p.approvedOffsiteHours;
      yearlyTotal += p.totalHours;
    }

    if (list.length > 1) {
      doc.addPage("a4");
      const y = drawHeader("Final summary");
      const yearlyRegular = Math.min(yearlyTotal, MONTHLY_REGULAR_CAP_HOURS * list.length);
      const yearlyOverCap = Math.max(0, yearlyTotal - MONTHLY_REGULAR_CAP_HOURS * list.length);
      autoTable(doc, {
        startY: y,
        head: [["Metric", "Hours", ...((typeof pdfWageRate === "number" || typeof pdfOvertimeRate === "number") ? ["Amount (Rs.)"] : [])]],
        body: (() => {
          const hasRates = typeof pdfWageRate === "number" || typeof pdfOvertimeRate === "number";
          const rRate = pdfWageRate ?? 0;
          const oRate = pdfOvertimeRate ?? 0;
          const yearlyRegularWage = yearlyRegular * rRate;
          const yearlyOvertimeWage = yearlyOverCap * oRate;
          return [
            ["On-site total", yearlyOn.toFixed(2), ...(hasRates ? ["-"] : [])],
            ["Overtime total", yearlyOt.toFixed(2), ...(hasRates ? ["-"] : [])],
            ["Off-site total", yearlyOff.toFixed(2), ...(hasRates ? ["-"] : [])],
            ["Regular up to cap", yearlyRegular.toFixed(2), ...(hasRates ? [`Rs. ${yearlyRegularWage.toFixed(2)}`] : [])],
            ["Over cap (overtime)", yearlyOverCap.toFixed(2), ...(hasRates ? [`Rs. ${yearlyOvertimeWage.toFixed(2)}`] : [])],
            ["Grand total", yearlyTotal.toFixed(2), ...(hasRates ? [`Rs. ${(yearlyRegularWage + yearlyOvertimeWage).toFixed(2)}`] : [])],
          ];
        })(),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
      });
    }

    doc.save(`working-hours-${workerMeta?.employeeId ?? workerMeta?.id ?? "employee"}-${fileSuffix}.pdf`);
  }, []);

  const downloadMonthPdf = React.useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await renderPdf([data], titleMonth, month, effectiveWageRate, effectiveOvertimeRate);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }, [data, month, renderPdf, titleMonth, effectiveWageRate, effectiveOvertimeRate]);

  const downloadYearPdf = React.useCallback(async () => {
    cancelDownloadRef.current = false;
    setDownloading(true);
    setDownloadStatus("Gathering year data...");
    setDownloadDoneCount(0);
    setDownloadTotalCount(12);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months = Array.from({ length: 12 }, (_, i) =>
        `${String(year).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`
      );
      const list: Payload[] = [];
      let done = 0;
      for (const m of months) {
        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const q = new URLSearchParams({ month: m, mode });
        if (workerId) q.set("workerId", workerId);
        
        const controller = new AbortController();
        activeFetchControllerRef.current = controller;
        
        const res = await fetch(`/api/attendance/working-hours?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        
        activeFetchControllerRef.current = null;
        
        const json = (await res.json()) as Payload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed to load ${m}`);
        list.push(json);
        done++;
        setDownloadDoneCount(done);
      }
      
      setDownloadStatus("Generating PDF...");
      await renderPdf(list, `${year}`, `${year}`, effectiveWageRate, effectiveOvertimeRate);
      toast.success("PDF downloaded!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download PDF";
      if (/cancelled|abort/i.test(msg)) toast.message("Download cancelled.");
      else toast.error(msg);
    } finally {
      setDownloading(false);
      activeFetchControllerRef.current = null;
    }
  }, [renderPdf, workerId, year, zone, effectiveWageRate, effectiveOvertimeRate, mode]);

  const downloadPeriodPdf = React.useCallback(async () => {
    cancelDownloadRef.current = false;
    setDownloading(true);
    setDownloadStatus("Gathering period data...");
    setDownloadDoneCount(0);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months =
        periodMode === "year"
          ? Array.from({ length: 12 }, (_, i) =>
              `${String(periodYear).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`
            )
          : (() => {
              const s = DateTime.fromFormat(periodStartMonth, "yyyy-MM", { zone });
              const e = DateTime.fromFormat(periodEndMonth, "yyyy-MM", { zone });
              if (!s.isValid || !e.isValid || e < s) throw new Error("Invalid month range");
              const out: string[] = [];
              let c = s.startOf("month");
              while (c <= e) {
                out.push(c.toFormat("yyyy-MM"));
                c = c.plus({ months: 1 });
              }
              return out;
            })();

      setDownloadTotalCount(months.length);
      const list: Payload[] = [];
      let done = 0;
      for (const m of months) {
        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const q = new URLSearchParams({ month: m, mode });
        if (workerId) q.set("workerId", workerId);
        
        const controller = new AbortController();
        activeFetchControllerRef.current = controller;
        
        const res = await fetch(`/api/attendance/working-hours?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        
        activeFetchControllerRef.current = null;
        
        const json = (await res.json()) as Payload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed to load ${m}`);
        list.push(json);
        done++;
        setDownloadDoneCount(done);
      }
      
      setDownloadStatus("Generating PDF...");
      const title =
        periodMode === "year"
          ? `${periodYear}`
          : `${periodStartMonth} to ${periodEndMonth}`;
      const suffix =
        periodMode === "year"
          ? `${periodYear}`
          : `${periodStartMonth}-${periodEndMonth}`;
      await renderPdf(list, title, suffix, effectiveWageRate, effectiveOvertimeRate);
      setPeriodOpen(false);
      toast.success("PDF downloaded!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download PDF";
      if (/cancelled|abort/i.test(msg)) toast.message("Download cancelled.");
      else toast.error(msg);
    } finally {
      setDownloading(false);
      activeFetchControllerRef.current = null;
    }
  }, [mode, periodEndMonth, periodMode, periodStartMonth, periodYear, renderPdf, workerId, zone, effectiveWageRate, effectiveOvertimeRate]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <WorkingHoursMonthPickerCard
          value={month}
          onChange={setMonth}
          zone={zone}
          disabled={loading && !data}
        />
        {loading && data ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Updating…</p>
        ) : null}

        {effectiveSalaryAccess && typeof effectiveWageRate === "number" ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-200/50 bg-emerald-50/50 px-4 py-3 text-sm dark:border-emerald-500/10 dark:bg-emerald-500/5">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Wages/Day(रू)</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{(effectiveWageRate * 8).toFixed(2)}</span>
            </div>
            <div className="h-8 w-px bg-emerald-200/50 dark:bg-emerald-500/10" />
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Wages/hr(रू)</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{effectiveWageRate.toFixed(2)}</span>
            </div>
            <div className="h-8 w-px bg-emerald-200/50 dark:bg-emerald-500/10" />
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-500">OT Type</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{otTypeStr}</span>
            </div>
            <div className="h-8 w-px bg-emerald-200/50 dark:bg-emerald-500/10" />
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-500">OT Rate(रू/hr)</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{(effectiveOvertimeRate ?? effectiveWageRate).toFixed(2)}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-end justify-end gap-2">
          <label className="text-xs text-zinc-500">
            Yearly PDF
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
              className="ml-2 w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
            />
          </label>
          <Button type="button" variant="secondary" disabled={downloading} onClick={() => void downloadYearPdf()}>
            {downloading ? "Preparing..." : "Download Year PDF"}
          </Button>
          <Button type="button" variant="secondary" disabled={downloading} onClick={() => setPeriodOpen(true)}>
            Period-wise PDF
          </Button>
        </div>
      </div>
      {periodOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-1360 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
                aria-label="Close period modal"
                onClick={() => setPeriodOpen(false)}
              />
              <Card className="relative z-1 w-full max-w-md border border-white/10 bg-zinc-950 text-zinc-100">
                <CardHeader>
                  <CardTitle className="text-base">Download period PDF</CardTitle>
                  <CardDescription>Choose yearly or custom month range export.</CardDescription>
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
                        onChange={(e) => setPeriodYear(Number(e.target.value) || new Date().getFullYear())}
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
                    <Button type="button" disabled={downloading} onClick={() => void downloadPeriodPdf()}>
                      {downloading ? "Preparing..." : "Download"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : null}

      {data ? (
        <div className="relative">
          {loading ? (
            <div className="pointer-events-auto absolute inset-0 z-20 rounded-2xl bg-zinc-950/15 backdrop-blur-[1px]">
              <div className="space-y-4 p-3 sm:p-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
              </div>
            </div>
          ) : null}
          <div className={cn(loading && "select-none blur-[1px]")}>

          {(typeof effectiveWageRate === "number" || typeof effectiveOvertimeRate === "number") && data && (() => {
            const rRate = effectiveWageRate ?? 0;
            const oRate = effectiveOvertimeRate ?? 0;
            const regularWage = data.regularHoursUpToCap * rRate;
            const overtimeWage = data.hoursOverCapAsOvertime * oRate;
            const totalWage = regularWage + overtimeWage;
            return (
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-emerald-200/80 dark:border-emerald-500/25">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Regular Wage</CardTitle>
                    <CardDescription>
                      {data.regularHoursUpToCap.toFixed(2)} h × Rs. {rRate.toFixed(2)}/hr
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      Rs. {regularWage.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200/80 dark:border-amber-500/25">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Overtime Wage</CardTitle>
                    <CardDescription>
                      {data.hoursOverCapAsOvertime.toFixed(2)} h × Rs. {oRate.toFixed(2)}/hr
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      Rs. {overtimeWage.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-cyan-200/80 dark:border-cyan-500/25">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Total Wage</CardTitle>
                    <CardDescription>Regular + Overtime</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">
                      Rs. {totalWage.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Month timeline</CardTitle>
              <CardDescription>
                Per-day entries with editable duty hours and remarks. Same day can show on-site,
                overtime, and off-site as separate rows.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <p className="text-xs text-zinc-500">Monthly export for {titleMonth}</p>
                <div className="flex gap-2">
                  {canEdit && Object.keys(edits).length > 0 && (
                    <Button
                      type="button"
                      disabled={savingEdits}
                      onClick={() => void saveEdits()}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {savingEdits ? "Saving..." : "Save Changes"}
                    </Button>
                  )}
                  <Button type="button" variant="secondary" disabled={downloading} onClick={() => void downloadMonthPdf()}>
                    {downloading ? "Preparing PDF..." : "Download PDF"}
                  </Button>
                </div>
              </div>
              <table className="w-full min-w-[940px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Day</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">In Time</th>
                    <th className="py-2 pr-3">Out Time</th>
                    <th className="py-2 pr-3">Duty Hours</th>
                    <th className="py-2 pr-3">Work Place</th>
                    <th className="py-2">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map(([day, rows]) => {
                    const dt = DateTime.fromISO(day, { zone });
                    const dow = dt.isValid ? dt.toFormat("ccc") : "";
                    const weekend = dt.isValid && (dt.weekday === 6 || dt.weekday === 7);
                    return rows.map((r, idx) => (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b border-zinc-100 dark:border-white/5",
                          weekend && "bg-zinc-50/80 dark:bg-white/3"
                        )}
                      >
                        {idx === 0 ? (
                          <>
                            <td
                              rowSpan={rows.length}
                              className="py-1.5 pr-3 align-top font-mono text-xs text-zinc-600 dark:text-zinc-400"
                            >
                              {mode === "bs" ? formatIsoForCalendar(day, "bs", zone) : day}
                            </td>
                            <td
                              rowSpan={rows.length}
                              className="py-1.5 pr-3 align-top text-zinc-600 dark:text-zinc-300"
                            >
                              {dow}
                            </td>
                          </>
                        ) : null}
                        <td className="py-1.5 pr-3">{kindLabel(r.kind)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {canEdit ? (
                            <input
                              type="text"
                              value={edits[r.id]?.inTime ?? r.inTime}
                              onChange={(e) => handleEditChange(r.id, "inTime", e.target.value, r)}
                              className="w-20 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
                            />
                          ) : (
                            r.inTime
                          )}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {canEdit ? (
                            <input
                              type="text"
                              value={edits[r.id]?.outTime ?? r.outTime}
                              onChange={(e) => handleEditChange(r.id, "outTime", e.target.value, r)}
                              className="w-20 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
                            />
                          ) : (
                            r.outTime
                          )}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {canEdit ? (
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              value={edits[r.id]?.dutyHours ?? r.dutyHours.toFixed(2)}
                              onChange={(e) => handleEditChange(r.id, "dutyHours", e.target.value, r)}
                              className="w-20 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
                            />
                          ) : (
                            fmtHr(r.dutyHours)
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          {canEdit ? (
                            <input
                              type="text"
                              value={edits[r.id]?.workPlace ?? r.workPlace}
                              onChange={(e) => handleEditChange(r.id, "workPlace", e.target.value, r)}
                              className="w-full min-w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
                            />
                          ) : (
                            r.workPlace
                          )}
                        </td>
                        <td className="py-1.5">
                          {canEdit ? (
                            <input
                              type="text"
                              value={edits[r.id]?.remark ?? r.remark}
                              onChange={(e) => handleEditChange(r.id, "remark", e.target.value, r)}
                              className="w-full min-w-36 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
                            />
                          ) : (
                            r.remark
                          )}
                        </td>
                      </tr>
                    ));
                  })}
                  <tr className="border-t-2 border-zinc-300 bg-zinc-100/80 font-medium dark:border-white/20 dark:bg-white/6">
                    <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-200" colSpan={5}>Month total (edited)</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtHr(totalsFromRows.total)}</td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-zinc-600 dark:text-zinc-300" colSpan={2}>
                      On-site {fmtHr(totalsFromRows.onSite)} | OT {fmtHr(totalsFromRows.overtime)} | Off-site {fmtHr(totalsFromRows.offSite)}
                    </td>
                    <td className="py-2 tabular-nums">Cap+OT {fmtHr(Math.max(0, totalsFromRows.total - MONTHLY_REGULAR_CAP_HOURS))}</td>
                  </tr>
                  {(typeof wageRate === "number" || typeof overtimeRate === "number") && (() => {
                    const rRate = wageRate ?? 0;
                    const oRate = overtimeRate ?? 0;
                    const regularHrs = Math.min(totalsFromRows.total, MONTHLY_REGULAR_CAP_HOURS);
                    const overtimeHrs = Math.max(0, totalsFromRows.total - MONTHLY_REGULAR_CAP_HOURS);
                    const regularWage = regularHrs * rRate;
                    const overtimeWageAmt = overtimeHrs * oRate;
                    const totalWage = regularWage + overtimeWageAmt;
                    return (
                      <tr className="border-t border-zinc-200 bg-zinc-50/60 text-xs dark:border-white/10 dark:bg-white/3">
                        <td className="py-2 pr-3 tabular-nums" colSpan={3}>
                          <span className="text-zinc-500">Regular Wage:</span>{" "}
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            Rs. {regularWage.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2 pr-3 tabular-nums" colSpan={3}>
                          <span className="text-zinc-500">Overtime Wage:</span>{" "}
                          <span className="font-semibold text-amber-700 dark:text-amber-300">
                            Rs. {overtimeWageAmt.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2 tabular-nums font-semibold" colSpan={3}>
                          <span className="text-zinc-500">Total Wage:</span>{" "}
                          <span className="text-cyan-700 dark:text-cyan-300">
                            Rs. {totalWage.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </CardContent>
          </Card>
          </div>
        </div>
      ) : null}

      {/* Global Progress Modal */}
      {downloading && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/20 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900">
            <div className="p-6">
              <div className="mb-4 flex items-center gap-4">
                <div className="relative flex size-12 shrink-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-t-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)] animate-spin" />
                  <Loader2 className="size-5 text-cyan-500 animate-spin" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    {downloadStatus || "Processing..."}
                  </h3>
                </div>
              </div>

              {downloadTotalCount > 0 && (
                <div className="space-y-2 mt-6">
                  <div className="flex justify-between text-xs font-mono text-zinc-500 font-semibold">
                    <span>Progress</span>
                    <span>{downloadDoneCount} / {downloadTotalCount}</span>
                  </div>
                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-zinc-100 shadow-inner dark:bg-zinc-800">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-blue-600 shadow-[0_0_10px_rgba(6,182,212,0.8)] transition-all duration-300 ease-out"
                      style={{
                        width: downloadTotalCount > 0
                          ? `${Math.min(100, (downloadDoneCount / downloadTotalCount) * 100)}%`
                          : "0%"
                      }}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[spin_2s_linear_infinite]" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={cancelDownload}
                  className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 font-semibold"
                >
                  Cancel Process
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
