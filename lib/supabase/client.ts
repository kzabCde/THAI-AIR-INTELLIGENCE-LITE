"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isRealtimeConfigured = Boolean(
  URL &&
    ANON &&
    !URL.includes("replace-with-") &&
    !URL.includes("example.supabase.co") &&
    !URL.includes("example.com") &&
    !ANON.includes("replace-with-") &&
    !ANON.startsWith("test-") &&
    !ANON.startsWith("example-") &&
    !ANON.startsWith("sb_secret_"),
);

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Singleton browser Supabase client used only for Realtime subscriptions.
 * Read queries go through server-side /api routes (keeps query logic on the
 * server); the public anon key here is safe to expose.
 */
export function getBrowserSupabase(): SupabaseClient<Database> | null {
  if (!isRealtimeConfigured) return null;
  if (!browserClient) {
    browserClient = createClient<Database>(URL!, ANON!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 2 } },
    });
  }
  return browserClient;
}
