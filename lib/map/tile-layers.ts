/** Shared Leaflet tile URLs (no API keys). */

export const OSM_TILE = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
} as const;

/** Esri World Imagery — satellite / aerial view. */
export const ESRI_SATELLITE_TILE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
} as const;

export type BasemapId = "street" | "satellite";

/** Default layer for admin maps — satellite helps align pins with buildings and job sites. */
export const DEFAULT_BASEMAP: BasemapId = "satellite";
