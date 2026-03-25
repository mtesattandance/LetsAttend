import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

type NominatimItem = {
  lat: string;
  lon: string;
  display_name?: string;
};

/**
 * Forward geocoding via Nominatim (OpenStreetMap). Respect their usage policy:
 * https://operations.osmfoundation.org/policies/nominatim/ — light use only.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return jsonError("Query “q” must be at least 2 characters.", 400);
  }

  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8`;

  try {
    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "LetsAttend/1.0 (internal geocoding; contact: app admin)",
        "Accept-Language": "en",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return jsonError("Geocoding service error", 502);
    }
    const raw = (await res.json()) as NominatimItem[];
    const results = raw.map((r) => ({
      latitude: Number(r.lat),
      longitude: Number(r.lon),
      label: r.display_name ?? `${r.lat}, ${r.lon}`,
    })).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));

    return NextResponse.json({ results });
  } catch {
    return jsonError("Geocoding failed", 502);
  }
}
