import { cn } from "@/lib/utils";

/** Human-readable role label (e.g. super_admin → Super admin). */
export function formatRoleDisplay(role: string | undefined): string {
  const raw = (role ?? "").trim();
  if (!raw) return "—";
  return raw
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Pill styles for user role — readable in light and dark mode. */
export function roleBadgeClassNames(role: string | undefined): string {
  const r = (role ?? "").toLowerCase().replace(/\s+/g, "_");
  if (r === "super_admin") {
    return cn(
      "rounded-lg bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-900",
      "ring-1 ring-violet-200/80 dark:bg-violet-950/55 dark:text-violet-200 dark:ring-violet-500/30"
    );
  }
  if (r === "admin") {
    return cn(
      "rounded-lg bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-950",
      "ring-1 ring-amber-200/90 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-500/25"
    );
  }
  return cn(
    "rounded-lg bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-950",
    "ring-1 ring-emerald-200/90 dark:bg-emerald-950/45 dark:text-emerald-300 dark:ring-emerald-500/25"
  );
}
