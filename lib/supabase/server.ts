import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type IsanDatabase = Database;
export type IsanClient = SupabaseClient<Database>;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Server-side: use the JWT anon key (no host allowlist restriction).
// The publishable key (sb_publishable_...) is restricted to browser origins only
// and will return "Host not in allowlist" when called from the server.
// Priority: SUPABASE_ANON_KEY (server-only JWT) → NEXT_PUBLIC_SUPABASE_ANON_KEY → publishable key
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Whether the app has been configured with Supabase credentials. Services use
 * this to fail gracefully (empty/typed results) instead of throwing when the
 * environment is not wired up yet.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let readClient: IsanClient | null = null;
let writeClient: IsanClient | null = null;

// Abort any Supabase HTTP call that takes longer than 8 seconds so a slow or
// sleeping project doesn't hang a Next.js server render until Vercel kills it.
const FETCH_TIMEOUT_MS = 8_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

/** Reset cached singletons so the next call gets a fresh connection. */
export function resetClients(): void {
  readClient = null;
  writeClient = null;
}

/** Read-only client (publishable/anon key). Used by all dashboard queries. */
export function getSupabase(): IsanClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  if (!readClient) {
    readClient = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { fetch: fetchWithTimeout },
    });
  }
  return readClient;
}

/**
 * Privileged client for cron/write jobs. Falls back to the anon client when no
 * service-role key is present (works while RLS is disabled).
 */
export function getServiceSupabase(): IsanClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }
  if (!writeClient) {
    writeClient = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY || SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { fetch: fetchWithTimeout },
    });
  }
  return writeClient;
}
