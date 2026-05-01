type District = { province: string; district: string; lat: number; lon: number; pm25?: number };

const color = (pm25 = 0) => (pm25 > 75 ? "bg-rose-500" : pm25 > 50 ? "bg-orange-500" : pm25 > 25 ? "bg-yellow-400" : "bg-emerald-500");

export function MapView({ districts, onPick }: { districts: District[]; onPick: (d: District) => void }) {
  return <div className="rounded-xl border p-4"><h3 className="mb-2 font-semibold">Map Heat (District Mock)</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{districts.map((d) => <button key={`${d.province}-${d.district}`} onClick={() => onPick(d)} className="rounded border p-2 text-left"><div className={`mb-1 h-2 rounded ${color(d.pm25)}`} /><p className="text-sm font-medium">{d.district}</p><p className="text-xs text-slate-500">{d.province}</p></button>)}</div></div>;
}
