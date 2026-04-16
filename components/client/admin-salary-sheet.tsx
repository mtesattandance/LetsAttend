"use client";

import * as React from "react";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { WorkingHoursMonthPickerCard } from "@/components/client/working-hours-month-picker-card";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import {
  currentMonthYyyyMmForMode,
  convertMonthMode,
  monthLabelForModeYm,
  adIsoToBsIso,
  bsIsoToAdIso,
  bsMonthDays,
  BS_MONTHS,
  type CalendarMode,
} from "@/lib/date/bs-calendar";
import { getBrowserTimeZone } from "@/lib/date/time-zone";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ──────────────────────────────────────────────────────────────────

type Entry = {
  id: string;
  day: string; // AD ISO yyyy-MM-dd
  kind: "on_site" | "overtime" | "off_site";
  inTime: string;
  outTime: string;
  dutyHours: number;
  workPlace: string;
  schedule: string;
  remark: string;
};

type AdminUser = { id: string; name?: string; email?: string };

type HoursPayload = {
  month: string;
  zone: string;
  entries: Entry[];
  worker: {
    id: string;
    employeeId: string | null;
    name: string | null;
    designation: string | null;
  };
  totalHours: number;
  approvedOffsiteHours: number;
  approvedClockOvertimeHours: number;
  onSiteSessionHours: number;
  regularHoursUpToCap: number;
  hoursOverCapAsOvertime: number;
};

type Props = {
  workerId: string;
  wagesPerDay?: number | null;
  /** The overtime rate (Rs./hr) stored in Firestore — used to pre-fill the OT type toggle. */
  storedOvertimeRate?: number | null;
  onWagesPerDayChange?: (val: number | null) => void;
  wageSaving?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns every AD-ISO date in the calendar month that `month` (yyyy-MM) belongs to. */
function getMonthAdDates(month: string, mode: CalendarMode, zone: string): string[] {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return [];

  if (mode === "ad") {
    const start = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone });
    if (!start.isValid || !start.daysInMonth) return [];
    return Array.from({ length: start.daysInMonth }, (_, i) =>
      start.plus({ days: i }).toISODate()!
    );
  }

  // BS mode: iterate BS days, convert each to AD
  const numDays = bsMonthDays(y, m);
  const out: string[] = [];
  for (let d = 1; d <= numDays; d++) {
    const bsIso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const adIso = bsIsoToAdIso(bsIso);
    if (/^\d{4}-\d{2}-\d{2}$/.test(adIso)) out.push(adIso);
  }
  return out;
}

/** Display label for a date in the current calendar mode. */
function displayDate(adIso: string, mode: CalendarMode): string {
  if (mode === "bs") {
    const bs = adIsoToBsIso(adIso);
    return bs; // yyyy-MM-dd in BS
  }
  return adIso;
}

/** Full day-of-week name. */
function dayName(adIso: string, zone: string): string {
  return DateTime.fromISO(adIso, { zone }).toFormat("cccc");
}

