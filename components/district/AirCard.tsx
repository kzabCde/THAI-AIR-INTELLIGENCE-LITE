export function AirCard({ title, value, alert }: { title: string; value: string; alert?: boolean }) {
  return <div className={`rounded-xl border p-3 ${alert ? "border-rose-400 bg-rose-50" : ""}`}><p className="text-xs text-slate-500">{title}</p><p className="text-xl font-bold">{value}</p></div>;
}
