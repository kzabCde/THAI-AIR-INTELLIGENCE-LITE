export const THAI_PM25_STANDARD = 37.5;

export type TrendInputPoint = {
  date: string;
  pm25: number | null;
  pm25Max?: number | null;
  pm25Min?: number | null;
  aqi?: number | null;
  temp?: number | null;
  humidity?: number | null;
  wind?: number | null;
  hotspots?: number | null;
  hoursAvailable?: number | null;
  isBurningSeason?: boolean | null;
  trustedSources?: string[];
  trustedObservedAt?: string | null;
};

export type TrendCalendarPoint = TrendInputPoint & {
  rolling7: number | null;
};

export type TrendEpisode = {
  startDate: string;
  endDate: string;
  days: number;
  averagePm25: number;
  peakPm25: number;
  peakDate: string;
  averageWind: number | null;
  averageHumidity: number | null;
};

export type TrendMonth = {
  month: string;
  averagePm25: number | null;
  exceedanceDays: number;
  observedDays: number;
  expectedDays: number;
  previousYearAverage: number | null;
  previousYearObservedDays: number;
  previousYearExpectedDays: number;
  yearOverYearPercent: number | null;
};

export type TrendPeriodStats = {
  averagePm25: number | null;
  observedDays: number;
  expectedDays: number;
  coveragePercent: number;
};

export type TrendAnalysis = {
  anchorDate: string | null;
  latestDataDate: string | null;
  staleDays: number;
  fromDate: string | null;
  previousFromDate: string | null;
  previousToDate: string | null;
  calendar: TrendCalendarPoint[];
  current: TrendPeriodStats;
  previous: TrendPeriodStats;
  comparisonDelta: number | null;
  comparisonPercent: number | null;
  comparisonCoverageGap: number;
  comparisonReliable: boolean;
  latest7Average: number | null;
  latest7ObservedDays: number;
  prior7Average: number | null;
  prior7ObservedDays: number;
  momentumDelta: number | null;
  direction: "improving" | "stable" | "worsening" | "unknown";
  exceedanceDays: number;
  longestExceedanceStreak: number;
  currentExceedanceStreak: number;
  episodes: TrendEpisode[];
  hourlyCoveragePercent: number;
  latestTrustedObservedAt: string | null;
  sources: string[];
  months: TrendMonth[];
  burning: TrendPeriodStats;
  nonBurning: TrendPeriodStats;
};

const DAY_MS = 86_400_000;

function parseDateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function dateMs(date: string): number {
  const { year, month, day } = parseDateParts(date);
  return Date.UTC(year, month - 1, day);
}

