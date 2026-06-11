"use client";

import { create } from "zustand";

export type RealtimeStatus = "connecting" | "live" | "offline" | "disabled";

type UiState = {
  /** Province currently focused across selectors (id like "TH-30"). */
  selectedProvinceId: string | null;
  setSelectedProvince: (id: string | null) => void;

  /** Whether realtime-driven refetching is enabled. */
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;

  realtimeStatus: RealtimeStatus;
  setRealtimeStatus: (s: RealtimeStatus) => void;

  /** Timestamp of the last realtime DB change applied. */
  lastEventAt: number | null;
  markEvent: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedProvinceId: null,
  setSelectedProvince: (id) => set({ selectedProvinceId: id }),

  autoRefresh: true,
  toggleAutoRefresh: () => set((s) => ({ autoRefresh: !s.autoRefresh })),

  realtimeStatus: "connecting",
  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),

  lastEventAt: null,
  markEvent: () => set({ lastEventAt: Date.now() }),
}));
