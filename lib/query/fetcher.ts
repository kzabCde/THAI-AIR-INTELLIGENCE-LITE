/** Shared response envelope returned by every /api route (see lib/api-response.ts). */
export type ApiEnvelope<T> = { ok: true; data: T; generatedAt: string } | { ok: false; error: string };

/** Fetch a JSON API route and unwrap the standard envelope, throwing on failure. */
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) {
    let message = `คำขอล้มเหลว (${res.status})`;
    try {
      const body = (await res.json()) as ApiEnvelope<T>;
      if (body && "error" in body && body.error) message = body.error;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message);
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) throw new Error(body.error);
  return body.data;
}
