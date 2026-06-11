import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type IsanDatabase = Database;
export type IsanClient = SupabaseClient<Database>;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer the modern publishable key; fall back to the legacy anon key name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Whether the app has been configured with Supabase credentials. Services use
 * this to fail gracefully (empty/typed results) instead of throwing when the
 * environment is not wired up yet.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let readClient: IsanClient | null = null;
let writeClient: IsanClient | null = null;

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
    });
  }
  return writeClient;
}
