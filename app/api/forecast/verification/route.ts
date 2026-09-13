import type { NextRequest } from 'next/server';
import { fail, handle, ok } from '@/lib/api-response';
import { isValidProvinceId } from '@/lib/isan';
import { parseVerificationFilters } from '@/lib/forecast-verification';
import { isServiceSupabaseConfigured } from '@/services/_db';
import { getForecastVerification } from '@/services/forecast-verification.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const province = params.get('province') ?? 'TH-40';
  const filters = parseVerificationFilters(params);
  if (!isValidProvinceId(province) || !filters) return fail('Invalid province, days or horizon', 400);
  if (!isServiceSupabaseConfigured) return fail('ยังไม่พร้อมให้บริการผลประเมินย้อนหลัง', 503);
  return handle(async () => {
    const response = ok(await getForecastVerification(province, filters.days, filters.horizon));
    // A manual refresh must see updated evaluations (or a real error), not a
    // browser stale-while-revalidate response. React Query still deduplicates.
    response.headers.set('Cache-Control', 'no-store');
    return response;
  });
}
