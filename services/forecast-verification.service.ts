import 'server-only';
import { getServiceSupabase } from './_db';
import type { VerificationReport } from '@/lib/forecast-verification';

export async function getForecastVerification(province: string, days: number, horizon: number) {
  const { data, error } = await getServiceSupabase().rpc('fn_get_forecast_verification', {
    p_province: province, p_days: days, p_horizon: horizon,
  });
  if (error) throw error;
  // The RPC owns the typed JSON contract and returns at most 98 calendar rows.
  return data as unknown as VerificationReport;
}
