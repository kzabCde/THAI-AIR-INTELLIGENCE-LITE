export type RiskRow = { province: string; district: string; pm25: number };

export function topRiskDistricts(rows: RiskRow[], limit = 10): RiskRow[] {
  return [...rows].sort((a, b) => b.pm25 - a.pm25).slice(0, limit);
}

export function topRiskProvinces(rows: RiskRow[]): Array<{ province: string; pm25: number }> {
  const map = rows.reduce<Record<string, { total: number; count: number }>>((acc, row) => {
    if (!acc[row.province]) acc[row.province] = { total: 0, count: 0 };
    acc[row.province].total += row.pm25;
    acc[row.province].count += 1;
    return acc;
  }, {});

  return Object.entries(map)
    .map(([province, value]) => ({ province, pm25: value.total / value.count }))
    .sort((a, b) => b.pm25 - a.pm25);
}
