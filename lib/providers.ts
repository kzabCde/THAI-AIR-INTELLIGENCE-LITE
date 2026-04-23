import { getBestAirReading } from "@/lib/apis/air";
import { getWeather } from "@/lib/apis/weather";
import { getHotspotCount } from "@/lib/apis/hotspots";

export const providers = {
  air: getBestAirReading,
  weather: getWeather,
  hotspot: getHotspotCount,
};
