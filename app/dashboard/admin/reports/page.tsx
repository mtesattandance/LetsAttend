"use client";

import * as React from "react";
import JSZip from "jszip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { monthLabelForModeYm, formatIsoForCalendar, bsIsoToAdIso, adIsoToBsIso, currentMonthYyyyMmForMode, convertMonthMode } from "@/lib/date/bs-calendar";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { toast } from "sonner";
import { FileArchive, Loader2, Sparkles, User, Users, CalendarDays, CalendarRange, ChevronRight, Activity, ArrowDownToLine, Zap, MapPin, Building2, Table2 } from "lucide-react";
import { DateField } from "@/components/ui/date-field";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
};

type SiteRow = {
  id: string;
  name: string;
};

type SiteAttendanceRow = {
  date: string;
  workerCount: number;
  workers: { id: string; name: string }[];
};

type SiteAttendanceResponse = {
  siteId: string;
  siteName: string;
  period: "day" | "month" | "year";
  value: string;
  rows: SiteAttendanceRow[];
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

function kindLabel(kind: HoursPayload["entries"][number]["kind"]): string {
  if (kind === "on_site") return "On-site";
  if (kind === "off_site") return "Off-site";
  return "Overtime";
}

export default function AdminReportsPage() {
  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<"employee" | "site">("employee");

  // ── Employee reports state ───────────────────────────────────────────────
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  // Advanced features selection
  const [targetType, setTargetType] = React.useState<"all" | "individual">("all");
  const [selectedWorkerId, setSelectedWorkerId] = React.useState("");

  const [periodMode, setPeriodMode] = React.useState<"year" | "month" | "range">("month");
  
  // Initialize calendar correct default year
  const [periodYear, setPeriodYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE);
    return Number(current.split("-")[0]) || DateTime.now().year;
  });
  
  const [periodSingleMonth, setPeriodSingleMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [periodStartMonth, setPeriodStartMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [periodEndMonth, setPeriodEndMonth] = React.useState(() => currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE));
  
  const [downloading, setDownloading] = React.useState(false);
  const [downloadStatus, setDownloadStatus] = React.useState("Ready to generate");
  const [downloadCurrentDetail, setDownloadCurrentDetail] = React.useState("");
  const [downloadDoneCount, setDownloadDoneCount] = React.useState(0);
  const [downloadTotalCount, setDownloadTotalCount] = React.useState(0);

  // ── Employee preview state ──────────────────────────────────────────────
  const [previewData, setPreviewData] = React.useState<HoursPayload | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewWageRate, setPreviewWageRate] = React.useState<number | null>(null);
  const [previewOvertimeRate, setPreviewOvertimeRate] = React.useState<number | null>(null);

  // ── Site reports state ───────────────────────────────────────────────────
  const [sites, setSites] = React.useState<SiteRow[]>([]);
  const [sitesLoading, setSitesLoading] = React.useState(false);
  const [selectedSiteId, setSelectedSiteId] = React.useState("");
  const [sitePeriodMode, setSitePeriodMode] = React.useState<"day" | "month" | "year">("month");
  const [sitePeriodValue, setSitePeriodValue] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [sitePeriodYear, setSitePeriodYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE);
    return Number(current.split("-")[0]) || DateTime.now().year;
  });
  const [sitePeriodDay, setSitePeriodDay] = React.useState(() =>
    DateTime.now().setZone(DEFAULT_ATTENDANCE_TIME_ZONE).toISODate() ?? ""
  );
  const [siteData, setSiteData] = React.useState<SiteAttendanceResponse | null>(null);
  const [siteLoading, setSiteLoading] = React.useState(false);
  const [siteDownloading, setSiteDownloading] = React.useState(false);
  
  const cancelDownloadRef = React.useRef(false);
  const activeFetchControllerRef = React.useRef<AbortController | null>(null);
  const { mode } = useCalendarMode();

  const monthOptions = React.useMemo(() => {
    const now = DateTime.now();
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
        out.push({
          value,
          label: monthLabelForModeYm(y, m, mode),
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
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error loading users");
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync default periodYear when mode changes
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const prevModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (!mounted) {
       setPeriodSingleMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
       setPeriodStartMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
       setPeriodEndMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
       
       const currentParts = currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE).split("-");
       if (currentParts[0]) setPeriodYear(Number(currentParts[0]));
       
       prevModeRef.current = mode;
       return;
    }
    if (prevModeRef.current !== mode) {
      setPeriodSingleMonth(prev => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodStartMonth(prev => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodEndMonth(prev => convertMonthMode(prev, prevModeRef.current, mode));
      
      setPeriodYear(prev => {
         const conv = convertMonthMode(`${String(prev).padStart(4,"0")}-01`, prevModeRef.current, mode);
         return Number(conv.split("-")[0]) || DateTime.now().year;
      });
      prevModeRef.current = mode;
    }
  }, [mode, mounted]);

  const fetchWageRates = React.useCallback(async (workerId: string, token: string): Promise<{ wageRate: number | null; overtimeRate: number | null }> => {
    try {
      const res = await fetch(`/api/admin/wage-rate?workerId=${workerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { wageRate: null, overtimeRate: null };
      const data = (await res.json()) as { wageRate: number | null; overtimeRate: number | null };
      return {
        wageRate: typeof data.wageRate === "number" ? data.wageRate : null,
        overtimeRate: typeof data.overtimeRate === "number" ? data.overtimeRate : null,
      };
    } catch {
      return { wageRate: null, overtimeRate: null };
    }
  }, []);

  const buildMonthsFromPeriod = React.useCallback(() => {
    if (periodMode === "month") {
      return [periodSingleMonth];
    }
    if (periodMode === "year") {
      return Array.from({ length: 12 }, (_, i) =>
        `${String(periodYear).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`
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
  }, [periodEndMonth, periodMode, periodStartMonth, periodYear, periodSingleMonth, mode]);

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
    async (rows: HoursPayload[], titlePeriod: string, pdfWageRate?: number | null, pdfOvertimeRate?: number | null): Promise<Uint8Array> => {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const logo = await fetchLogoDataUrl();
      const workerMeta = rows[0]?.worker;
      const marginX = 40;

      const drawHeader = (monthLabel: string) => {
        const pageWidth = doc.internal.pageSize.getWidth();
        const centerX = pageWidth / 2;
        const y = 14;
        if (logo) doc.addImage(logo, "PNG", marginX, y, 36, 36);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("MASS TECHNOLOGY AND ENGINEERING SOLUTION PVT. LTD", centerX, y + 12, { align: "center" });
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("KAGESHWORI MANOHARA-09, KATHMANDU", centerX, y + 22, { align: "center" });
        doc.text("info@masstech.com.np  |  masstechno2020@gmail.com", centerX, y + 31, { align: "center" });
        doc.text("9851358290  |  9842995084", centerX, y + 40, { align: "center" });
        doc.setDrawColor(200, 200, 200);
        doc.line(marginX, y + 46, pageWidth - marginX, y + 46);
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

      for (let i = 0; i < rows.length; i++) {
        const p = rows[i]!;
        if (i > 0) doc.addPage("a4");
        const pMonthParts = p.month.split("-").map(Number);
        const monthLabel =
          pMonthParts.length === 2 && Number.isFinite(pMonthParts[0]) && Number.isFinite(pMonthParts[1])
            ? monthLabelForModeYm(pMonthParts[0]!, pMonthParts[1]!, mode)
            : p.month;
        const startY = drawHeader(monthLabel);
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
          body: p.entries.map((r) => [
            mode === "bs" ? formatIsoForCalendar(r.day, "bs", p.zone) : r.day,
            DateTime.fromISO(r.day, { zone: p.zone }).toFormat("ccc"),
            kindLabel(r.kind),
            r.inTime,
            r.outTime,
            r.dutyHours.toFixed(2),
            r.workPlace,
            r.remark === "No work entry" ? "No entry" : (r.remark || "-"),
          ]),
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
          styles: { fontSize: 8, cellPadding: 5.5 },
          headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontSize: 8, cellPadding: 5.5 },
          footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontSize: 8, cellPadding: 5.5 },
        });
      }
      const ab = doc.output("arraybuffer");
      return new Uint8Array(ab);
    },
    [fetchLogoDataUrl, mode]
  );

  const fetchPreview = React.useCallback(async () => {
    if (!selectedWorkerId) {
      toast.error("Select a specific employee to preview");
      return;
    }
    setPreviewLoading(true);
    setPreviewData(null);
    setPreviewWageRate(null);
    setPreviewOvertimeRate(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const q = new URLSearchParams({ month: periodSingleMonth, workerId: selectedWorkerId });
      const [res, rates] = await Promise.all([
        fetch(`/api/attendance/working-hours?${q.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchWageRates(selectedWorkerId, token),
      ]);
      const json = (await res.json()) as HoursPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load preview");
      setPreviewData(json);
      setPreviewWageRate(rates.wageRate);
      setPreviewOvertimeRate(rates.overtimeRate);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedWorkerId, periodSingleMonth, fetchWageRates]);

  const startDownload = React.useCallback(async () => {
    if (targetType === "individual" && !selectedWorkerId) {
      toast.error("Please select a worker first");
      return;
    }
    
    cancelDownloadRef.current = false;
    setDownloading(true);
    setDownloadStatus("Starting download...");
    setDownloadCurrentDetail("");
    setDownloadDoneCount(0);
    
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months = buildMonthsFromPeriod();
      
      let periodTitle = "";
      let suffix = "";
      if (periodMode === "year") {
        periodTitle = `${periodYear} ${mode.toUpperCase()}`;
        suffix = `${periodYear}${mode}`;
      } else if (periodMode === "month") {
        const pMonthParts = periodSingleMonth.split("-").map(Number);
        periodTitle =
          pMonthParts.length === 2 && Number.isFinite(pMonthParts[0]) && Number.isFinite(pMonthParts[1])
            ? monthLabelForModeYm(pMonthParts[0]!, pMonthParts[1]!, mode)
            : periodSingleMonth;
        suffix = periodSingleMonth;
      } else {
        periodTitle = `${periodStartMonth} to ${periodEndMonth}`;
        suffix = `${periodStartMonth}-${periodEndMonth}`;
      }

      // Target array
      const targets = targetType === "all" ? users : users.filter(u => u.id === selectedWorkerId);
      
      if (targets.length === 0) throw new Error("No target employees found");
      setDownloadTotalCount(targets.length);

      if (targetType === "individual") {
        setDownloadStatus(`Gathering ${months.length} month(s) of data...`);
        const emp = targets[0]!;
        setDownloadCurrentDetail(emp.name || "Employee");
        
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
        
        setDownloadStatus("Generating PDF...");
        const empRates = await fetchWageRates(emp.id, token);
        const pdf = await buildPdfBytes(monthRows, periodTitle, empRates.wageRate, empRates.overtimeRate);
        setDownloadStatus("Downloading...");
        const blob = new Blob([pdf as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const fileNameSafeName = (emp.name || "Employee").replace(/[^\w.-]+/g, "_");
        a.download = `Report_${fileNameSafeName}_${suffix}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(`PDF downloaded for ${emp.name}`);
        setDownloadDoneCount(1);
      } else {
        const zip = new JSZip();
        for (let idx = 0; idx < targets.length; idx++) {
          if (cancelDownloadRef.current) throw new Error("Download cancelled");
          const emp = targets[idx]!;
          setDownloadCurrentDetail(emp.employeeId?.trim() ? `${emp.employeeId} (${emp.name || "Employee"})` : (emp.name || "Employee"));
          setDownloadStatus(`Processing employee ${idx + 1} of ${targets.length}...`);
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
          const empRates = await fetchWageRates(emp.id, token);
          const pdf = await buildPdfBytes(monthRows, periodTitle, empRates.wageRate, empRates.overtimeRate);
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
        setDownloadStatus("Downloading ZIP...");
        const blob = new Blob([out], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Organization-Reports-${suffix}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Organization ZIP downloaded!");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      if (/cancelled/i.test(msg)) toast.message("Download cancelled.");
      else toast.error(msg);
    } finally {
      setDownloading(false);
      setDownloadStatus("Ready to generate");
      setDownloadCurrentDetail("");
      cancelDownloadRef.current = false;
      activeFetchControllerRef.current = null;
    }
  }, [
    targetType,
    selectedWorkerId,
    users,
    buildMonthsFromPeriod,
    periodMode,
    periodYear,
    periodStartMonth,
    periodEndMonth,
    buildPdfBytes,
    fetchWageRates,
  ]);

  const cancelDownload = React.useCallback(() => {
    cancelDownloadRef.current = true;
    setDownloadStatus("Cancelling download...");
    activeFetchControllerRef.current?.abort();
  }, []);

  // ── Sites: load list ─────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setSitesLoading(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const res = await fetch("/api/sites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load sites");
        const data = (await res.json()) as { sites?: { id: string; name: string }[] };
        if (!cancelled)
          setSites(
            (data.sites ?? []).sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            )
          );
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setSitesLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  // ── Sites: fetch headcount ───────────────────────────────────────────────
  const fetchSiteData = React.useCallback(async () => {
    if (!selectedSiteId) { toast.error("Please select a site first"); return; }
    setSiteLoading(true);
    setSiteData(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      let value = sitePeriodValue;
      if (sitePeriodMode === "year") value = String(sitePeriodYear);
      if (sitePeriodMode === "day") value = sitePeriodDay;
      const q = new URLSearchParams({ siteId: selectedSiteId, period: sitePeriodMode, value });
      const res = await fetch(`/api/admin/site-attendance?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as SiteAttendanceResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load site data");
      setSiteData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load site data");
    } finally {
      setSiteLoading(false);
    }
  }, [selectedSiteId, sitePeriodMode, sitePeriodValue, sitePeriodYear, sitePeriodDay]);

  // ── Sites: download PDF ──────────────────────────────────────────────────
  const downloadSitePdf = React.useCallback(async () => {
    if (!siteData) { toast.error("Load site data first"); return; }
    setSiteDownloading(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const logo = await fetchLogoDataUrl();
      const marginX = 40;

      // Header
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
      doc.text("Site Attendance Report", marginX, y + 82);
      doc.setFont("helvetica", "normal");
      doc.text(`Site: ${siteData.siteName}`, marginX, y + 100);
      let periodLabel = siteData.value;
      if (siteData.period === "month") {
        const [py, pm] = siteData.value.split("-").map(Number);
        if (py && pm) periodLabel = monthLabelForModeYm(py, pm, mode);
      } else if (siteData.period === "year") {
        periodLabel = `${siteData.value} ${mode.toUpperCase()}`;
      } else {
        periodLabel = mode === "bs" ? formatIsoForCalendar(siteData.value, "bs") : siteData.value;
      }
      doc.text(`Period: ${periodLabel}`, marginX + 250, y + 100);
      const startY = y + 120;

      autoTable(doc, {
        startY,
        head: [["Date", "Workers Present", "Worker Names"]],
        body: siteData.rows.map((r) => [
          mode === "bs" ? formatIsoForCalendar(r.date, "bs") : r.date,
          String(r.workerCount),
          r.workers.map((w) => w.name).join(", ") || "-",
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
        columnStyles: { 2: { cellWidth: 260 } },
      });

      const ab = doc.output("arraybuffer");
      const blob = new Blob([new Uint8Array(ab)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = siteData.siteName.replace(/[^\w.-]+/g, "_");
      a.download = `Site-Report_${safeName}_${siteData.value}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Site report PDF downloaded!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setSiteDownloading(false);
    }
  }, [siteData, fetchLogoDataUrl, mode]);

  return (
    <div className="relative min-h-full bg-zinc-50 p-4 sm:p-6 md:p-10 dark:bg-zinc-950 overflow-hidden">
      {/* Background SVG Grid Pattern */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-20 dark:opacity-[0.15]">
        <svg
          className="h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="reports-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-zinc-300 dark:text-zinc-600"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#reports-grid)" />
        </svg>
      </div>
      
      <div className="relative mx-auto max-w-5xl space-y-8 z-10">
        
        {/* Header Segment */}
        <div className="relative overflow-hidden rounded-3xl border border-zinc-200/50 bg-white/60 p-6 shadow-sm backdrop-blur-3xl dark:border-white/10 dark:bg-zinc-900/60">
          <div className="absolute -left-20 -top-20 z-0 size-64 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-600/20" />
          <div className="absolute -right-20 -bottom-20 z-0 size-64 rounded-full bg-purple-400/20 blur-3xl dark:bg-purple-600/20" />
          
          <div className="relative z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 backdrop-blur-md">
                <Sparkles className="size-3.5" />
                Insights & Analytics
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Reports Dashboard
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-xl">
                Easily generate, download, and analyze team attendance records across any timespan. Select your options below to get started.
              </p>
            </div>
            
            <div className="mt-4 sm:mt-0 flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-4 text-white shadow-xl shadow-cyan-500/20">
              <Zap className="size-8" />
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex w-full items-center rounded-2xl bg-zinc-100/80 p-1 backdrop-blur-sm dark:bg-zinc-800/80 shadow-inner">
          <button
            onClick={() => setActiveTab("employee")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              activeTab === "employee"
                ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <Users className="size-4" /> Employee Reports
          </button>
          <button
            onClick={() => setActiveTab("site")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              activeTab === "site"
                ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <Building2 className="size-4" /> Site Reports
          </button>
        </div>

        {/* ══════════════════════════════════════════════ EMPLOYEE TAB ══ */}
        {activeTab === "employee" && (<>
        {/* Control Interface Grid */}
        <div className="grid gap-6 md:grid-cols-12">
          
          {/* Target Selection Panel */}
          <Card className="md:col-span-12 lg:col-span-5 relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
            <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <Activity className="size-4" /> Select Target
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetType("all")}
                  className={`group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 outline-none transition-all ${
                    targetType === "all"
                      ? "border-cyan-500 bg-cyan-50/50 text-cyan-900 shadow-lg shadow-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100"
                      : "border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  <Users className={`size-6 transition-transform ${targetType === "all" ? "scale-110 text-cyan-600 dark:text-cyan-400" : ""}`} />
                  <span className="text-sm font-semibold">All Employees</span>
                  {targetType === "all" && (
                    <div className="absolute inset-x-0 -bottom-2 mx-auto h-1 w-8 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("individual")}
                  className={`group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 outline-none transition-all ${
                    targetType === "individual"
                      ? "border-purple-500 bg-purple-50/50 text-purple-900 shadow-lg shadow-purple-500/20 dark:bg-purple-500/10 dark:text-purple-100"
                      : "border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  <User className={`size-6 transition-transform ${targetType === "individual" ? "scale-110 text-purple-600 dark:text-purple-400" : ""}`} />
                  <span className="text-sm font-semibold">Specific Employee</span>
                  {targetType === "individual" && (
                    <div className="absolute inset-x-0 -bottom-2 mx-auto h-1 w-8 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                  )}
                </button>
              </div>

              {targetType === "individual" && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Search for Employee
                  </label>
                  <SearchableSelect
                    value={selectedWorkerId}
                    onValueChange={setSelectedWorkerId}
                    includeEmpty={false}
                    options={users.map((u) => ({
                      value: u.id,
                      label: u.employeeId?.trim()
                        ? `${u.employeeId} — ${u.name || "Unknown"}`
                        : `${u.name || "Unknown"}`,
                      keywords: [u.employeeId ?? "", u.id, u.name, u.email],
                    }))}
                    emptyLabel="— Select Employee —"
                    searchPlaceholder="Search employees..."
                    triggerClassName="h-11 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-purple-500/50 hover:bg-zinc-50 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-white/10 dark:bg-zinc-900/50 dark:hover:bg-zinc-800"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeframe Engine */}
          <Card className="md:col-span-12 lg:col-span-7 relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
            <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <CalendarRange className="size-4" /> Select Date Range
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="inline-flex w-full items-center rounded-xl bg-zinc-100/80 p-1 backdrop-blur-sm dark:bg-zinc-800/80 shadow-inner">
                <button
                  onClick={() => setPeriodMode("month")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                    periodMode === "month" 
                      ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white" 
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setPeriodMode("year")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                    periodMode === "year" 
                      ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white" 
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  Yearly
                </button>
                <button
                  onClick={() => setPeriodMode("range")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                    periodMode === "range" 
                      ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white" 
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {periodMode === "month" ? (
                <div className="animate-in fade-in zoom-in-95 duration-300">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Select Month
                  </label>
                  <SearchableSelect
                    value={periodSingleMonth}
                    onValueChange={setPeriodSingleMonth}
                    includeEmpty={false}
                    options={monthOptions}
                    searchPlaceholder="Select month..."
                    triggerClassName="h-12 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                  />
                </div>
              ) : periodMode === "year" ? (
                <div className="animate-in fade-in zoom-in-95 duration-300">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {mode === "ad" ? "Gregorian Year (AD)" : "Nepali Year (BS)"}
                  </label>
                  <div className="relative">
                    <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-zinc-400" />
                    <input
                      type="number"
                      min={mode === "ad" ? 2000 : 2070}
                      max={mode === "ad" ? 2100 : 2150}
                      value={periodYear}
                      onChange={(e) => setPeriodYear(Number(e.target.value))}
                      className="h-12 w-full rounded-xl border border-zinc-200 bg-white/50 backdrop-blur-md pl-12 pr-4 text-base font-semibold shadow-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900/50 dark:text-white"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-300">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                      From Month
                    </label>
                    <SearchableSelect
                      value={periodStartMonth}
                      onValueChange={setPeriodStartMonth}
                      includeEmpty={false}
                      options={monthOptions}
                      searchPlaceholder="Select month..."
                      triggerClassName="h-12 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                      To Month
                    </label>
                    <SearchableSelect
                      value={periodEndMonth}
                      onValueChange={setPeriodEndMonth}
                      includeEmpty={false}
                      options={monthOptions}
                      searchPlaceholder="Select month..."
                      triggerClassName="h-12 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Execution & Processing HUD */}
        <div className="rounded-3xl border border-zinc-200 bg-white/90 shadow-2xl shadow-cyan-500/10 p-2 backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/90 dark:shadow-cyan-500/5">
          {!downloading ? (
            <div className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row sm:px-6">
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <div className={`flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 shadow-[inset_0_0_10px_rgba(6,182,212,0.3)] dark:bg-cyan-500/20 dark:text-cyan-400 ${loading ? 'animate-pulse' : ''}`}>
                  {loading ? <Loader2 className="size-5 animate-spin" /> : <ChevronRight className="size-5" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Ready to Download
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Waiting for your selection.
                  </p>
                </div>
              </div>
              <div className="flex w-full gap-3 sm:w-auto">
                {periodMode === "month" && targetType === "individual" && (
                  <Button
                    size="lg"
                    onClick={() => void fetchPreview()}
                    disabled={previewLoading || !selectedWorkerId}
                    className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 gap-2 h-12 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    {previewLoading ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />}
                    Preview
                  </Button>
                )}
                <Button
                  size="lg"
                  onClick={startDownload}
                  disabled={loading || users.length === 0}
                  className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 border-t border-white/10 font-bold text-white shadow-xl shadow-zinc-500/20 hover:from-zinc-800 hover:to-zinc-700 dark:from-white dark:to-zinc-200 dark:text-zinc-900 dark:shadow-cyan-500/10 dark:hover:from-zinc-200 dark:hover:to-zinc-300 gap-2 h-12 transition-all hover:scale-[1.02] active:scale-95"
                >
                  {targetType === "all" ? (
                    <>
                      <FileArchive className="size-4" /> Download All Reports
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="size-4" /> Download Report
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex size-10 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-t-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)] animate-spin" />
                    <Zap className="size-4 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white animate-pulse">
                      {downloadStatus}
                    </p>
                    {downloadCurrentDetail && (
                      <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        {'>'} Working on <span className="text-cyan-600 dark:text-cyan-400 font-bold">{downloadCurrentDetail}</span>
                      </p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={cancelDownload}
                  className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 h-9 transition-colors"
                >
                  Cancel
                </Button>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-zinc-500">
                  <span>Export Progress: {targetType === 'all' ? 'All' : 'Single'}</span>
                  <span>{downloadDoneCount} / {Math.max(1, downloadTotalCount)} done</span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-100 shadow-inner dark:bg-zinc-800">
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
            </div>
          )}
        </div>

        {/* Employee monthly preview table */}
        {previewData && periodMode === "month" && targetType === "individual" && (
          <Card className="overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <CardHeader className="bg-zinc-50/50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/10 pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <User className="size-4" />
                {previewData.worker.name ?? "Employee"} — {(() => { const p = periodSingleMonth.split("-").map(Number); return monthLabelForModeYm(p[0]!, p[1]!, mode); })()} — Monthly Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/80 dark:border-white/5 dark:bg-white/[0.03]">
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Day</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Kind</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">In</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Out</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Hours</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Workplace</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Schedule</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.entries.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-400 italic">No attendance entries for this month.</td>
                      </tr>
                    ) : (
                      previewData.entries.map((e, i) => (
                        <tr
                          key={e.id}
                          className={`border-b border-zinc-100/60 dark:border-white/5 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.02] ${i % 2 === 0 ? "" : "bg-zinc-50/40 dark:bg-white/[0.015]"}`}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                            {mode === "bs" ? formatIsoForCalendar(e.day, "bs") : e.day}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              e.kind === "on_site"
                                ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300"
                                : e.kind === "overtime"
                                  ? "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                            }`}>
                              {kindLabel(e.kind)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{e.inTime}</td>
                          <td className="px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{e.outTime}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{e.dutyHours.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">{e.workPlace}</td>
                          <td className="px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">{e.schedule}</td>
                          <td className="px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-500">{e.remark}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-100/60 dark:bg-white/5">
                      <td colSpan={4} className="px-4 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300">Total</td>
                      <td className="px-4 py-3 text-xs font-bold text-emerald-700 dark:text-emerald-400">{previewData.totalHours.toFixed(2)} hrs</td>
                      <td colSpan={3} className="px-4 py-3 text-xs text-zinc-500">
                        On-site: {previewData.onSiteSessionHours.toFixed(2)} · Overtime: {previewData.approvedClockOvertimeHours.toFixed(2)} · Off-site: {previewData.approvedOffsiteHours.toFixed(2)}
                      </td>
                    </tr>
                    {(typeof previewWageRate === "number" || typeof previewOvertimeRate === "number") && (() => {
                      const rRate = previewWageRate ?? 0;
                      const oRate = previewOvertimeRate ?? 0;
                      const regWage = previewData.regularHoursUpToCap * rRate;
                      const otWage = previewData.hoursOverCapAsOvertime * oRate;
                      return (
                        <tr className="bg-zinc-50/60 dark:bg-white/3 text-xs">
                          <td className="px-4 py-2.5 tabular-nums" colSpan={3}>
                            <span className="text-zinc-500">Regular Wage:</span>{" "}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                              Rs. {regWage.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums" colSpan={3}>
                            <span className="text-zinc-500">Overtime Wage:</span>{" "}
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              Rs. {otWage.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums font-semibold" colSpan={2}>
                            <span className="text-zinc-500">Total Wage:</span>{" "}
                            <span className="text-cyan-700 dark:text-cyan-300">
                              Rs. {(regWage + otWage).toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Wage summary cards — shown when preview data + at least one rate is set */}
        {previewData && (typeof previewWageRate === "number" || typeof previewOvertimeRate === "number") && (() => {
          const rRate = previewWageRate ?? 0;
          const oRate = previewOvertimeRate ?? 0;
          const regularWage = previewData.regularHoursUpToCap * rRate;
          const overtimeWage = previewData.hoursOverCapAsOvertime * oRate;
          const totalWage = regularWage + overtimeWage;
          return (
            <div className="grid gap-4 sm:grid-cols-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Card className="border-emerald-200/80 dark:border-emerald-500/25">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Regular Wage</CardTitle>
                  <p className="text-sm text-zinc-500">{previewData.regularHoursUpToCap.toFixed(2)} h × Rs. {rRate.toFixed(2)}/hr</p>
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
                  <p className="text-sm text-zinc-500">{previewData.hoursOverCapAsOvertime.toFixed(2)} h × Rs. {oRate.toFixed(2)}/hr</p>
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
                  <p className="text-sm text-zinc-500">Regular + Overtime</p>
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
        </>) /* end employee tab */}

        {/* ════════════════════════════════════════════════ SITE TAB ══ */}
        {activeTab === "site" && (
          <div className="space-y-6 animate-in fade-in duration-300">

            {/* Site selector + period */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Site picker */}
              <Card className="relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <MapPin className="size-4" /> Select Site
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {sitesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="size-4 animate-spin" /> Loading sites…</div>
                  ) : (
                    <SearchableSelect
                      value={selectedSiteId}
                      onValueChange={setSelectedSiteId}
                      includeEmpty={false}
                      options={sites.map((s) => ({ value: s.id, label: s.name }))}
                      emptyLabel="— Select a site —"
                      searchPlaceholder="Search sites…"
                      triggerClassName="h-11 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                    />
                  )}
                  {sites.length === 0 && !sitesLoading && (
                    <p className="mt-2 text-xs text-zinc-400">No sites found. Create sites in the Sites page.</p>
                  )}
                </CardContent>
              </Card>

              {/* Period picker */}
              <Card className="relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <CalendarRange className="size-4" /> Period
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="inline-flex w-full items-center rounded-xl bg-zinc-100/80 p-1 dark:bg-zinc-800/80 shadow-inner">
                    {(["day", "month", "year"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setSitePeriodMode(p)}
                        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all capitalize ${
                          sitePeriodMode === p
                            ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                            : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                        }`}
                      >
                        {p === "day" ? "Daily" : p === "month" ? "Monthly" : "Yearly"}
                      </button>
                    ))}
                  </div>

                  {sitePeriodMode === "day" && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Select Date</label>
                      <DateField
                        value={sitePeriodDay}
                        onChange={setSitePeriodDay}
                        timeZone={DEFAULT_ATTENDANCE_TIME_ZONE}
                      />
                    </div>
                  )}
                  {sitePeriodMode === "month" && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Select Month</label>
                      <SearchableSelect
                        value={sitePeriodValue}
                        onValueChange={setSitePeriodValue}
                        includeEmpty={false}
                        options={monthOptions}
                        searchPlaceholder="Select month…"
                        triggerClassName="h-11 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm dark:border-white/10 dark:bg-zinc-900/50"
                      />
                    </div>
                  )}
                  {sitePeriodMode === "year" && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        {mode === "ad" ? "Gregorian Year (AD)" : "Nepali Year (BS)"}
                      </label>
                      <div className="relative">
                        <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-zinc-400" />
                        <input
                          type="number"
                          min={mode === "ad" ? 2000 : 2070}
                          max={mode === "ad" ? 2100 : 2150}
                          value={sitePeriodYear}
                          onChange={(e) => setSitePeriodYear(Number(e.target.value))}
                          className="h-11 w-full rounded-xl border border-zinc-200 bg-white/50 pl-12 pr-4 text-base font-semibold shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900/50 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Action row */}
            <div className="rounded-3xl border border-zinc-200 bg-white/90 shadow-xl p-2 backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/90">
              <div className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row sm:px-6">
                <div className="flex items-center gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 ${siteLoading ? "animate-pulse" : ""}`}>
                    {siteLoading ? <Loader2 className="size-5 animate-spin" /> : <Table2 className="size-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {siteData ? `${siteData.rows.length} record${siteData.rows.length !== 1 ? "s" : ""} loaded` : "Load site attendance data"}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {siteData ? `Site: ${siteData.siteName}` : "Select a site and period, then click Preview."}
                    </p>
                  </div>
                </div>
                <div className="flex w-full gap-3 sm:w-auto">
                  <Button
                    onClick={fetchSiteData}
                    disabled={siteLoading || !selectedSiteId}
                    className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 gap-2 h-11 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    <Activity className="size-4" /> Preview
                  </Button>
                  <Button
                    onClick={downloadSitePdf}
                    disabled={siteDownloading || !siteData}
                    className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 text-white font-bold shadow-lg shadow-zinc-500/20 hover:from-zinc-700 hover:to-zinc-600 dark:from-white dark:to-zinc-200 dark:text-zinc-900 gap-2 h-11 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    {siteDownloading ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownToLine className="size-4" />}
                    Download PDF
                  </Button>
                </div>
              </div>
            </div>

            {/* Preview table */}
            {siteData && siteData.rows.length > 0 && (
              <Card className="overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/10 pb-4">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <Building2 className="size-4" /> {siteData.siteName} — Attendance Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50/80 dark:border-white/5 dark:bg-white/[0.03]">
                          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Date</th>
                          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Workers Present</th>
                          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Names</th>
                        </tr>
                      </thead>
                      <tbody>
                        {siteData.rows.map((row, i) => (
                          <tr
                            key={row.date}
                            className={`border-b border-zinc-100/60 dark:border-white/5 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.02] ${
                              i % 2 === 0 ? "" : "bg-zinc-50/40 dark:bg-white/[0.015]"
                            }`}
                          >
                            <td className="px-5 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                              {mode === "bs" ? formatIsoForCalendar(row.date, "bs") : row.date}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                row.workerCount > 0
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}>
                                {row.workerCount}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                              {row.workers.length > 0
                                ? row.workers.map((w) => w.name).join(", ")
                                : <span className="text-zinc-400 italic">No attendance</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-zinc-100/60 dark:bg-white/5">
                          <td className="px-5 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300">Total days with attendance</td>
                          <td className="px-5 py-3 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            {siteData.rows.filter((r) => r.workerCount > 0).length} / {siteData.rows.length}
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-500">
                            Avg {siteData.rows.filter((r) => r.workerCount > 0).length > 0
                              ? (siteData.rows.reduce((s, r) => s + r.workerCount, 0) /
                                  siteData.rows.filter((r) => r.workerCount > 0).length).toFixed(1)
                              : "0"} workers/day
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
            {siteData && siteData.rows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-zinc-400">
                <Building2 className="mx-auto mb-3 size-10 opacity-30" />
                <p className="text-sm font-medium">No attendance records found for this site in the selected period.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
