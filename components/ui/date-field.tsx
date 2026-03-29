"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDateDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return "Select date";
  const d = new Date(`${iso.trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Select date";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type DateFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Native date picker: invisible `input` covers the full row so any tap opens the calendar.
 * Visible row shows a calendar icon and formatted date.
 */
export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  ({ className, value, onChange, id, disabled, ...rest }, ref) => {
    return (
      <div
        className={cn(
          "relative min-h-11 w-full overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm transition-[box-shadow,border-color]",
          "focus-within:border-cyan-600/70 focus-within:ring-2 focus-within:ring-cyan-500/30",
          "dark:border-white/15 dark:bg-zinc-950 dark:focus-within:border-cyan-400/55 dark:focus-within:ring-cyan-400/20",
          !disabled && "hover:border-zinc-400 dark:hover:border-zinc-500",
          disabled && "pointer-events-none opacity-60",
          className
        )}
      >
        <div className="pointer-events-none flex min-h-11 items-center gap-2.5 px-3.5 py-2.5">
          <CalendarDays
            className="size-5 shrink-0 text-cyan-700 dark:text-cyan-400"
            aria-hidden
          />
          <span className="min-w-0 flex-1 text-left text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {formatDateDisplay(value)}
          </span>
        </div>
        <input
          id={id}
          ref={ref}
          type="date"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "absolute inset-0 z-10 h-full min-h-11 w-full cursor-pointer opacity-0",
            "[color-scheme:light] dark:[color-scheme:dark]"
          )}
          {...rest}
        />
      </div>
    );
  }
);
DateField.displayName = "DateField";
