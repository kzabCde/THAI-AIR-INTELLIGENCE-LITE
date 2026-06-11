export type MapProvince = {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  lat: number;
  lon: number;
  pm25: number | null;
  aqi: number | null;
  color: string;
  labelTh: string;
};