export function shiftTrendDate(date: string, days: number): string {
  return new Date(dateMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(isFiniteNumber);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildPeriodStats(rows: TrendInputPoint[], expectedDays: number): TrendPeriodStats {
  const values = rows.map((row) => row.pm25).filter(isFiniteNumber);
  return {
    averagePm25: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    observedDays: values.length,
    expectedDays,
    coveragePercent: expectedDays ? round((values.length / expectedDays) * 100, 0) : 0,
  };
}

function buildEpisodes(calendar: TrendCalendarPoint[]): TrendEpisode[] {
  const groups: TrendCalendarPoint[][] = [];
  let active: TrendCalendarPoint[] = [];

  for (const point of calendar) {
    if (isFiniteNumber(point.pm25) && point.pm25 > THAI_PM25_STANDARD) {
      active.push(point);
      continue;
    }
    if (active.length) groups.push(active);
    active = [];
  }
  if (active.length) groups.push(active);

  return groups
    .map((group): TrendEpisode => {
      const peak = group.reduce((best, point) =>
        (point.pm25 ?? -Infinity) > (best.pm25 ?? -Infinity) ? point : best,
      );
      return {
        startDate: group[0].date,
        endDate: group[group.length - 1].date,
        days: group.length,
        averagePm25: round(mean(group.map((point) => point.pm25)) ?? 0),
        peakPm25: round(peak.pm25 ?? 0),
        peakDate: peak.date,
        averageWind: mean(group.map((point) => point.wind)),
        averageHumidity: mean(group.map((point) => point.humidity)),
      };
    })
    .sort((a, b) => b.peakPm25 - a.peakPm25 || b.days - a.days);
}

function countTrailingExceedance(calendar: TrendCalendarPoint[]): number {
  let count = 0;
  for (let index = calendar.length - 1; index >= 0; index -= 1) {
    const value = calendar[index].pm25;
    if (!isFiniteNumber(value) || value <= THAI_PM25_STANDARD) break;
    count += 1;
  }
  return count;
}

function buildMonths(
  allRows: TrendInputPoint[],
  anchorDate: string,
): TrendMonth[] {
  const anchor = parseDateParts(anchorDate);
  const months = Array.from({ length: 12 }, (_, reverseIndex) => {
    const value = new Date(Date.UTC(anchor.year, anchor.month - 1 - (11 - reverseIndex), 1));
    return value.toISOString().slice(0, 7);
  });

  return months.map((month) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const naturalMonthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    const monthEnd = month === anchorDate.slice(0, 7) ? anchorDate : naturalMonthEnd;
    const expectedDays = Math.floor((dateMs(monthEnd) - dateMs(monthStart)) / DAY_MS) + 1;
    const rows = allRows.filter(
      (row) => row.date >= monthStart && row.date <= monthEnd && isFiniteNumber(row.pm25),
    );
    const values = rows.map((row) => row.pm25).filter(isFiniteNumber);
    const previousMonth = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
    const previousStart = `${previousMonth}-01`;
    const previousNaturalEnd = new Date(Date.UTC(year - 1, monthNumber, 0)).toISOString().slice(0, 10);
    const previousElapsedEnd = shiftTrendDate(previousStart, expectedDays - 1);
    const previousEnd = previousElapsedEnd < previousNaturalEnd ? previousElapsedEnd : previousNaturalEnd;
    const previousValues = allRows
      .filter((row) => row.date >= previousStart && row.date <= previousEnd)
      .map((row) => row.pm25)
      .filter(isFiniteNumber);
    const averagePm25 = mean(values);
    const previousYearAverage = mean(previousValues);
    const previousYearExpectedDays = Math.floor((dateMs(previousEnd) - dateMs(previousStart)) / DAY_MS) + 1;
    const comparableCoverage =
      values.length / expectedDays >= 0.8 &&
      previousValues.length / previousYearExpectedDays >= 0.8;
    return {
      month,
      averagePm25: averagePm25 == null ? null : round(averagePm25),
      exceedanceDays: values.filter((value) => value > THAI_PM25_STANDARD).length,
      observedDays: values.length,
      expectedDays,
      previousYearAverage: previousYearAverage == null ? null : round(previousYearAverage),
      previousYearObservedDays: previousValues.length,
      previousYearExpectedDays,
      yearOverYearPercent:
        comparableCoverage && averagePm25 != null && previousYearAverage != null && previousYearAverage > 0
          ? round(((averagePm25 - previousYearAverage) / previousYearAverage) * 100)
          : null,
    };
  });
}

export function analyzeTrendHistory(
  input: TrendInputPoint[],
  requestedDays: number,
  throughDate?: string,
): TrendAnalysis {
  const rangeDays = Math.min(365, Math.max(7, Math.trunc(requestedDays)));
  const rows = [...input]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestDataDate = [...rows].reverse().find((row) => isFiniteNumber(row.pm25))?.date ?? null;
  const anchorDate =
    throughDate && /^\d{4}-\d{2}-\d{2}$/.test(throughDate)
      ? throughDate
      : latestDataDate;

  const emptyStats = buildPeriodStats([], rangeDays);
  if (!anchorDate || !latestDataDate) {
    return {
      anchorDate: null,
      latestDataDate: null,
      staleDays: 0,
      fromDate: null,
      previousFromDate: null,
      previousToDate: null,
      calendar: [],
      current: emptyStats,
      previous: emptyStats,
      comparisonDelta: null,
      comparisonPercent: null,
      comparisonCoverageGap: 0,
      comparisonReliable: false,
      latest7Average: null,
      latest7ObservedDays: 0,
      prior7Average: null,
      prior7ObservedDays: 0,
      momentumDelta: null,
      direction: "unknown",
      exceedanceDays: 0,
      longestExceedanceStreak: 0,
      currentExceedanceStreak: 0,
      episodes: [],
      hourlyCoveragePercent: 0,
      latestTrustedObservedAt: null,
      sources: [],
      months: [],
      burning: buildPeriodStats([], 0),
      nonBurning: buildPeriodStats([], 0),
    };
  }

  const fromDate = shiftTrendDate(anchorDate, -(rangeDays - 1));
  const previousToDate = shiftTrendDate(fromDate, -1);
  const previousFromDate = shiftTrendDate(previousToDate, -(rangeDays - 1));
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const calendar: TrendCalendarPoint[] = [];

  for (let date = fromDate; date <= anchorDate; date = shiftTrendDate(date, 1)) {
    const row = byDate.get(date) ?? { date, pm25: null };
    const recentValues: Array<number | null | undefined> = [];
    for (let offset = -6; offset <= 0; offset += 1) {
      recentValues.push(byDate.get(shiftTrendDate(date, offset))?.pm25);
    }
    const validRecent = recentValues.filter(isFiniteNumber);
    calendar.push({
      ...row,
      rolling7: validRecent.length === 7 ? round(mean(validRecent) ?? 0) : null,
    });
  }

  const currentRows = rows.filter((row) => row.date >= fromDate && row.date <= anchorDate);
  const previousRows = rows.filter(
    (row) => row.date >= previousFromDate && row.date <= previousToDate,
  );
  const current = buildPeriodStats(currentRows, rangeDays);
  const previous = buildPeriodStats(previousRows, rangeDays);
  const currentRawAverage = mean(currentRows.map((row) => row.pm25));
  const previousRawAverage = mean(previousRows.map((row) => row.pm25));
  const comparisonCoverageGap = Math.abs(current.coveragePercent - previous.coveragePercent);
  const comparisonReliable =
    current.coveragePercent >= 80 &&
    previous.coveragePercent >= 80 &&
    comparisonCoverageGap <= 10;
  const comparisonDelta =
    comparisonReliable && currentRawAverage != null && previousRawAverage != null
      ? round(currentRawAverage - previousRawAverage)
      : null;
  const comparisonPercent =
    comparisonDelta != null && previousRawAverage != null && previousRawAverage > 0
      ? round(((currentRawAverage! - previousRawAverage) / previousRawAverage) * 100)
      : null;

  const latest7Rows = calendar.slice(-7);
  const prior7From = shiftTrendDate(anchorDate, -13);
  const prior7To = shiftTrendDate(anchorDate, -7);
  const prior7Rows = rows.filter((row) => row.date >= prior7From && row.date <= prior7To);
  const latest7Values = latest7Rows.map((row) => row.pm25).filter(isFiniteNumber);
  const prior7Values = prior7Rows.map((row) => row.pm25).filter(isFiniteNumber);
  const latest7Average = latest7Values.length === 7 ? mean(latest7Values) : null;
  const prior7Average = prior7Values.length === 7 ? mean(prior7Values) : null;
  const momentumDelta =
    latest7Average != null && prior7Average != null
      ? round(latest7Average - prior7Average)
      : null;
  const direction =
    momentumDelta == null
      ? "unknown"
      : momentumDelta > 1
        ? "worsening"
        : momentumDelta < -1
          ? "improving"
          : "stable";

  const episodes = buildEpisodes(calendar);
  const validHours = calendar.reduce(
    (sum, point) => sum + Math.min(24, Math.max(0, point.hoursAvailable ?? 0)),
    0,
  );
  const sourceSet = new Set<string>();
  for (const row of currentRows) {
    for (const source of row.trustedSources ?? []) sourceSet.add(source);
  }
  const latestTrustedObservedAt = [...rows]
    .reverse()
    .find((row) => row.trustedObservedAt)?.trustedObservedAt ?? null;

  const yearFrom = shiftTrendDate(anchorDate, -364);
  const yearRows = rows.filter((row) => row.date >= yearFrom && row.date <= anchorDate);
  const isBurning = (row: TrendInputPoint) =>
    row.isBurningSeason ?? Number(row.date.slice(5, 7)) <= 4;
  const burningRows = yearRows.filter(isBurning);
  const nonBurningRows = yearRows.filter((row) => !isBurning(row));
  let burningExpectedDays = 0;
  let nonBurningExpectedDays = 0;
  for (let date = yearFrom; date <= anchorDate; date = shiftTrendDate(date, 1)) {
    if (Number(date.slice(5, 7)) <= 4) burningExpectedDays += 1;
    else nonBurningExpectedDays += 1;
  }

  return {
    anchorDate,
    latestDataDate,
    staleDays: latestDataDate
      ? Math.max(0, Math.floor((dateMs(anchorDate) - dateMs(latestDataDate)) / DAY_MS))
      : rangeDays,
    fromDate,
    previousFromDate,
    previousToDate,
    calendar,
    current,
    previous,
    comparisonDelta,
    comparisonPercent,
    comparisonCoverageGap,
    comparisonReliable,
    latest7Average: latest7Average == null ? null : round(latest7Average),
    latest7ObservedDays: latest7Values.length,
    prior7Average: prior7Average == null ? null : round(prior7Average),
    prior7ObservedDays: prior7Values.length,
    momentumDelta,
    direction,
    exceedanceDays: calendar.filter(
      (point) => isFiniteNumber(point.pm25) && point.pm25 > THAI_PM25_STANDARD,
    ).length,
    longestExceedanceStreak: episodes.reduce((longest, episode) => Math.max(longest, episode.days), 0),
    currentExceedanceStreak: countTrailingExceedance(calendar),
    episodes,
    hourlyCoveragePercent: rangeDays ? round((validHours / (rangeDays * 24)) * 100, 0) : 0,
    latestTrustedObservedAt,
    sources: [...sourceSet].sort(),
    months: buildMonths(rows, anchorDate),
    burning: buildPeriodStats(burningRows, burningExpectedDays),
    nonBurning: buildPeriodStats(nonBurningRows, nonBurningExpectedDays),
  };
}

export function generateTrendExecutiveSummary(
  analysis: TrendAnalysis,
  provinceName: string,
): string {
  if (!analysis.latestDataDate || !analysis.current.observedDays) {
    return `ขณะนี้ยังไม่มีข้อมูลย้อนหลังที่สมบูรณ์สำหรับจังหวัด${provinceName}`;
  }

  const rangeDays = analysis.current.expectedDays;
  const exceedCount = analysis.exceedanceDays;
  const exceedPct = Math.round((exceedCount / analysis.current.observedDays) * 100);

  let deltaText = "";
  if (
    analysis.comparisonReliable &&
    analysis.comparisonPercent != null &&
    analysis.comparisonDelta != null
  ) {
    if (analysis.comparisonDelta < 0) {
      deltaText = `แนวโน้มฝุ่นลดลง ${Math.abs(analysis.comparisonPercent)}% (${Math.abs(analysis.comparisonDelta)} µg/m³) เทียบกับช่วงก่อนหน้า`;
    } else if (analysis.comparisonDelta > 0) {
      deltaText = `แนวโน้มฝุ่นเพิ่มขึ้น +${analysis.comparisonPercent}% (+${analysis.comparisonDelta} µg/m³) เทียบกับช่วงก่อนหน้า`;
    } else {
      deltaText = `แนวโน้มฝุ่นทรงตัวใกล้เคียงกับช่วงก่อนหน้า`;
    }
  } else if (analysis.direction === "improving") {
    deltaText = "คุณภาพอากาศมีแนวโน้มดีขึ้นในช่วง 7 วันล่าสุด";
  } else if (analysis.direction === "worsening") {
    deltaText = "คุณภาพอากาศมีแนวโน้มสูงขึ้นในช่วง 7 วันล่าสุด";
  } else {
    deltaText = "คุณภาพอากาศทรงตัวอยู่ในเกณฑ์สม่ำเสมอ";
  }

  let exceedText = "";
  if (exceedCount === 0) {
    exceedText = "และไม่พบวันใดที่ฝุ่นเกินเกณฑ์มาตรฐาน (37.5 µg/m³)";
  } else {
    exceedText = `โดยมีวันที่ฝุ่นเกินเกณฑ์มาตรฐาน ${exceedCount} วัน (${exceedPct}% ของวันทั้งหมด)`;
  }

  return `ภาพรวม ${rangeDays} วันย้อนหลังใน${provinceName}: ${deltaText} ${exceedText}`;
}

