export type MapProvince = {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  lat: number;
  lon: number;
  pm25: number | null;
  pm10?: number | null;
  aqi: number | null;
  color: string;
  labelTh: string;
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  precipitation?: number | null;
  precipitation24h?: number | null;
  hotspots?: number | null;
  pm25Delta?: number | null;
  observedAt?: string | null;
};

export type MapFilterMode = "pm25" | "aqi" | "pm10" | "hotspot" | "weather" | "wind";

export type MapBasemap = "satellite" | "terrain" | "dark";

export type MapLayerOptions = {
  primaryMetric: MapFilterMode;
  showHotspots: boolean;
  showWindVectors: boolean;
  showWeatherBadges: boolean;
  showAtmosphereOverlay: boolean;
  showRainRadar: boolean;
  basemap: MapBasemap;
};
