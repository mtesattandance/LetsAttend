import { DateTime } from "luxon";
import { ADToBS, BSToAD } from "bikram-sambat-js";
import { formatInstantDateTime12hInZone, formatInstantTime12hInZone } from "@/lib/time/format-wall-time";


export type CalendarMode = "ad" | "bs";

export const BS_MONTHS = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

export function adIsoToBsIso(adIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adIso.trim())) return adIso;
  try {
    return ADToBS(adIso.trim());
  } catch {
    return adIso;
  }
}

export function bsIsoToAdIso(bsIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bsIso.trim())) return bsIso;
  try {
    return BSToAD(bsIso.trim());
  } catch {
    return bsIso;
  }
}

export function formatIsoForCalendar(
  adIso: string,
  mode: CalendarMode,
  zone = "Asia/Kathmandu"
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adIso.trim())) return "Select date";
  if (mode === "bs") {
    const bs = adIsoToBsIso(adIso);
    const [y, m, d] = bs.split("-").map(Number);
    const month = BS_MONTHS[(m ?? 1) - 1] ?? "Unknown";
    return `${month} ${d}, ${y} BS`;
  }
  const dt = DateTime.fromISO(adIso, { zone });
  return dt.isValid ? dt.toFormat("ccc, LLL d, yyyy") : adIso;
}

export function monthLabelForModeYm(
  year: number,
  month: number,
  mode: CalendarMode
): string {
  if (mode === "ad") {
    return DateTime.fromObject({ year, month, day: 1 }).toFormat("LLLL yyyy");
  }
  return `${BS_MONTHS[(month ?? 1) - 1] ?? "Unknown"} ${year} BS`;
}

export function currentMonthYyyyMmForMode(mode: CalendarMode, zone: string): string {
  const dt = DateTime.now().setZone(zone);
  if (mode === "ad") return dt.toFormat("yyyy-MM");
  const bsParts = adIsoToBsIso(dt.toISODate() || "2000-01-01").split("-").map(Number);
  return `${String(bsParts[0]).padStart(4, "0")}-${String(bsParts[1]).padStart(2, "0")}`;
}

export function convertMonthMode(
  monthYyyyMm: string,
  fromMode: CalendarMode,
  toMode: CalendarMode
): string {
  if (fromMode === toMode) return monthYyyyMm;
  if (!/^\d{4}-\d{2}$/.test(monthYyyyMm.trim())) return monthYyyyMm;
  const [y, m] = monthYyyyMm.trim().split("-");
  if (fromMode === "ad" && toMode === "bs") {
    const bsIso = adIsoToBsIso(`${y}-${m}-15`);
    return bsIso.substring(0, 7);
  }
  if (fromMode === "bs" && toMode === "ad") {
    const adIso = bsIsoToAdIso(`${y}-${m}-15`);
    return adIso.substring(0, 7);
  }
  return monthYyyyMm;
}

export function dayNumberForMode(adIso: string, mode: CalendarMode): string {
  if (mode === "ad") {
    return DateTime.fromISO(adIso).toFormat("d");
  }
  const bs = adIsoToBsIso(adIso);
  const d = bs.split("-")[2];
  return d ? String(Number(d)) : "";
}

/**
 * Returns the number of days in a given BS month.
 * Computed by diffing the AD start of this BS month and the next.
 */
export function bsMonthDays(bsYear: number, bsMonth: number): number {
  const isLast = bsMonth === 12;
  const nextYear = isLast ? bsYear + 1 : bsYear;
  const nextMonth = isLast ? 1 : bsMonth + 1;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const thisFirstAd = bsIsoToAdIso(`${bsYear}-${pad2(bsMonth)}-01`);
  const nextFirstAd = bsIsoToAdIso(`${nextYear}-${pad2(nextMonth)}-01`);
  const s = DateTime.fromISO(thisFirstAd);
  const e = DateTime.fromISO(nextFirstAd);
  if (!s.isValid || !e.isValid) return 30; // fallback
  return Math.round(e.diff(s, "days").days);
}

/** Formats a timestamp as `MMM D, YYYY, H:mm:ss A` or `Month D, YYYY BS, H:mm:ss A` based on mode. */
export function formatTimestampForMode(
  ms: number,
  mode: CalendarMode,
  zone: string
): string {
  if (mode === "ad") {
    return formatInstantDateTime12hInZone(ms, zone, { withSeconds: true, withTimeZoneName: true });
  }
  const adIso = DateTime.fromMillis(ms).setZone(zone).toISODate();
  const dateStr = adIso ? formatIsoForCalendar(adIso, mode, zone) : "";
  const timeStr = formatInstantTime12hInZone(ms, zone, { withSeconds: true, withTimeZoneName: true });
  return `${dateStr}, ${timeStr}`;
}
