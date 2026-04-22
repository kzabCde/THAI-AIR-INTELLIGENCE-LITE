export type ProvinceAir = {
  slug: string;
  province: string;
  lat: number;
  lon: number;
  pm25: number;
  fetchedAt: string;
  source: "live" | "fallback";
};

export type ForecastPoint = {
  day: string;
  estimate: number;
};

export type ProvinceWeather = {
  temperature: number;
  humidity: number;
  wind: number;
};
