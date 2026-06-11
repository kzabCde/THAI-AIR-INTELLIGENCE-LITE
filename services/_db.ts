import "server-only";

import { unstable_cache } from "next/cache";
import { getServiceSupabase, isSupabaseConfigured, resetClients } from "@/lib/supabase/server";

export { getSupabase, getServiceSupabase, isSupabaseConfigured } from "@/lib/supabase/server";

/** Thrown when Supabase blocks the request due to Network Restrictions. */
export class NetworkRestrictedError extends Error {
  constructor() {
    super("Host not in allowlist — Supabase Network Restrictions are blocking this server.");
    this.name = "NetworkRestrictedError";
  }
}

/** Returns true if the error is a Supabase host/network allowlist rejection. */
export function isNetworkRestrictedError(err: unknown): boolean {
  if (err instanceof NetworkRestrictedError) return true;
  if (err instanceof Error && err.message.includes("Host not in allowlist")) return true;
  if (typeof err === "object" && err !== null) {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.includes("Host not in allowlist")) return true;
  }
  return false;
}

/**
 * Retry a transient DB/network failure up to `maxAttempts` times with linear
 * backoff. On the first failure the singleton client is reset so the next
 * attempt gets a fresh connection (handles stale/dead socket edge cases).
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Network restriction errors are permanent — no point retrying.
      if (isNetworkRestrictedError(err)) throw new NetworkRestrictedError();
      // Reset the singleton so the next attempt opens a new connection.
      resetClients();
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Wrap a server-side query in Next's data cache. Keeps the database from being
 * hit on every render while still revalidating on a sensible interval.
 * Retries transient failures up to 3 times before propagating the error.
 */
export function cachedQuery<T>(
  keyParts: string[],
  fn: () => Promise<T>,
  revalidate = 300,
): () => Promise<T> {
  return unstable_cache(
    () => withRetry(fn),
    ["isan", ...keyParts],
    { revalidate, tags: ["isan-data"] },
  );
}

/**
 * Like {@link cachedQuery} but for queries that resolve to a `Map`. Next's data
 * cache JSON-serializes cached values, and a `Map` does not survive that round
 * trip (`JSON.stringify(new Map())` is `"{}"`), so a cache hit would otherwise
 * return a plain object with no `.get` method. We cache the entries array — which
 * is serializable — and rebuild the `Map` on every read.
 */
export function cachedMapQuery<K, V>(
  keyParts: string[],
  fn: () => Promise<Map<K, V>>,
  revalidate = 300,
): () => Promise<Map<K, V>> {
  const cached = unstable_cache(
    async () => [...(await withRetry(fn)).entries()],
    ["isan", ...keyParts],
    { revalidate, tags: ["isan-data"] },
  );
  return async () => new Map(await cached());
}

/** Resolve the most recent hourly timestamp present in the dataset.
 *  Uses service-role because air_quality_hourly is an internal table (RLS USING(false) for anon). */
export const getLatestObservedAt = cachedQuery(
  ["latest-observed-at"],
  async (): Promise<string | null> => {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await getServiceSupabase()
      .from("air_quality_hourly")
      .select("observed_at")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.observed_at ?? null;
  },
  120,
);

export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function dateDaysAgo(days: number, from: Date = new Date()): string {
  return isoDaysAgo(days, from).slice(0, 10);
}
