"use client";

import * as React from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, FileDown, Loader2, RefreshCw } from "lucide-react";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import {
  currentMonthYyyyMmForMode,
  convertMonthMode,
  monthLabelForModeYm,
  adIsoToBsIso,
} from "@/lib/date/bs-calendar";
import { getBrowserTimeZone } from "@/lib/date/time-zone";
import { WorkingHoursMonthPickerCard } from "@/components/client/working-hours-month-picker-card";
import { DateField } from "@/components/ui/date-field";

// ─── Inlined types (no import from server route) ──────────────────────────────

type WagesWorkerRow = {
  workerId: string;
  name: string;
  employeeId: string | null;
  inTime: string;
  outTime: string;
  dutyHours: number;
  wagesPerDay: number | null;
  wagesPerHour: number | null;
  overtimeRate: number | null;
  totalAmount: number | null;
};

type WagesDayGroup = {
  date: string;
  workers: WagesWorkerRow[];
  totalManpower: number;
  totalAmount: number | null;
};

type AttendanceWagesData = {
  siteId: string;
  siteName: string;
  siteLocation: string | null;
  period: "day" | "month";
  value: string;
  days: WagesDayGroup[];
  error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRu(v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  return `Rs ${v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Show date per active calendar mode — BS when mode=bs, AD when mode=ad. Same as every other page. */
function displayDate(adIso: string, mode: "ad" | "bs"): string {
  if (mode === "bs") {
    try { return adIsoToBsIso(adIso); } catch { /* fallback */ }
  }
  return adIso;
}

type ViewMode = "month" | "day";

// ─── Component ────────────────────────────────────────────────────────────────

export function SiteAttendanceWagesPanel({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const { mode } = useCalendarMode();
  const zone = getBrowserTimeZone();

  const [viewMode, setViewMode] = React.useState<ViewMode>("month");
  const [month, setMonth] = React.useState(() =>
    currentMonthYyyyMmForMode(mode, zone)
  );
  const prevModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (prevModeRef.current !== mode) {
      setMonth((p) => convertMonthMode(p, prevModeRef.current, mode));
      prevModeRef.current = mode;
    }
  }, [mode]);

  const [singleDay, setSingleDay] = React.useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const [showWages, setShowWages] = React.useState(true);
  const [data, setData] = React.useState<AttendanceWagesData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  const titleMonth = React.useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m))
      return monthLabelForModeYm(y!, m!, mode);
    return month;
  }, [month, mode]);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const load = React.useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const period = viewMode === "month" ? "month" : "day";
      const value  = viewMode === "month" ? month : singleDay;

      const q = new URLSearchParams({ siteId, period, value, mode });
      const res = await fetch(`/api/admin/site-attendance-wages?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as AttendanceWagesData;
      if (!res.ok) throw new Error(json.error ?? "Failed to load attendance data");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [siteId, viewMode, month, singleDay, mode]);

  React.useEffect(() => { void load(); }, [load]);

  // ── Grand totals ──────────────────────────────────────────────────────
  const grandTotals = React.useMemo(() => {
    if (!data) return null;
    let totalManpower = 0;
    let totalAmount = 0;
    let hasAnyWages = false;   // at least one worker has a wage rate
    let allHaveWages = true;   // every worker has a wage rate
    for (const day of data.days) {
      if (day.workers.length === 0) continue; // skip empty days
      totalManpower += day.totalManpower;
      for (const w of day.workers) {
        if (w.totalAmount !== null) {
          totalAmount += w.totalAmount;
          hasAnyWages = true;
        } else {
          allHaveWages = false;
        }
      }
    }
    return {
      totalManpower,
      totalAmount: hasAnyWages ? totalAmount : null,
      isPartial: !allHaveWages && hasAnyWages,
    };
  }, [data]);

  // ── PDF export ────────────────────────────────────────────────────────
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

  const downloadPdf = async () => {
    if (!data || data.days.length === 0) return;
    setDownloading(true);
    try {
      const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
        fetchLogo(),
      ]);
      const autoTable = (autoTableMod as { default: typeof autoTableMod.default }).default;

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pw   = doc.internal.pageSize.getWidth();
      const cx   = pw / 2;
      const mx   = 40;
      let y = 14;

      // ── Header (same as salary sheet PDF) ─────────────────────────────
      if (logo) doc.addImage(logo, "PNG", mx, y, 36, 36);
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text("MASS TECHNOLOGY AND ENGINEERING SOLUTION PVT. LTD", cx, y + 13, { align: "center" });
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text("KAGESHWORI MANOHARA-09, KATHMANDU", cx, y + 23, { align: "center" });
      doc.text("info@masstech.com.np, masstechno2020@gmail.com",  cx, y + 32, { align: "center" });
      doc.text("9851358290, 9842995084", cx, y + 41, { align: "center" });
      doc.setDrawColor(180, 180, 180);
      doc.line(mx, y + 47, pw - mx, y + 47);
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text("Per Day Wages Report", cx, y + 58, { align: "center" });
      y += 68;

      // ── Project / site info ───────────────────────────────────────────
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
      doc.text("Project Name:",  mx, y); doc.setFont("helvetica", "bold"); doc.text(siteName, mx + 90, y); doc.setFont("helvetica", "normal");
      y += 11;
      if (data.siteLocation) {
        doc.text("Site Location:", mx, y); doc.setFont("helvetica", "bold"); doc.text(data.siteLocation, mx + 90, y); doc.setFont("helvetica", "normal");
        y += 11;
      }
      doc.text("Period:",        mx, y); doc.setFont("helvetica", "bold"); doc.text(titleMonth, mx + 90, y); doc.setFont("helvetica", "normal");
      y += 8;

      // ── Day-by-day tables ─────────────────────────────────────────────
      const cols = showWages
        ? ["S.N", "Employee Name", "In Time", "Out Time", "Total Hours", "Wages/Day (Rs)", "Total Amount (Rs)"]
        : ["S.N", "Employee Name", "In Time", "Out Time", "Total Hours"];

      for (const day of data.days) {
        y += 8;
        const dateLabel = `Date: ${displayDate(day.date, mode)}`;

        // Date banner row
        autoTable(doc, {
          startY: y,
          head: [[{ content: dateLabel, colSpan: cols.length, styles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8 } }]],
          body: [],
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { lineWidth: 0.5, lineColor: [0, 0, 0] },
          theme: "plain",
          margin: { left: mx, right: mx },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

        // Empty day
        if (day.workers.length === 0) {
          autoTable(doc, {
            startY: y,
            head: [],
            body: [[{ content: "No attendance recorded", colSpan: cols.length, styles: { textColor: [160, 160, 160], fontStyle: "italic", halign: "center" } }]],
            styles: { fontSize: 7.5, cellPadding: 3 },
            bodyStyles: { lineWidth: 0.3, lineColor: [200, 200, 200] },
            margin: { left: mx, right: mx },
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
          continue;
        }

        const body: (string | number | object)[][] = day.workers.map((w, i) => {
          const row: (string | number)[] = [i + 1, w.name, w.inTime, w.outTime, w.dutyHours > 0 ? w.dutyHours.toFixed(2) : "—"];
          if (showWages) row.push(fmtRu(w.wagesPerDay), fmtRu(w.totalAmount));
          return row;
        });

        // Total row per day
        if (showWages) {
          body.push([
            { content: "Total Manpower:", styles: { fontStyle: "bold" } },
            { content: String(day.totalManpower), styles: { fontStyle: "bold" } },
            "", "",
            { content: day.workers.reduce((s, r) => s + r.dutyHours, 0).toFixed(2), styles: { halign: "right" } },
            { content: "Total Amount", styles: { fontStyle: "bold", halign: "right" } },
            { content: fmtRu(day.totalAmount), styles: { fontStyle: "bold" } },
          ]);
        } else {
          body.push([
            { content: "Total Manpower:", styles: { fontStyle: "bold" } },
            { content: String(day.totalManpower), styles: { fontStyle: "bold" } },
            "", "",
            { content: day.workers.reduce((s, r) => s + r.dutyHours, 0).toFixed(2), styles: { halign: "right", fontStyle: "bold" } },
          ]);
        }

        autoTable(doc, {
          startY: y,
          head: [cols],
          body,
          styles: { fontSize: 7.5, cellPadding: 3 },
          headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.5, lineColor: [0, 0, 0] },
          bodyStyles: { lineWidth: 0.3, lineColor: [180, 180, 180] },
          columnStyles: { 0: { cellWidth: 30 }, 4: { halign: "right" }, ...(showWages ? { 5: { halign: "right" }, 6: { halign: "right" } } : {}) },
          margin: { left: mx, right: mx },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
      }

      // ── Grand Total ───────────────────────────────────────────────────
      if (showWages && grandTotals?.totalAmount !== null) {
        const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y;
        autoTable(doc, {
          startY: lastY + 10,
          head: [],
          body: [[
            { content: "TOTAL AMOUNT (Nepali Rupees)", styles: { fontStyle: "bold", halign: "right" } },
            { content: fmtRu(grandTotals?.totalAmount ?? null), styles: { fontStyle: "bold", halign: "right" } },
          ]],
          columnStyles: { 0: { cellWidth: pw - mx * 2 - 100 }, 1: { cellWidth: 100 } },
          styles: { fontSize: 9, cellPadding: 4 },
          bodyStyles: { lineWidth: 0.5, lineColor: [0, 0, 0], fillColor: [240, 240, 240] },
          margin: { left: mx, right: mx },
        });
      }

      doc.save(`site-attendance-${siteId}-${data.value}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setDownloading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Month / Day toggle */}
        <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-sm dark:border-white/10">
          {(["month", "day"] as ViewMode[]).map((vm, i) => (
            <button
              key={vm}
              type="button"
              onClick={() => setViewMode(vm)}
              className={cn(
                "px-4 py-1.5 font-medium capitalize transition-colors",
                i > 0 && "border-l border-zinc-200 dark:border-white/10",
                viewMode === vm
                  ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                  : "bg-white text-zinc-500 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              {vm === "month" ? "Monthly" : "Single Day"}
            </button>
          ))}
        </div>

        {/* Date picker */}
        {viewMode === "month" ? (
          <WorkingHoursMonthPickerCard
            value={month}
            onChange={setMonth}
            zone={zone}
            disabled={loading}
          />
        ) : (
          <div className="w-full max-w-xs">
            <DateField
              label="Work Date"
              value={singleDay}
              onChange={(iso) => setSingleDay(iso)}
              timeZone={zone}
              disabled={loading}
              id="site-attendance-single-day"
            />
          </div>
        )}

        {/* Show/hide wages */}
        <button
          type="button"
          onClick={() => setShowWages((p) => !p)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            showWages
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-400"
              : "border-zinc-200 bg-white text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400"
          )}
        >
          {showWages ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {showWages ? "Wages shown" : "Show wages"}
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>

        {/* PDF */}
        {!loading && data && data.days.length > 0 && (
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/30 dark:bg-cyan-950/30 dark:text-cyan-400"
          >
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            Export PDF
          </button>
        )}
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && data && data.days.length === 0 && (
        <div className="rounded-xl border border-zinc-200 py-12 text-center dark:border-white/10">
          <p className="text-sm text-zinc-500">
            No attendance records found for this site in the selected period.
          </p>
        </div>
      )}

      {/* Report table — reference-format */}
      {!loading && data && data.days.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10">
          {/* ── Company header ── */}
          <div className="border-b border-zinc-300 bg-zinc-100/80 px-6 py-4 text-center dark:border-white/15 dark:bg-white/[0.04]">
            <p className="text-sm font-extrabold uppercase tracking-wide text-zinc-900 dark:text-white">
              Mass Technology and Engineering Solution Pvt. Ltd
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Kageshwori Manohara-09, Kathmandu</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              info@masstech.com.np, masstechno2020@gmail.com
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">9851358290, 9842995084</p>
          </div>

          {/* ── Project info ── */}
          <div className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-white/10 dark:bg-zinc-900">
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="w-36 pr-4 font-bold text-zinc-600 dark:text-zinc-400">PROJECT NAME:</td>
                  <td className="font-medium text-zinc-900 dark:text-white">{siteName}</td>
                </tr>
                {data.siteLocation && (
                  <tr>
                    <td className="pr-4 font-bold text-zinc-600 dark:text-zinc-400">SITE LOCATION:</td>
                    <td className="font-medium text-zinc-900 dark:text-white">{data.siteLocation}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Month name + title ── */}
          <div className="border-b border-zinc-200 bg-white py-3 text-center dark:border-white/10 dark:bg-zinc-900">
            <div className="mx-auto inline-block border border-emerald-600 px-12 py-1">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{titleMonth}</p>
            </div>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
              Per Day Wages Report
            </p>
          </div>

          {/* ── Day-by-day groups ── */}
          {data.days.map((day) => (
            <DayTable
              key={day.date}
              day={day}
              mode={mode}
              showWages={showWages}
            />
          ))}

          {/* ── Total Amount footer ── only show once, at the bottom ── */}
          {grandTotals && showWages && grandTotals.totalAmount !== null && (
            <div className="border-t-2 border-zinc-300 bg-white dark:border-white/15 dark:bg-zinc-900">
              <div className="flex items-center justify-end gap-3 px-6 py-4">
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    Total Amount (Nepali Rupees){grandTotals.isPartial && (
                      <span className="ml-1 normal-case font-normal text-amber-500"> — some wages missing</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {fmtRu(grandTotals.totalAmount)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Day Group Table ──────────────────────────────────────────────────────────

function DayTable({
  day,
  mode,
  showWages,
}: {
  day: WagesDayGroup;
  mode: "ad" | "bs";
  showWages: boolean;
}) {
  const totalDutyHours = day.workers.reduce((s, r) => s + r.dutyHours, 0);
  const isEmpty = day.workers.length === 0;

  return (
    <div className="border-b border-zinc-200 last:border-0 dark:border-white/10">
      {/* Date banner — mode-aware (BS or AD) */}
      <div className={cn(
        "px-4 py-1.5 text-xs font-bold",
        isEmpty
          ? "bg-zinc-100/60 text-zinc-400 dark:bg-white/[0.02] dark:text-zinc-600"
          : "bg-zinc-200/80 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300"
      )}>
        Date: {displayDate(day.date, mode)}
      </div>

      {/* Empty day — no attendance */}
      {isEmpty ? (
        <div className="flex items-center px-4 py-2 text-xs italic text-zinc-400 dark:text-zinc-600">
          No attendance recorded
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          {/* Header row */}
          <thead>
            <tr className="bg-white dark:bg-zinc-900">
              <th className="border border-zinc-300 px-3 py-2 text-left font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-300">
                S.N
              </th>
              <th className="border border-zinc-300 px-3 py-2 text-left font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-300">
                Employee Name
              </th>
              <th className="border border-zinc-300 px-3 py-2 text-left font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-300">
                In Time
              </th>
              <th className="border border-zinc-300 px-3 py-2 text-left font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-300">
                Out Time
              </th>
              <th className="border border-zinc-300 px-3 py-2 text-right font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-300">
                Total Hours
              </th>
              {showWages && (
                <>
                  <th className="border border-zinc-300 px-3 py-2 text-right font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-300">
                    Wages per day
                  </th>
                  <th className="border border-zinc-300 px-3 py-2 text-right font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-300">
                    Total Amount
                  </th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {/* Worker rows */}
            {day.workers.map((w, i) => (
              <tr
                key={w.workerId}
                className="bg-white even:bg-zinc-50/60 dark:bg-zinc-900 dark:even:bg-white/[0.02]"
              >
                <td className="border border-zinc-200 px-3 py-1.5 tabular-nums text-zinc-500 dark:border-white/10">
                  {i + 1}
                </td>
                <td className="border border-zinc-200 px-3 py-1.5 font-medium dark:border-white/10">
                  {w.name}
                </td>
                <td className="border border-zinc-200 px-3 py-1.5 tabular-nums dark:border-white/10">
                  {w.inTime}
                </td>
                <td className="border border-zinc-200 px-3 py-1.5 tabular-nums dark:border-white/10">
                  {w.outTime}
                </td>
                <td className="border border-zinc-200 px-3 py-1.5 text-right tabular-nums font-medium dark:border-white/10">
                  {w.dutyHours > 0 ? w.dutyHours.toFixed(2) : "—"}
                </td>
                {showWages && (
                  <>
                    <td className="border border-zinc-200 px-3 py-1.5 text-right tabular-nums dark:border-white/10">
                      {fmtRu(w.wagesPerDay)}
                    </td>
                    <td className="border border-zinc-200 px-3 py-1.5 text-right tabular-nums font-semibold text-emerald-700 dark:border-white/10 dark:text-emerald-400">
                      {fmtRu(w.totalAmount)}
                    </td>
                  </>
                )}
              </tr>
            ))}

            {/* Empty separator row */}
            <tr>
              <td
                colSpan={showWages ? 7 : 5}
                className="border border-zinc-200 py-0.5 dark:border-white/10"
              />
            </tr>

            {/* Total manpower row */}
            <tr className="bg-zinc-100/80 font-semibold dark:bg-white/[0.04]">
              <td
                colSpan={2}
                className="border border-zinc-200 px-3 py-1.5 text-xs dark:border-white/10"
              >
                Total Manpower:{" "}
                <span className="font-bold text-zinc-900 dark:text-white">
                  {day.totalManpower}
                </span>
              </td>
              <td
                colSpan={showWages ? 2 : 2}
                className="border border-zinc-200 dark:border-white/10"
              />
              <td className="border border-zinc-200 px-3 py-1.5 text-right tabular-nums font-bold dark:border-white/10">
                {totalDutyHours.toFixed(2)}
              </td>
              {showWages && (
                <>
                  <td className="border border-zinc-200 px-3 py-1.5 text-right text-xs dark:border-white/10">
                    Total Amount
                  </td>
                  <td className="border border-zinc-200 px-3 py-1.5 text-right tabular-nums font-bold text-emerald-700 dark:border-white/10 dark:text-emerald-300">
                    {fmtRu(day.totalAmount)}
                  </td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
