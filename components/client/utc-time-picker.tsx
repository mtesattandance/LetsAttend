"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { from24hUtc, to24hUtc } from "@/lib/time/utc-12h";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  allowEmpty?: boolean;
  className?: string;
};

export function UtcTimePicker({
  id,
  label,
  value,
  onChange,
  allowEmpty = false,
  className,
}: Props) {
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

  const disabled = allowEmpty && !hasValue;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm text-zinc-400">{label}</span>
      {allowEmpty ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              "rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
              !hasValue
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                : "border-white/10 bg-black/40 text-zinc-400 hover:bg-white/5"
            )}
            onClick={() => onChange("")}
          >
            No time
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/5"
            onClick={() => onChange("09:00")}
          >
            Set to 9:00 AM UTC
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-2",
          disabled && "pointer-events-none opacity-40"
        )}
      >
        <select
          id={id ? `${id}-h` : undefined}
          aria-label={`${label} hour`}
          className="min-w-[4.25rem] flex-1 rounded-lg border border-white/10 bg-zinc-950/80 px-2 py-2.5 text-center text-sm text-foreground"
          disabled={disabled}
          value={h12}
          onChange={(e) => apply(Number(e.target.value), m, ap)}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-zinc-500">:</span>
        <select
          id={id ? `${id}-m` : undefined}
          aria-label={`${label} minute`}
          className="min-w-[4.25rem] flex-1 rounded-lg border border-white/10 bg-zinc-950/80 px-2 py-2.5 text-center text-sm text-foreground"
          disabled={disabled}
          value={m}
          onChange={(e) => apply(h12, Number(e.target.value), ap)}
        >
          {MINUTES.map((mm) => (
            <option key={mm} value={mm}>
              {String(mm).padStart(2, "0")}
            </option>
          ))}
        </select>
        <div className="flex min-w-[7rem] flex-1 gap-1">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              className={cn(
                "flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors",
                ap === p
                  ? "bg-cyan-600 text-white shadow-[0_0_12px_-4px_rgba(34,211,238,0.6)]"
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
        <p className="text-xs text-zinc-500">
          Saved as <span className="font-mono text-zinc-400">{value.trim()}</span> UTC
        </p>
      ) : allowEmpty ? (
        <p className="text-xs text-zinc-500">Optional — or use “Set to 9:00 AM UTC” to pick a time.</p>
      ) : null}
    </div>
  );
}
