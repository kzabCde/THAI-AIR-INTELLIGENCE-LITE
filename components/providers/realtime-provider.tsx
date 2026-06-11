"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { getBrowserSupabase, isRealtimeConfigured } from "@/lib/supabase/client";
import { TABLE_INVALIDATIONS } from "@/lib/query/keys";
import { useUiStore } from "@/stores/ui-store";

const WATCHED_TABLES = Object.keys(TABLE_INVALIDATIONS);

/**
 * Subscribes to Supabase Realtime postgres_changes for every data table and,
 * on change, invalidates the matching React Query caches and refreshes the
 * server-rendered (ISR) tree. This is what replaces Vercel Cron: the frontend
 * reacts to externally-written DB updates instead of a polling schedule.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const setStatus = useUiStore((s) => s.setRealtimeStatus);
  const markEvent = useUiStore((s) => s.markEvent);
  const autoRefresh = useUiStore((s) => s.autoRefresh);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setStatus("disabled");
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setStatus("disabled");
      return;
    }

    setStatus("connecting");
    const channel = supabase.channel("isan-air-realtime");

    for (const table of WATCHED_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        markEvent();
        if (!useUiStore.getState().autoRefresh) return;
        for (const prefix of TABLE_INVALIDATIONS[table]) {
          queryClient.invalidateQueries({ queryKey: [prefix] });
        }
        // Debounce server-component refresh to coalesce bursty writes.
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 1500);
      });
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setStatus("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStatus("offline");
    });

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
    // autoRefresh intentionally read via getState to avoid re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, router, setStatus, markEvent]);

  useEffect(() => {
    if (!autoRefresh) return;
    // When auto-refresh is re-enabled, pull fresh data immediately.
    queryClient.invalidateQueries();
  }, [autoRefresh, queryClient]);

  return <>{children}</>;
}
