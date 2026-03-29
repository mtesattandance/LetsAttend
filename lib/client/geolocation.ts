/** Browser geolocation helper for check-in / check-out flows. */

export type GpsResult = {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters (lower is better). From `coords.accuracy`. */
  accuracyM?: number;
};

type GetGpsFixOptions = {
  /** Browser geolocation timeout (ms). @default 14_000 */
  timeoutMs?: number;
};

function toResult(pos: GeolocationPosition): GpsResult {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyM: pos.coords.accuracy,
  };
}

/**
 * Single `getCurrentPosition` call — fast to return the first fix the OS provides.
 * (Previously this waited on multi-sample `watchPosition` + settle windows.)
 */
export function getGpsFix(options?: GetGpsFixOptions): Promise<GpsResult> {
  const timeoutMs = options?.timeoutMs ?? 14_000;

  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toResult(pos)),
      () => {
        reject(new Error("GPS denied or unavailable. Enable location for this site."));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 8_000,
        timeout: timeoutMs,
      }
    );
  });
}
