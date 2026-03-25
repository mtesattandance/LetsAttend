import { haversineMeters } from "./haversine";

export type SiteCoords = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export function isWithinSiteRadius(
  userLat: number,
  userLon: number,
  site: SiteCoords
): { ok: true; distanceM: number } | { ok: false; distanceM: number } {
  const distanceM = haversineMeters(
    userLat,
    userLon,
    site.latitude,
    site.longitude
  );
  if (distanceM <= site.radiusMeters) {
    return { ok: true, distanceM };
  }
  return { ok: false, distanceM };
}
