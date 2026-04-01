"use client";

import * as React from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePickerPanel } from "@/components/ui/date-picker-panel";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar } from "@/lib/date/bs-calendar";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { cn } from "@/lib/utils";

export type DateFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Renders inside the card so title + value share one full-width tap target. */
  label?: string;
  /** IANA zone for the calendar “Today” / grid (defaults to app default zone). */
  timeZone?: string;
};

/**
 * Custom calendar popover (styled, Clear / Today) — replaces native `type="date"` for consistent UI.
 */
export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  (
    {
      className,
      value,
      onChange,
      id,
      disabled,
      label,
      timeZone,
      "aria-label": ariaLabel,
      ...rest
    },
    ref
  ) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const labelTextId = label ? `${inputId}-title` : undefined;
    const tz = normalizeTimeZoneId(timeZone);
    const { mode } = useCalendarMode();
    const [open, setOpen] = React.useState(false);

    return (
      <>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              id={inputId}
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-labelledby={label ? labelTextId : undefined}
              aria-label={label ? undefined : ariaLabel}
              className={cn(
                "group relative block w-full cursor-pointer overflow-hidden rounded-2xl text-left",
                "border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/90",
                "shadow-sm shadow-zinc-900/[0.04] ring-1 ring-inset ring-white/60",
                "transition-[box-shadow,border-color,transform] duration-200",
                "hover:border-cyan-500/35 hover:shadow-md hover:shadow-zinc-900/[0.06]",
                "active:scale-[0.995]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                "dark:border-white/12 dark:from-zinc-950 dark:to-zinc-900/85 dark:shadow-black/20 dark:ring-white/[0.04]",
                "dark:hover:border-cyan-400/30 dark:focus-visible:ring-cyan-400/25 dark:focus-visible:ring-offset-zinc-950",
                open &&
                  "border-cyan-600/70 shadow-md shadow-cyan-900/[0.08] ring-2 ring-cyan-500/35 dark:border-cyan-400/55 dark:ring-cyan-400/25",
                disabled && "pointer-events-none opacity-60",
                className
              )}
            >
              <div
                className={cn(
                  "relative z-0 flex min-h-[3.25rem] w-full flex-col justify-center",
                  label ? "gap-0.5 px-4 pb-3 pt-3" : "gap-0 px-4 py-3"
                )}
              >
                {label ? (
                  <>
                    <span
                      id={labelTextId}
                      className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400"
                    >
                      {label}
                    </span>
                    <div className="flex min-h-[1.5rem] items-center gap-3">
                      <CalendarDays
                        className="size-5 shrink-0 text-cyan-600 dark:text-cyan-400"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                        {formatIsoForCalendar(value, mode, tz)}
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-5 shrink-0 text-zinc-400 transition-transform duration-200",
                          "group-hover:text-cyan-600 dark:text-zinc-500 dark:group-hover:text-cyan-400",
                          open && "rotate-180 text-cyan-600 dark:text-cyan-400"
                        )}
                        aria-hidden
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <CalendarDays
                      className="size-5 shrink-0 text-cyan-600 dark:text-cyan-400"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {formatIsoForCalendar(value, mode, tz)}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-5 shrink-0 text-zinc-400 transition-transform duration-200",
                        "group-hover:text-cyan-600 dark:text-zinc-500 dark:group-hover:text-cyan-400",
                        open && "rotate-180 text-cyan-600 dark:text-cyan-400"
                      )}
                      aria-hidden
                    />
                  </div>
                )}
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              "z-[1200] w-[min(calc(100vw-1rem),20rem)] max-w-[min(calc(100vw-1rem),20rem)] border-0 bg-transparent p-0 shadow-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            )}
          >
            <DatePickerPanel
              selectedIso={value}
              timeZone={tz}
              onSelect={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <input
          ref={ref}
          type="hidden"
          value={value}
          readOnly
          tabIndex={-1}
          aria-hidden
          {...rest}
        />
      </>
    );
  }
);
DateField.displayName = "DateField";
