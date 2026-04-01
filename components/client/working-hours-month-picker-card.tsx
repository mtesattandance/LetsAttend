"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { monthLabelForMode } from "@/lib/date/bs-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTH_IX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function bsYearFromAdYear(adYear: number, adMonthOneBased: number): string {
  const label = monthLabelForMode(adYear, adMonthOneBased, "bs");
  const m = /(\d{4})\s+BS$/.exec(label);
  return m?.[1] ?? String(adYear);
}

export function WorkingHoursMonthPickerCard({
  value,
  onChange,
  zone,
  disabled,
  className,
}: {
  value: string;
  onChange: (yyyyMm: string) => void;
  zone: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { mode } = useCalendarMode();
  const selected = DateTime.fromFormat(value, "yyyy-MM", { zone });
  const displayLong = selected.isValid
    ? monthLabelForMode(selected.year, selected.month, mode)
    : value;
  const selYear = selected.isValid ? selected.year : DateTime.now().setZone(zone).year;
  const selMonth = selected.isValid ? selected.month : DateTime.now().setZone(zone).month;

  const [draftYear, setDraftYear] = React.useState(selYear);
  React.useEffect(() => {
    if (!open) return;
    setDraftYear(selYear);
  }, [open, selYear]);

  const pickMonth = (m: number) => {
    const next = DateTime.fromObject({ year: draftYear, month: m, day: 1 }, { zone });
    if (!next.isValid) return;
    onChange(next.toFormat("yyyy-MM"));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "group flex w-full max-w-md items-center gap-4 rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-zinc-50/90 p-4 text-left shadow-[0_4px_24px_-8px_rgba(0,0,0,0.12)] transition-all",
            "hover:border-cyan-500/35 hover:shadow-[0_8px_32px_-12px_rgba(34,211,238,0.2)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
            "dark:border-white/10 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900/90 dark:hover:border-cyan-400/25",
            disabled && "pointer-events-none opacity-50",
            className
          )}
        >
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl",
              "bg-gradient-to-br from-cyan-500/15 to-violet-500/15 ring-1 ring-cyan-500/20 dark:ring-cyan-400/25"
            )}
          >
            <CalendarClock className="size-6 text-cyan-700 dark:text-cyan-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Month
            </p>
            <p className="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {displayLong}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {zone} · {mode === "bs" ? "BS mode" : "AD mode"}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-zinc-400 transition-transform duration-200 dark:text-zinc-500",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(calc(100vw-2rem),22rem)] border-zinc-200/90 p-0 dark:border-white/10"
        align="start"
        sideOffset={8}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-zinc-100 p-3 dark:border-white/10">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Choose month
          </p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-lg"
              aria-label="Previous year"
              onClick={() => setDraftYear((y) => y - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="min-w-[4.5rem] text-center text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {mode === "bs" ? bsYearFromAdYear(draftYear, selMonth) : draftYear}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-lg"
              aria-label="Next year"
              onClick={() => setDraftYear((y) => y + 1)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-3 sm:grid-cols-4">
          {MONTH_IX.map((m) => {
            const label =
              mode === "bs"
                ? monthLabelForMode(draftYear, m, "bs").replace(/\s+\d{4}\s+BS$/, "")
                : DateTime.fromObject(
                    { year: draftYear, month: m, day: 1 },
                    { zone }
                  ).toFormat("LLL");
            const isSel = draftYear === selYear && m === selMonth;
            return (
              <button
                key={m}
                type="button"
                onClick={() => pickMonth(m)}
                className={cn(
                  "rounded-xl px-2 py-2.5 text-center text-xs font-medium transition-colors sm:text-sm",
                  isSel
                    ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/25 dark:bg-cyan-600 dark:text-white"
                    : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
