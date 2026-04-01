"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { dayNumberForMode, monthLabelForMode } from "@/lib/date/bs-calendar";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function parseMonthAnchor(iso: string | undefined, tz: string): DateTime {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    const d = DateTime.fromFormat(iso.trim(), "yyyy-LL-dd", { zone: tz });
    if (d.isValid) return d.startOf("month");
  }
  return DateTime.now().setZone(tz).startOf("month");
}

type Cell = { iso: string; day: number; inMonth: boolean };

function buildMonthGrid(anchor: DateTime, tz: string): Cell[] {
  const monthStart = anchor.startOf("month");
  const pad = monthStart.weekday % 7;
  const cells: Cell[] = [];
  for (let i = pad; i > 0; i--) {
    const d = monthStart.minus({ days: i }).setZone(tz);
    cells.push({
      iso: d.toFormat("yyyy-LL-dd"),
      day: d.day,
      inMonth: false,
    });
  }
  const dim = monthStart.daysInMonth ?? 31;
  for (let day = 1; day <= dim; day++) {
    const d = monthStart.set({ day });
    cells.push({
      iso: d.toFormat("yyyy-LL-dd"),
      day,
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const lastIso = cells[cells.length - 1]!.iso;
    const last = DateTime.fromFormat(lastIso, "yyyy-LL-dd", { zone: tz }).plus({
      days: 1,
    });
    cells.push({
      iso: last.toFormat("yyyy-LL-dd"),
      day: last.day,
      inMonth: false,
    });
  }
  return cells;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function bsYearFromAdYear(adYear: number, adMonthOneBased: number): string {
  const label = monthLabelForMode(adYear, adMonthOneBased, "bs");
  const m = /(\d{4})\s+BS$/.exec(label);
  return m?.[1] ?? String(adYear);
}

export type DatePickerPanelProps = {
  selectedIso: string;
  onSelect: (iso: string) => void;
  /** IANA zone for “Today” and month grid; defaults to app default (e.g. Kathmandu). */
  timeZone?: string;
  className?: string;
};

export function DatePickerPanel({
  selectedIso,
  onSelect,
  timeZone: timeZoneProp,
  className,
}: DatePickerPanelProps) {
  const tz = normalizeTimeZoneId(timeZoneProp);
  const { mode } = useCalendarMode();
  const [viewMonth, setViewMonth] = React.useState(() =>
    parseMonthAnchor(selectedIso, tz)
  );

  React.useEffect(() => {
    setViewMonth(parseMonthAnchor(selectedIso, tz));
  }, [selectedIso, tz]);

  const todayIso = React.useMemo(
    () => calendarDateKeyInTimeZone(new Date(), tz),
    [tz]
  );

  const grid = React.useMemo(() => buildMonthGrid(viewMonth, tz), [viewMonth, tz]);

  const title = monthLabelForMode(viewMonth.year, viewMonth.month, mode);

  const goPrevMonth = () => setViewMonth((m) => m.minus({ months: 1 }).startOf("month"));
  const goNextMonth = () => setViewMonth((m) => m.plus({ months: 1 }).startOf("month"));

  const year = viewMonth.year;
  const setYear = (y: number) => {
    setViewMonth(viewMonth.set({ year: y }).startOf("month"));
  };

  const years = React.useMemo(() => {
    const y0 = Math.min(year - 5, new Date().getFullYear() - 2);
    const y1 = Math.max(year + 8, new Date().getFullYear() + 6);
    const out: number[] = [];
    for (let y = y0; y <= y1; y++) out.push(y);
    return out;
  }, [year]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900 text-zinc-100 shadow-2xl",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-700/80 px-3 py-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm font-semibold tracking-tight",
                "text-zinc-100 outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-cyan-500/50"
              )}
            >
              <span className="truncate">{title}</span>
              <ChevronDown className="size-4 shrink-0 text-cyan-400/90" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[min(70vh,22rem)] w-[min(calc(100vw-2rem),14rem)] overflow-y-auto">
            {MONTH_NAMES.map((name, idx) => {
              const m = idx + 1;
              const isCurrent = viewMonth.month === m;
              const monthText =
                mode === "bs"
                  ? monthLabelForMode(viewMonth.year, m, "bs").replace(/\s+\d{4}\s+BS$/, "")
                  : name;
              return (
                <DropdownMenuItem
                  key={name}
                  className={cn(isCurrent && "bg-cyan-500/15 text-cyan-200")}
                  onSelect={() => {
                    setViewMonth(viewMonth.set({ month: m }).startOf("month"));
                  }}
                >
                  {monthText}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">
              Year
            </div>
            <div className="grid max-h-40 grid-cols-3 gap-1 overflow-y-auto px-1 pb-1">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium outline-none transition-colors",
                    y === year
                      ? "bg-cyan-500/25 text-cyan-100"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  )}
                >
                  {mode === "bs" ? bsYearFromAdYear(y, viewMonth.month) : y}
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={goPrevMonth}
            className="rounded-md p-1 text-zinc-400 outline-none hover:bg-zinc-800 hover:text-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-500/50"
            aria-label="Previous month"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={goNextMonth}
            className="rounded-md p-1 text-zinc-400 outline-none hover:bg-zinc-800 hover:text-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-500/50"
            aria-label="Next month"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 px-2 pt-3 text-center text-[0.65rem] font-medium uppercase tracking-wide text-zinc-500">
        {WEEKDAYS.map((d, i) => (
          <div key={`${d}-${i}`} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-2 pb-3">
        {grid.map((cell) => {
          const isSelected = selectedIso.trim() === cell.iso;
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={`${cell.iso}-${cell.day}-${cell.inMonth}`}
              type="button"
              onClick={() => onSelect(cell.iso)}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                !cell.inMonth && "text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300",
                cell.inMonth && "text-zinc-100 hover:bg-zinc-800",
                isSelected &&
                  "bg-cyan-500 text-zinc-950 shadow-sm hover:bg-cyan-400 hover:text-zinc-950",
                !isSelected &&
                  isToday &&
                  "ring-1 ring-cyan-500/50 ring-inset"
              )}
            >
              {mode === "bs" ? dayNumberForMode(cell.iso, mode) : cell.day}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-700/80 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onSelect("")}
          className="text-sm font-medium text-cyan-400/95 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 rounded-md px-1"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onSelect(todayIso)}
          className="text-sm font-medium text-cyan-400/95 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 rounded-md px-1"
        >
          Today
        </button>
      </div>
    </div>
  );
}
