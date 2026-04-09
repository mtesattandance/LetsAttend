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
      (err) => {
        const code = (err as GeolocationPositionError)?.code;
        let message: string;
        if (code === 1) {
          message =
            "Location access was blocked. Allow location for this site in your browser (lock icon in the address bar), then try again.";
        } else if (code === 2) {
          message =
            "Location is unavailable (GPS off, poor signal, or device can’t determine position). Move outdoors or enable location services.";
        } else if (code === 3) {
          message = `Location request timed out after ${Math.round(timeoutMs / 1000)}s. Try again with a clearer sky view or disable battery saver.`;
        } else {
          message =
            "Could not read your location. Use HTTPS or localhost, allow location for this page, and try again.";
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 8_000,
        timeout: timeoutMs,
      }
    );
  });
}
