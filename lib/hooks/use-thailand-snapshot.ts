"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProvinceSnapshot } from "@/types/air";

type SnapshotPayload = { updatedAt: string; data: ProvinceSnapshot[] };

type SnapshotState = {
  data: SnapshotPayload | null;
  isLoading: boolean;
  error: string | null;
};

const DEFAULT_INTERVAL = 60_000;
const MAX_RETRY = 2;

export function useThailandSnapshot() {
  const [state, setState] = useState<SnapshotState>({ data: null, isLoading: true, error: null });
  const retries = useRef(0);

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/api/air", { cache: "no-store" });
      if (!response.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      const payload = (await response.json()) as SnapshotPayload;
      setState({ data: payload, isLoading: false, error: null });
      retries.current = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
      setState((prev) => ({ ...prev, isLoading: false, error: message }));

      if (retries.current < MAX_RETRY) {
        retries.current += 1;
        window.setTimeout(fetchSnapshot, 1_500 * retries.current);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (mounted) {
      void fetchSnapshot();
    }

    const timer = window.setInterval(() => {
      void fetchSnapshot();
    }, DEFAULT_INTERVAL);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [fetchSnapshot]);

  return state;
}
