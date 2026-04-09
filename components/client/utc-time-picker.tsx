"use client";

import * as React from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { formatWallHm12h } from "@/lib/time/format-wall-time";
import { from24hUtc, to24hUtc } from "@/lib/time/utc-12h";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** Above `EmployeeCustomSiteModal` (z-8000) and other overlays so hour/minute lists receive clicks. */
const TIME_POPOVER_Z = "z-[10000]";

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  allowEmpty?: boolean;
  className?: string;
  /** Light styles for use on white modal backgrounds. */
  variant?: "dark" | "light";
};

export function UtcTimePicker({
  id,
  label,
  value,
  onChange,
  allowEmpty = false,
  className,
  variant = "dark",
}: Props) {
  const light = variant === "light";
  const hasValue = Boolean(value.trim());

  const [h12, setH12] = React.useState(9);
  const [m, setM] = React.useState(0);
  const [ap, setAp] = React.useState<"AM" | "PM">("AM");

  React.useEffect(() => {
    const t = value.trim();
    if (!t) {
      setH12(9);
      setM(0);
      setAp("AM");
      return;
    }
    const p = from24hUtc(t);
    setH12(p.h12);
    setM(p.m);
    setAp(p.ap);
  }, [value]);

  const apply = (nh: number, nm: number, nap: "AM" | "PM") => {
    setH12(nh);
    setM(nm);
    setAp(nap);
    onChange(to24hUtc(nh, nm, nap));
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span
        className={cn(
          "text-sm",
          light ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400"
        )}
      >
        {label}
      </span>
      {allowEmpty ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              "rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
              !hasValue
                ? light
                  ? "border-cyan-600/40 bg-cyan-50 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-950/40 dark:text-cyan-100"
                  : "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                : light
                  ? "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  : "border-white/10 bg-black/40 text-zinc-400 hover:bg-white/5"
            )}
            onClick={() => onChange("")}
          >
            No time
          </button>
          <button
            type="button"
            className={cn(
              "rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
              light
                ? "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                : "border-white/10 bg-black/40 text-zinc-200 hover:bg-white/5"
            )}
            onClick={() => onChange("09:00")}
          >
            Set to 9:00 AM (local)
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border p-2",
          light
            ? "border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/50"
            : "border-white/10 bg-black/40"
        )}
      >
        <SearchableSelect
          id={id ? `${id}-h` : undefined}
          aria-label={`${label} hour`}
          includeEmpty={false}
          value={String(h12)}
          onValueChange={(v) => apply(Number(v), m, ap)}
          options={HOURS.map((h) => ({ value: String(h), label: String(h) }))}
          searchPlaceholder="Search hour…"
          showChevron={false}
          triggerClassName={cn(
            "min-w-[4.25rem] flex-1 justify-center rounded-lg border px-2 py-2 text-center text-sm",
            light
              ? "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              : "border-white/10 bg-zinc-950/80 text-foreground"
          )}
          listClassName="max-h-[min(280px,45vh)]"
          popoverContentClassName={TIME_POPOVER_Z}
        />
        <span className={cn(light ? "text-zinc-500" : "text-zinc-500")}>:</span>
        <SearchableSelect
          id={id ? `${id}-m` : undefined}
          aria-label={`${label} minute`}
          includeEmpty={false}
          value={String(m)}
          onValueChange={(v) => apply(h12, Number(v), ap)}
          options={MINUTES.map((mm) => ({
            value: String(mm),
            label: String(mm).padStart(2, "0"),
          }))}
          searchPlaceholder="Search minute…"
          showChevron={false}
          triggerClassName={cn(
            "min-w-[4.25rem] flex-1 justify-center rounded-lg border px-2 py-2 text-center text-sm",
            light
              ? "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              : "border-white/10 bg-zinc-950/80 text-foreground"
          )}
          listClassName="max-h-[min(280px,45vh)]"
          popoverContentClassName={TIME_POPOVER_Z}
        />
        <div className="flex min-w-[7rem] flex-1 gap-1">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={cn(
                "flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors",
                ap === p
                  ? "bg-cyan-600 text-white shadow-[0_0_12px_-4px_rgba(34,211,238,0.6)]"
                  : light
                    ? "bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
              )}
              onClick={() => apply(h12, m, p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {hasValue ? (
        <p
          className={cn(
            "text-xs",
            light ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-500"
          )}
        >
          Saved as{" "}
          <span
            className={cn(
              "font-mono",
              light ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400"
            )}
          >
            {formatWallHm12h(value.trim())}
          </span>{" "}
          (12-hour, site local wall time)
        </p>
      ) : allowEmpty ? (
        <p
          className={cn(
            "text-xs",
            light ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-500"
          )}
        >
          Optional — or use “Set to 9:00 AM (local)” to pick a time.
        </p>
      ) : null}
    </div>
  );
}