/** Is this an AD ISO date a Saturday (weekday === 6)? */
function isSaturday(adIso: string, zone: string) {
  return DateTime.fromISO(adIso, { zone }).weekday === 6;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminSalarySheet({
  workerId,
  wagesPerDay,
  storedOvertimeRate,
  onWagesPerDayChange,
  wageSaving,
}: Props) {
  const { mode } = useCalendarMode();

  const [month, setMonth] = React.useState(() =>
    currentMonthYyyyMmForMode(mode, getBrowserTimeZone())
  );
  const [data, setData] = React.useState<HoursPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  /** Overtime type derived from / synced to Firestore */
  const [overtimeType, setOvertimeType] = React.useState<"same" | "1.5x" | "custom">("same");
  const [customOvertimeRate, setCustomOvertimeRate] = React.useState("");
  const [otSaving, setOtSaving] = React.useState(false);

  const [checkedByName, setCheckedByName] = React.useState("");
  const [verifiedByName, setVerifiedByName] = React.useState("");
  const [approvedByName, setApprovedByName] = React.useState("");
  const [checkedSigB64, setCheckedSigB64] = React.useState<string | null>(null);
  const [verifiedSigB64, setVerifiedSigB64] = React.useState<string | null>(null);
  const [approvedSigB64, setApprovedSigB64] = React.useState<string | null>(null);
  const [admins, setAdmins] = React.useState<AdminUser[]>([]);

  const loadAdmins = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch("/api/offsite-work/assignees", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok && data.assignees) setAdmins(data.assignees);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const createUploadHandler = React.useCallback((setter: (val: string | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setter(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setter(canvas.toDataURL("image/png"));
        } else {
          setter(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  /* Keep month in current mode when mode changes */
  const prevModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (prevModeRef.current !== mode) {
      setMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      prevModeRef.current = mode;
    }
  }, [mode]);

  const zone = data?.zone ?? getBrowserTimeZone();

  /* Load working-hours data */
  const load = React.useCallback(async () => {
    if (!workerId) return;
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const q = new URLSearchParams({ month, mode, workerId });
      const res = await fetch(`/api/attendance/working-hours?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as HoursPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error loading salary data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, workerId, mode]);

  React.useEffect(() => { void load(); }, [load]);

  // ── Detect OT type from stored Firestore rate whenever employee/wage changes ──
  React.useEffect(() => {
    if (
      storedOvertimeRate == null ||
      wagesPerDay == null ||
      wagesPerDay <= 0
    ) return;

    const wageHourly = wagesPerDay / 8;
    const ratio = storedOvertimeRate / wageHourly;

    if (Math.abs(ratio - 1.5) < 0.001) {
      setOvertimeType("1.5x");
      setCustomOvertimeRate("");
    } else if (Math.abs(ratio - 1.0) < 0.001) {
      setOvertimeType("same");
      setCustomOvertimeRate("");
    } else {
      // Custom rate — store the exact hourly value
      setOvertimeType("custom");
      setCustomOvertimeRate(storedOvertimeRate.toFixed(4));
    }
  }, [storedOvertimeRate, wagesPerDay]);

  /** Save OT rate to Firestore so the attendance panel picks it up */
  const saveOvertimeRate = React.useCallback(
    async (type: "same" | "1.5x" | "custom", customVal?: string) => {
      if (!wagesPerDay || wagesPerDay <= 0) return;
      const wageHourly = wagesPerDay / 8;
      let otRate: number;
      if (type === "1.5x") {
        otRate = wageHourly * 1.5;
      } else if (type === "custom") {
        const c = Number(customVal ?? customOvertimeRate);
        if (!Number.isFinite(c) || c < 0) return; // wait for valid input
        otRate = c;
      } else {
        otRate = wageHourly; // same
      }
      setOtSaving(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        await fetch("/api/admin/wage-rate", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ workerId, wageRate: wageHourly, overtimeRate: otRate }),
        });
      } catch {
        toast.error("Failed to save overtime rate");
      } finally {
        setOtSaving(false);
      }
    },
    [workerId, wagesPerDay, customOvertimeRate]
  );

  /** Handle toggle click: update state + persist */
  const handleOtTypeChange = (type: "same" | "1.5x" | "custom") => {
    setOvertimeType(type);
    if (type !== "custom") void saveOvertimeRate(type);
  };


  // ── Computed values ────────────────────────────────────────────────────────
  const wagePerHour = typeof wagesPerDay === "number" && wagesPerDay > 0 ? wagesPerDay / 8 : null;
  /** Effective overtime rate based on selection */
  const effectiveOvertimeRate = wagePerHour !== null
    ? overtimeType === "1.5x"
      ? wagePerHour * 1.5
      : overtimeType === "custom"
        ? (Number(customOvertimeRate) >= 0 && Number.isFinite(Number(customOvertimeRate)) ? Number(customOvertimeRate) : null)
        : wagePerHour // "same"
    : null;
  const regularHours = data?.regularHoursUpToCap ?? 0;
  const overtimeHours = data?.hoursOverCapAsOvertime ?? 0;
  const totalHours = data?.totalHours ?? 0;
  const regularWage = wagePerHour !== null ? regularHours * wagePerHour : null;
  const overtimeWage = effectiveOvertimeRate !== null ? overtimeHours * effectiveOvertimeRate : null;
  const totalWage = regularWage !== null && overtimeWage !== null ? regularWage + overtimeWage : null;
  const overtimeRemark =
    overtimeType === "1.5x" ? "1.5× of regular wage"
    : overtimeType === "custom" ? `custom rate: Rs. ${customOvertimeRate}/hr`
    : "same as normal wages";

  const titleMonth = React.useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) return monthLabelForModeYm(y!, m!, mode);
    return month;
  }, [month, mode]);

  // ── All days of the month ──────────────────────────────────────────────────
  const allDays = React.useMemo(() => getMonthAdDates(month, mode, zone), [month, mode, zone]);

  // Build a lookup: adIso → array of entries for that day
  const entriesByDay = React.useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of (data?.entries ?? [])) {
      const list = map.get(e.day) ?? [];
      list.push(e);
      map.set(e.day, list);
    }
    return map;
  }, [data]);

  // Per-day totals (aggregated across on_site / overtime / off_site)
  type DaySummary = {
    adIso: string;
    inTime: string;
    outTime: string;
    dutyHours: number;
    siteName: string;
    hasEntry: boolean;
  };

  const dayRows = React.useMemo<DaySummary[]>(() => {
    return allDays.map((adIso) => {
      const entries = entriesByDay.get(adIso) ?? [];
      if (entries.length === 0) return { adIso, inTime: "", outTime: "", dutyHours: 0, siteName: "", hasEntry: false };

      // Earliest inTime, latest outTime, sum of dutyHours
      let inTime = entries[0]!.inTime;
      let outTime = entries[0]!.outTime;
      let dutyHours = 0;
      let siteName = "";
      for (const e of entries) {
        if (e.inTime && (!inTime || e.inTime < inTime)) inTime = e.inTime;
        if (e.outTime && (!outTime || e.outTime > outTime)) outTime = e.outTime;
        dutyHours += e.dutyHours;
        if (!siteName && e.workPlace) siteName = e.workPlace;
      }
      return { adIso, inTime, outTime, dutyHours, siteName, hasEntry: true };
    });
  }, [allDays, entriesByDay]);

  const totalWorkingDays = totalHours > 0 ? totalHours / 8 : 0;

  // ── PDF generation ─────────────────────────────────────────────────────────
  async function fetchLogo() {
    try {
      const res = await fetch("/branding/mtes-logo.png");
      if (!res.ok) return null;
      const blob = await res.blob();
      const reader = new FileReader();
      return new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  const downloadSalaryPdf = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const logo = await fetchLogo();
      const marginX = 40;
      const pageWidth = doc.internal.pageSize.getWidth();
      const cx = pageWidth / 2;
      let y = 14;

      // Header
      if (logo) doc.addImage(logo, "PNG", marginX, y, 36, 36);
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text("MASS TECHNOLOGY AND ENGINEERING SOLUTION PVT. LTD", cx, y + 13, { align: "center" });
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text("KAGESHWORI MANOHARA-09, KATHMANDU", cx, y + 23, { align: "center" });
      doc.text("info@masstech.com.np, masstechno2020@gmail.com", cx, y + 32, { align: "center" });
      doc.text("9851358290, 9842995084", cx, y + 41, { align: "center" });
      doc.setDrawColor(180, 180, 180);
      doc.line(marginX, y + 47, pageWidth - marginX, y + 47);
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text("Salary Sheet", cx, y + 58, { align: "center" });

      // Employee meta
      y += 68;
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
      
      // Row 1
      doc.text(`Employee ID:`, marginX, y); 
      doc.setFont("helvetica", "bold"); 
      doc.text(data.worker.employeeId ?? "—", marginX + 90, y); 
      doc.setFont("helvetica", "normal");
      doc.text(`Month/Year:`, cx, y); 
      doc.text(titleMonth, cx + 90, y);
      y += 11;

      // Row 2
      doc.text(`Employee Names:`, marginX, y); 
      doc.setFont("helvetica", "bold"); 
      doc.text(data.worker.name ?? "—", marginX + 90, y); 
      doc.setFont("helvetica", "normal");
      doc.text(`Wages per day for 8 hrs:`, cx, y);
      doc.text(wagesPerDay != null ? String(wagesPerDay) : "—", cx + 120, y);
      y += 11;

      // Row 3
      doc.text(`Designation:`, marginX, y); 
      doc.setFont("helvetica", "bold"); 
      doc.text(data.worker.designation ?? "—", marginX + 90, y); 
      doc.setFont("helvetica", "normal");
      y += 8;

      // Day-by-day attendance table
      autoTable(doc, {
        startY: y + 4,
        head: [["Date", "Day", "In Time", "Out Time", "Duty Hours", "Site Name"]],
        body: [...dayRows.map((row) => {
          const sat = isSaturday(row.adIso, zone);
          const dayLabel = dayName(row.adIso, zone);
          return [
            displayDate(row.adIso, mode),
            dayLabel,
            row.hasEntry ? row.inTime : "",
            row.hasEntry ? row.outTime : "",
            row.hasEntry ? row.dutyHours.toFixed(2) : "-",
            row.siteName,
          ];
        }),
        [{ content: "Total Working Hours", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } }, { content: totalHours.toFixed(2), styles: { fontStyle: "bold" } }, ""],
        [{ content: "Total Working Days", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } }, { content: totalWorkingDays.toFixed(2), styles: { fontStyle: "bold" } }, ""],
        [{ content: "Total", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } }, { content: totalWorkingDays.toFixed(2), styles: { fontStyle: "bold" } }, ""],
        ],
        styles: { fontSize: 7.5, cellPadding: 3.5 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.5, lineColor: [0, 0, 0] },
        bodyStyles: { lineWidth: 0.3, lineColor: [180, 180, 180] },
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.row.index < dayRows.length) {
            const row = dayRows[hookData.row.index];
            if (row && isSaturday(row.adIso, zone)) {
              // Saturday: red day name cell
              if (hookData.column.index === 1) {
                hookData.cell.styles.textColor = [220, 38, 38];
              }
            }
          }
        },
      });

      const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y + 200;

      // Salary breakdown table
      autoTable(doc, {
        startY: lastY + 14,
        head: [["Description", "Hrs", "Amount", "Remarks"]],
        body: [
          ["Basic Salary", regularHours.toFixed(2), regularWage != null ? regularWage.toFixed(2) : "—", ""],
          ["Overtime", overtimeHours.toFixed(2), overtimeWage != null ? overtimeWage.toFixed(2) : "—", overtimeRemark],
          [{ content: "Total Salary", styles: { fontStyle: "bold" } },
            { content: (regularHours + overtimeHours).toFixed(2), styles: { fontStyle: "bold" } },
            { content: totalWage != null ? totalWage.toFixed(2) : "—", styles: { fontStyle: "bold" } },
            ""],
        ],
        styles: { fontSize: 8.5, cellPadding: 4 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.5, lineColor: [0, 0, 0] },
        bodyStyles: { lineWidth: 0.3, lineColor: [180, 180, 180] },
        columnStyles: { 2: { halign: "right" }, 1: { halign: "right" } },
      });

      const finalTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? lastY + 100;
      const signatureY = finalTableY + 60;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      // Left
      if (checkedSigB64) doc.addImage(checkedSigB64, "PNG", marginX, signatureY - 45, 60, 40);
      doc.text("checked by", marginX, signatureY);
      doc.text(checkedByName || "editable name", marginX, signatureY + 12);
      
      // Center
      if (verifiedSigB64) doc.addImage(verifiedSigB64, "PNG", cx - 40, signatureY - 45, 60, 40);
      doc.text("verified by", cx - 40, signatureY);
      doc.text(verifiedByName || "editable name", cx - 40, signatureY + 12);
      
      // Right
      if (approvedSigB64) {
        doc.addImage(approvedSigB64, "PNG", pageWidth - marginX - 80, signatureY - 45, 60, 40);
      }
      doc.text("approved by", pageWidth - marginX - 60, signatureY);
      doc.text(approvedByName || "editable name", pageWidth - marginX - 60, signatureY + 12);

      doc.save(`salary-${data.worker.employeeId ?? data.worker.id ?? "employee"}-${month}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Month Picker */}
      <WorkingHoursMonthPickerCard
        value={month}
        onChange={setMonth}
        zone={zone}
        disabled={loading && !data}
      />
      {loading && data ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Updating…</p>
      ) : null}

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : null}

      {data ? (
        <div className={cn("space-y-5", loading && "select-none opacity-60")}>

          {/* ── Wage Configuration ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Wage Configuration</CardTitle>
              <CardDescription>
                Wages per day for 8 hrs · Hourly and overtime are auto-calculated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Wages per Day (for 8 hrs) — Rs.
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={wagesPerDay ?? ""}
                    placeholder="e.g. 2500"
                    onChange={(e) =>
                      onWagesPerDayChange?.(e.target.value !== "" ? Number(e.target.value) : null)
                    }
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                  />
                  {wageSaving && <p className="mt-1 text-xs text-zinc-400">Saving…</p>}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Wages per Hour</p>
                  <div className="flex h-9 items-center rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 text-sm text-zinc-700 dark:border-white/8 dark:bg-zinc-900/50 dark:text-zinc-300">
                    {wagePerHour != null ? `Rs. ${wagePerHour.toFixed(4)}` : "—"}
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400">= wages/day ÷ 8</p>
                </div>
                {/* ── Overtime type selector ── */}
                <div>
                  <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Overtime Rate</p>
                  {/* 3-option toggle */}
                  <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-sm dark:border-white/15">
                    {([
                      { value: "same", label: "Same" },
                      { value: "1.5x", label: "1.5×" },
                      { value: "custom", label: "Custom" },
                    ] as const).map((opt, oi) => (
                      <button
                        key={opt.value}
                        id={`ot-${opt.value}-btn`}
                        type="button"
                        onClick={() => handleOtTypeChange(opt.value)}
                        className={cn(
                          "flex-1 px-2 py-1.5 text-center text-xs font-medium transition-colors",
                          oi > 0 && "border-l border-zinc-200 dark:border-white/15",
                          overtimeType === opt.value
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
                  {/* Custom rate input */}
                  {overtimeType === "custom" && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400">Rs./hr</span>
                      <input
                        id="ot-custom-rate-input"
                        type="number"
                        min={0}
                        step={0.01}
                        value={customOvertimeRate}
                        placeholder="0.00"
                        onChange={(e) => setCustomOvertimeRate(e.target.value)}
                        onBlur={(e) => void saveOvertimeRate("custom", e.target.value)}
                        className="h-7 w-28 rounded-lg border border-violet-300 bg-violet-50/50 px-2 text-xs tabular-nums text-violet-800 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-300"
                      />
                    </div>
                  )}
                  {/* Show the active rate */}
                  <div className={cn(
                    "mt-1.5 flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm tabular-nums",
                    overtimeType === "1.5x"
                      ? "border border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-300"
                      : overtimeType === "custom"
                      ? "border border-violet-200 bg-violet-50/60 text-violet-700 dark:border-violet-500/25 dark:bg-violet-950/30 dark:text-violet-300"
                      : "border border-zinc-100 bg-zinc-50 text-zinc-600 dark:border-white/8 dark:bg-zinc-900/50 dark:text-zinc-300"
                  )}>
                    {effectiveOvertimeRate != null
                      ? `Rs. ${effectiveOvertimeRate.toFixed(4)} / hr`
                      : overtimeType === "custom" ? "Enter rate above" : "Set wages/day first"}
                    {otSaving && (
                      <span className="ml-auto text-[10px] text-zinc-400">Saving…</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    {overtimeType === "1.5x" ? "= wages/hr × 1.5"
                      : overtimeType === "custom" ? "your specified rate per hour"
                      : "= wages/hr × 1 (same rate)"}
                  </p>
                </div>
              </div>
            </CardContent>
           </Card>

          {/* ── Sign-Off Details ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sign-Off Details</CardTitle>
              <CardDescription>
                Names and signature printed at the bottom of the PDF.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-2 grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Checked By Name
                  </label>
                  <SearchableSelect
                    value={checkedByName}
                    onValueChange={setCheckedByName}
                    options={admins.map((a) => ({
                      value: a.name || a.email || "Admin",
                      label: a.name || a.email || "Admin",
                      keywords: [a.name || "", a.email || ""],
                    }))}
                    emptyLabel="Select admin…"
                    searchPlaceholder="Search admins…"
                    triggerClassName="w-full h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                  />
                  <input
                    type="file"
                    accept="image/png"
                    onChange={createUploadHandler(setCheckedSigB64)}
                    className="mt-1 text-[10px] text-zinc-500 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-300 dark:hover:file:bg-zinc-700"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Verified By Name
                  </label>
                  <SearchableSelect
                    value={verifiedByName}
                    onValueChange={setVerifiedByName}
                    options={admins.map((a) => ({
                      value: a.name || a.email || "Admin",
                      label: a.name || a.email || "Admin",
                      keywords: [a.name || "", a.email || ""],
                    }))}
                    emptyLabel="Select admin…"
                    searchPlaceholder="Search admins…"
                    triggerClassName="w-full h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                  />
                  <input
                    type="file"
                    accept="image/png"
                    onChange={createUploadHandler(setVerifiedSigB64)}
                    className="mt-1 text-[10px] text-zinc-500 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-300 dark:hover:file:bg-zinc-700"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Approved By Name
                  </label>
                  <SearchableSelect
                    value={approvedByName}
                    onValueChange={setApprovedByName}
                    options={admins.map((a) => ({
                      value: a.name || a.email || "Admin",
                      label: a.name || a.email || "Admin",
                      keywords: [a.name || "", a.email || ""],
                    }))}
                    emptyLabel="Select admin…"
                    searchPlaceholder="Search admins…"
                    triggerClassName="w-full h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                  />
                  <input
                    type="file"
                    accept="image/png"
                    onChange={createUploadHandler(setApprovedSigB64)}
                    className="mt-1 text-[10px] text-zinc-500 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-300 dark:hover:file:bg-zinc-700"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Salary Sheet (full month table) ── */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Salary Sheet — {titleMonth}</CardTitle>
                  <CardDescription>
                    All days of the month · Saturday highlighted · Working hours wage &amp; overtime.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={downloading || !data}
                  onClick={() => void downloadSalaryPdf()}
                >
                  {downloading ? "Preparing…" : "Download PDF"}
                </Button>
              </div>
            </CardHeader>

            {/* Employee meta strip */}
            <div className="border-b border-zinc-100 px-5 py-3 dark:border-white/8">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-zinc-400">Employee ID</dt><dd className="font-mono font-medium">{data.worker.employeeId ?? "—"}</dd></div>
                <div><dt className="text-xs text-zinc-400">Month / Year</dt><dd>{titleMonth}</dd></div>
                
                <div className="col-span-2 sm:col-span-2"></div>

                <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-zinc-400">Employee Name</dt><dd className="font-medium">{data.worker.name ?? "—"}</dd></div>
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs text-zinc-400">Wages per day (for 8 hrs)</dt>
                  <dd className="font-semibold tabular-nums">
                    {wagesPerDay != null ? `Rs. ${wagesPerDay.toFixed(2)}` : "—"}
                  </dd>
                </div>
                
                <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-zinc-400">Designation</dt><dd>{data.worker.designation ?? "—"}</dd></div>
              </dl>
            </div>

            <CardContent className="overflow-x-auto p-0">
              {/* Day-by-day table */}
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-400">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Day</th>
                    <th className="px-3 py-2.5">In Time</th>
                    <th className="px-3 py-2.5">Out Time</th>
                    <th className="px-3 py-2.5 text-right">Duty Hours</th>
                    <th className="px-3 py-2.5">Site Name</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((row) => {
                    const sat = isSaturday(row.adIso, zone);
                    const dn = dayName(row.adIso, zone);
                    return (
                      <tr
                        key={row.adIso}
                        className={cn(
                          "border-b border-zinc-100 dark:border-white/5",
                          sat
                            ? "bg-red-50/50 dark:bg-red-950/10"
                            : row.hasEntry
                            ? "bg-white dark:bg-transparent"
                            : "bg-zinc-50/40 dark:bg-transparent"
                        )}
                      >
                        <td className="px-3 py-1.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {displayDate(row.adIso, mode)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-sm",
                            sat ? "font-semibold text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"
                          )}
                        >
                          {dn}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-zinc-600 dark:text-zinc-300">
                          {row.hasEntry ? row.inTime : ""}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-zinc-600 dark:text-zinc-300">
                          {row.hasEntry ? row.outTime : ""}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
                          {row.hasEntry ? row.dutyHours.toFixed(2) : (
                            <span className="text-zinc-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {row.siteName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-300 bg-zinc-100/80 dark:border-white/15 dark:bg-white/[0.03]">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      Total Working Hours
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-zinc-900 dark:text-zinc-100">
                      {totalHours.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/[0.02]">
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      Total Working Days
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                      {totalWorkingDays.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/[0.02]">
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      Total
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold text-zinc-900 dark:text-zinc-100">
                      {totalWorkingDays.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>

              {/* ── Salary breakdown (below main table, same as reference) ── */}
              <div className="mt-4 overflow-x-auto px-5 pb-5">
                <table className="w-full max-w-lg border-collapse text-sm">
                  <thead>
                    <tr className="border border-zinc-300 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-400">
                      <th className="border border-zinc-200 px-4 py-2.5 text-left dark:border-white/10">Description</th>
                      <th className="border border-zinc-200 px-4 py-2.5 text-right dark:border-white/10">Hrs</th>
                      <th className="border border-zinc-200 px-4 py-2.5 text-right dark:border-white/10">Amount</th>
                      <th className="border border-zinc-200 px-4 py-2.5 text-left dark:border-white/10">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border border-zinc-200 dark:border-white/10">
                      <td className="border border-zinc-200 px-4 py-2 dark:border-white/10">Basic Salary</td>
                      <td className="border border-zinc-200 px-4 py-2 text-right tabular-nums dark:border-white/10">
                        {regularHours.toFixed(2)}
                      </td>
                      <td className="border border-zinc-200 px-4 py-2 text-right tabular-nums dark:border-white/10 text-emerald-700 dark:text-emerald-400">
                        {regularWage != null ? regularWage.toFixed(2) : "—"}
                      </td>
                      <td className="border border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-white/10" />
                    </tr>
                    <tr className="border border-zinc-200 dark:border-white/10">
                      <td className="border border-zinc-200 px-4 py-2 dark:border-white/10">Overtime</td>
                      <td className="border border-zinc-200 px-4 py-2 text-right tabular-nums dark:border-white/10">
                        {overtimeHours.toFixed(2)}
                      </td>
                      <td className="border border-zinc-200 px-4 py-2 text-right tabular-nums dark:border-white/10 text-amber-700 dark:text-amber-400">
                        {overtimeWage != null ? overtimeWage.toFixed(2) : "—"}
                      </td>
                      <td className="border border-zinc-200 px-4 py-2 text-xs dark:border-white/10">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                          overtimeType === "1.5x"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                            : "bg-zinc-100 text-zinc-500 dark:bg-white/8 dark:text-zinc-400"
                        )}>
                          {overtimeRemark}
                        </span>
                      </td>
                    </tr>
                    <tr className="border border-zinc-300 bg-zinc-100/80 font-bold dark:border-white/15 dark:bg-white/[0.04]">
                      <td className="border border-zinc-200 px-4 py-2.5 dark:border-white/10">Total Salary</td>
                      <td className="border border-zinc-200 px-4 py-2.5 text-right tabular-nums dark:border-white/10">
                        {(regularHours + overtimeHours).toFixed(2)}
                      </td>
                      <td className="border border-zinc-200 px-4 py-2.5 text-right tabular-nums dark:border-white/10 text-cyan-700 dark:text-cyan-300">
                        {totalWage != null ? totalWage.toFixed(2) : "—"}
                      </td>
                      <td className="border border-zinc-200 px-4 py-2.5 dark:border-white/10" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
