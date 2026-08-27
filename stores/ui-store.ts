"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RealtimeStatus = "connecting" | "live" | "offline" | "disabled";

/** Page keys for per-page province memory */
export type PageKey = "home" | "map" | "forecast" | "trends";

type UiState = {
  /** Per-page province memory: each page remembers its own last-selected province */
  provinceByPage: Record<PageKey, string | null>;
  setPageProvince: (page: PageKey, id: string | null) => void;

  /** Whether realtime-driven refetching is enabled. */
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;

  realtimeStatus: RealtimeStatus;
  setRealtimeStatus: (s: RealtimeStatus) => void;

  /** Timestamp of the last realtime DB change applied. */
  lastEventAt: number | null;
  markEvent: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      provinceByPage: {
        home: null,
        map: null,
        forecast: null,
        trends: null,
      },
      setPageProvince: (page, id) =>
        set((s) => ({
          provinceByPage: { ...s.provinceByPage, [page]: id },
        })),

      autoRefresh: true,
      toggleAutoRefresh: () => set((s) => ({ autoRefresh: !s.autoRefresh })),

      realtimeStatus: "connecting",
      setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),

      lastEventAt: null,
      markEvent: () => set({ lastEventAt: Date.now() }),
    }),
    {
      name: "isan-air-ui",
      // Only persist per-page province selections to localStorage
      partialize: (state) => ({ provinceByPage: state.provinceByPage }),
    },
  ),
);
