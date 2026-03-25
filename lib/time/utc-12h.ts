/** Convert 24h "HH:mm" (UTC) to 12h parts for display. */
export function from24hUtc(s: string): { h12: number; m: number; ap: "AM" | "PM" } {
  const [a, b] = s.split(":").map((x) => parseInt(x, 10));
  const h24 = Number.isFinite(a) ? a : 0;
  const m = Number.isFinite(b) ? b : 0;
  const ap = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h12, m, ap };
}

/** Build 24h "HH:mm" (UTC) from 12h clock. */
export function to24hUtc(h12: number, m: number, ap: "AM" | "PM"): string {
  const h24 =
    ap === "AM" ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
  return `${String(h24).padStart(2, "0")}:${String(Math.min(59, Math.max(0, m))).padStart(2, "0")}`;
}
