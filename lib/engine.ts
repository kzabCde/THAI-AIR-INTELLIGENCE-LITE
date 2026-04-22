import { getBestAirReading } from "@/lib/apis/air";
import { getHotspotCount } from "@/lib/apis/hotspots";
import { getWeather } from "@/lib/apis/weather";
import { cache } from "@/lib/cache";
import { chooseBestPrediction, linearRegressionModel, movingAverageModel, weightedSmartScoreModel } from "@/lib/prediction/models";
import { adjustedRiskPm25, riskLevelFromPm25 } from "@/lib/scoring";
import { THAILAND_PROVINCES } from "@/lib/thailand-provinces";
import type { HistoricalPoint, ProvinceSnapshot } from "@/types/air";

function buildInsight(name: string, pm25: number, pred: number, hotspot: number, wind: number) {
  if (pred > pm25 && hotspot > 5 && wind < 3) {
    return `${name} likely worsens tomorrow due to hotspot rise and low wind.`;
  }
  if (pred < pm25 && wind > 7) {
    return `${name} may improve with stronger wind dispersion.`;
  }
  return `${name} is expected to stay near current PM2.5 conditions.`;
}

function toHistoryPoint(snapshot: ProvinceSnapshot): HistoricalPoint {
  return {
    date: new Date().toISOString().slice(0, 10),
    province: snapshot.slug,
    pm25: snapshot.air.pm25,
    pm10: snapshot.air.pm10,
    aqi: snapshot.air.aqi,
    temp: snapshot.weather.temp,
    humidity: snapshot.weather.humidity,
    wind: snapshot.weather.wind,
    hotspots: snapshot.hotspot_count,
  };
}

export async function buildThailandSnapshot(): Promise<ProvinceSnapshot[]> {
  const results = await Promise.all(
    THAILAND_PROVINCES.map(async (province) => {
      const [air, weather, hotspots] = await Promise.all([
        getBestAirReading(province.latitude, province.longitude),
        getWeather(province.latitude, province.longitude),
        getHotspotCount(province.latitude, province.longitude),
      ]);

      const history = cache.getHistoryByProvince(province.slug);
      const risingTrend = history.length >= 4 && history.at(-1)!.pm25 > history.at(-4)!.pm25;

      const ma = movingAverageModel(history);
      const lr = linearRegressionModel(history);
      const weighted = weightedSmartScoreModel(history, hotspots * 10, weather.wind);
      const selected = chooseBestPrediction({ ma, lr, weighted }, history);

      const riskPm = adjustedRiskPm25(selected.value || air.pm25, weather.humidity, weather.wind, hotspots - (history.at(-1)?.hotspots ?? 0), risingTrend);

      const snapshot: ProvinceSnapshot = {
        slug: province.slug,
        province_name_th: province.province_name_th,
        province_name_en: province.province_name_en,
        region: province.region,
        latitude: province.latitude,
        longitude: province.longitude,
        population: province.population,
        nearby_stations: [air.station, ...province.nearby_stations].slice(0, 4),
        risk_level: riskLevelFromPm25(riskPm),
        hotspot_count: hotspots,
        air,
        weather,
        predicted_pm25: Number((selected.value || air.pm25).toFixed(1)),
        prediction_model: selected.model,
        insight: buildInsight(province.province_name_en, air.pm25, selected.value || air.pm25, hotspots, weather.wind),
      };

      cache.saveHistoricalPoint(toHistoryPoint(snapshot));
      return snapshot;
    }),
  );

  cache.saveSnapshot(results);
  return results;
}
