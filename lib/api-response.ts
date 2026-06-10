import { NextResponse } from "next/server";

/** Standard success envelope with sensible CDN cache headers. */
export function ok<T>(data: T, sMaxAge = 60, swr = 300): NextResponse {
  return NextResponse.json(
    { ok: true, data, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}` } },
  );
}

export function fail(message: string, status = 500): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Wrap a route handler with uniform error handling. */
export async function handle<T>(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return fail(message, 500);
  }
}
