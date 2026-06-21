"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { getBrowserSupabase, isRealtimeConfigured } from "@/lib/supabase/client";
import { TABLE_INVALIDATIONS } from "@/lib/query/keys";
import { useUiStore } from "@/stores/ui-store";

const WATCHED_TABLES = Object.keys(TABLE_INVALIDATIONS);

/** Indochina Time offset (UTC+7, no DST) used to anchor the pipeline schedule. */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Daily data pipeline lands ~01:35 ICT; nudge a refresh just after it runs. */
const PIPELINE_HOUR_ICT = 1;
const PIPELINE_MINUTE_ICT = 35;

/** Milliseconds from now until the next 01:35 ICT occurrence. */
function msUntilNextPipelineRun(now = Date.now()): number {
  const ict = new Date(now + ICT_OFFSET_MS);
  const target = new Date(ict);
  target.setUTCHours(PIPELINE_HOUR_ICT, PIPELINE_MINUTE_ICT, 0, 0);
  if (target.getTime() <= ict.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - ict.getTime();
}

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

  // Scheduled safety net: force a full invalidation shortly after the daily
  // pipeline runs (~01:35 ICT). Guarantees fresh data even if a realtime event
  // was missed (e.g. websocket was disconnected during the write window).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const arm = () => {
      timer = setTimeout(() => {
        if (useUiStore.getState().autoRefresh) {
          queryClient.invalidateQueries();
          router.refresh();
        }
        arm(); // re-arm for the following day
      }, msUntilNextPipelineRun());
    };

    arm();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [queryClient, router]);

  return <>{children}</>;
}
