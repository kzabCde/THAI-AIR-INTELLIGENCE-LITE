import { riskColor, riskLabel } from "@/lib/colors";

interface AqiGaugeProps {
  pm25: number;
  size?: number;
}

export function AqiGauge({ pm25, size = 120 }: AqiGaugeProps) {
  const max = 300;
  const pct = Math.min(1, pm25 / max);
  const angle = -135 + pct * 270;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;

  const polarToXY = (angleDeg: number, radius: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const arcPath = (startAngle: number, endAngle: number, radius: number, color: string) => {
    const start = polarToXY(startAngle, radius);
    const end = polarToXY(endAngle, radius);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return (
      <path
        d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.08}
        strokeLinecap="round"
      />
    );
  };

  const needle = polarToXY(angle - 90, r * 0.75);
  const color = riskColor(pm25);

  return (
    <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {arcPath(-135, -45, r, "#00e400")}
      {arcPath(-45, 15, r, "#ffff00")}
      {arcPath(15, 60, r, "#ff7e00")}
      {arcPath(60, 100, r, "#ff0000")}
      {arcPath(100, 135, r, "#7e0023")}
      <line
        x1={cx} y1={cy}
        x2={needle.x} y2={needle.y}
        stroke={color} strokeWidth={size * 0.025} strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={size * 0.05} fill={color} />
      <text x={cx} y={cy + size * 0.25} textAnchor="middle" className="text-xs font-bold" style={{ fontSize: size * 0.13, fill: color, fontWeight: 700 }}>
        {pm25.toFixed(0)}
      </text>
      <text x={cx} y={cy + size * 0.38} textAnchor="middle" style={{ fontSize: size * 0.08, fill: "#666" }}>
        μg/m³
      </text>
    </svg>
  );
}
