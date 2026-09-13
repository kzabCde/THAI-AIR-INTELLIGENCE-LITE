/** Production verification is distinct from training scores and model confidence. */
export type VerificationRow = {
  id: number;
  target_date: string;
  forecast_at: string;
  forecast_horizon_days: number;
  predicted: number;
  model_name: string | null;
  model_run_id: string | null;
  classifier_model_name: string | null;
  classifier_run_id: string | null;
  classifier_predicted_class: number | null;
  regression_derived_class: number | null;
  displayed_class: number | null;
  classification_source: string | null;
  status: 'pending' | 'final' | 'legacy' | 'insufficient_data';
  actual: number | null;
  actual_class: number | null;
  actual_source: string | null;
  reference_kind: 'model_reference' | 'provider_reference' | 'mixed_reference' | null;
  hours_available: number | null;
  evaluated_at: string | null;
  revision: number | null;
  interval_covered: boolean | null;
};

export type VerificationReport = {
  province: string;
  days: number;
  horizon: number;
  from: string;
  to: string;
  today: string;
  timezone: string;
  minimumHours: number;
  rows: VerificationRow[];
};

export function parseVerificationFilters(params: URLSearchParams) {
  const days = params.get('days') ?? '30';
  const horizon = params.get('horizon') ?? '1';
  if (!['7', '30', '90'].includes(days) || !/^[1-7]$/.test(horizon)) return null;
  return { days: Number(days), horizon: Number(horizon) };
}

export function isFinalVerification(row: VerificationRow): boolean {
  return row.status === 'final' && row.actual !== null
    && Number.isFinite(row.actual) && Number.isFinite(row.predicted)
    && row.actual >= 0 && row.predicted >= 0
    && (row.hours_available ?? 0) >= 18;
}

function pm25Class(value: number) {
  return value <= 15 ? 1 : value <= 25 ? 2 : value <= 37.5 ? 3 : value <= 75 ? 4 : 5;
}

export function classificationMetrics(pairs: Array<[number, number]>) {
  const matrix = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
  for (const [actual, predicted] of pairs) {
    if (Number.isInteger(actual) && Number.isInteger(predicted)
      && actual >= 1 && actual <= 5 && predicted >= 1 && predicted <= 5) {
      matrix[actual - 1][predicted - 1]++;
    }
  }
  const classes = matrix.map((row, index) => {
    const support = row.reduce((a, b) => a + b, 0);
    const predicted = matrix.reduce((sum, r) => sum + r[index], 0);
    const tp = row[index];
    return {
      classId: index + 1, support,
      precision: predicted ? tp / predicted : null,
      recall: support ? tp / support : null,
      f1: support + predicted ? 2 * tp / (support + predicted) : null,
    };
  });
  const n = classes.reduce((sum, c) => sum + c.support, 0);
  const represented = classes.filter(c => c.f1 !== null);
  return { n, classes, matrix,
    accuracy: n ? matrix.reduce((sum, row, i) => sum + row[i], 0) / n : null,
    // Macro F1 over the union of observed/predicted classes; absent classes are
    // explicitly null and their missing evidence is visible in class support.
    macroF1: represented.length
      ? represented.reduce((sum, c) => sum + c.f1!, 0) / represented.length : null,
  };
}

/** One exact reference-source series only. Never pool provider and model data. */
export function summarizeVerifications(rows: VerificationRow[], source: string) {
  const scored = rows.filter(r => isFinalVerification(r) && r.actual_source === source);
  const n = scored.length;
  const errors = scored.map(r => r.predicted - r.actual!);
  const mean = (values: number[]) => values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  const classPairs: Array<[number, number]> = scored
    .filter(r => r.classification_source === 'active_classifier' && r.classifier_predicted_class !== null)
    .map(r => [pm25Class(r.actual!), r.classifier_predicted_class!]);
  const thresholdPairs: Array<[number, number]> = scored
    .map(r => [pm25Class(r.actual!), pm25Class(r.predicted)]);
  const byModel = new Map<string, VerificationRow[]>();
  const byClassifier = new Map<string, VerificationRow[]>();
  for (const row of scored) {
    const key = `${row.model_name ?? 'unknown'}|${row.model_run_id ?? 'unknown'}`;
    byModel.set(key, [...(byModel.get(key) ?? []), row]);
    if (row.classification_source === 'active_classifier' && row.classifier_predicted_class !== null) {
      const classifierKey = `${row.classifier_model_name ?? 'unknown'}|${row.classifier_run_id ?? 'unknown'}`;
      byClassifier.set(classifierKey, [...(byClassifier.get(classifierKey) ?? []), row]);
    }
  }
  return {
    n, mae: mean(errors.map(Math.abs)),
    rmse: n ? Math.sqrt(mean(errors.map(e => e * e))!) : null,
    bias: mean(errors),
    intervalCoverage: mean(scored.filter(r => r.interval_covered !== null).map(r => Number(r.interval_covered))),
    classifier: classificationMetrics(classPairs),
    threshold: classificationMetrics(thresholdPairs),
    classifierModels: [...byClassifier.values()].map(group => ({
      name: group[0].classifier_model_name ?? 'ไม่ระบุรุ่น', runId: group[0].classifier_run_id,
      ...classificationMetrics(group.map(r => [pm25Class(r.actual!), r.classifier_predicted_class!])),
    })),
    models: [...byModel.values()].map(group => ({
      name: group[0].model_name ?? 'ไม่ระบุรุ่น', runId: group[0].model_run_id,
      n: group.length, mae: mean(group.map(r => Math.abs(r.predicted - r.actual!))),
    })),
  };
}

export function referenceLabel(source: string) {
  if (source === 'open-meteo') return 'Open-Meteo / CAMS (แบบจำลอง)';
  if (source.includes(',')) return `หลายแหล่งรวมกัน (${source})`;
  return `${source} (ข้อมูลผู้ให้บริการ)`;
}
