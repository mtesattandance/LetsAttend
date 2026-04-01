import { DateTime } from "luxon";
import { ADToBS, BSToAD } from "bikram-sambat-js";

export type CalendarMode = "ad" | "bs";

const BS_MONTHS = [
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

export function monthLabelForMode(
  adYear: number,
  adMonthOneBased: number,
  mode: CalendarMode
): string {
  if (mode === "ad") {
    return DateTime.fromObject({ year: adYear, month: adMonthOneBased, day: 1 }).toFormat("LLLL yyyy");
  }
  const adIso = `${String(adYear).padStart(4, "0")}-${String(adMonthOneBased).padStart(2, "0")}-01`;
  const bs = adIsoToBsIso(adIso);
  const [y, m] = bs.split("-").map(Number);
  return `${BS_MONTHS[(m ?? 1) - 1] ?? "Unknown"} ${y} BS`;
}

export function dayNumberForMode(adIso: string, mode: CalendarMode): string {
  if (mode === "ad") {
    return DateTime.fromISO(adIso).toFormat("d");
  }
  const bs = adIsoToBsIso(adIso);
  const d = bs.split("-")[2];
  return d ? String(Number(d)) : "";
}
