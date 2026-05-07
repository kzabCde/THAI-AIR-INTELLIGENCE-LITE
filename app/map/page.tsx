import dynamic from "next/dynamic";

const AirQualityMapClient = dynamic(() => import("@/components/map/air-quality-map-client").then((m) => m.AirQualityMapClient), { ssr: false });

export default function MapPage() {
  return <AirQualityMapClient />;
}
