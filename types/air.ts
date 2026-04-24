export type DataSource = "air4thai" | "openaq" | "open-meteo-air" | "waqi" | "fallback";

export type AirReading = {
  pm25: number;
  pm10: number;
  aqi: number;
  source: DataSource;
  station: string;
  fetchedAt: string;
};

export type WeatherReading = {
  temp: number;
  humidity: number;
  wind: number;
  rain: number;
  source: "open-meteo-weather";
};

export type ProvinceSnapshot = {
  slug: string;
  province_name_th: string;
  province_name_en: string;
  region: string;
  latitude: number;
  longitude: number;
  population?: number;
  nearby_stations: string[];
  risk_level: RiskLevel;
  hotspot_count: number;
  air: AirReading;
  weather: WeatherReading;
  predicted_pm25: number;
  prediction_model: "moving-average" | "linear-regression" | "weighted-smart-score";
  insight: string;
};

export type HistoricalPoint = {
  date: string;
  province: string;
  pm25: number;
  pm10: number;
  aqi: number;
  temp: number;
  humidity: number;
  wind: number;
  hotspots: number;
};

export type RiskLevel =
  | "Excellent"
  | "Good"
  | "Moderate"
  | "Unhealthy Sensitive"
  | "Unhealthy"
  | "Hazardous";

// Backward-compatible aliases for legacy modules.
export type ProvinceAir = {
  slug: string;
  province: string;
  lat: number;
  lon: number;
  pm25: number;
  fetchedAt: string;
  source: "live" | "fallback";
};

export type ForecastPoint = { day: string; estimate: number };

export type ProvinceWeather = { temperature: number; humidity: number; wind: number };
