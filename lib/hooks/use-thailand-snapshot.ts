"use client";

import useSWR from "swr";
import type { ProvinceSnapshot } from "@/types/air";

type SnapshotPayload = { updatedAt: string; data: ProvinceSnapshot[]; fallback?: boolean };

const snapshotFetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
  return (await response.json()) as SnapshotPayload;
};

export function useThailandSnapshot(refreshInterval = 60_000) {
  const { data, error, isLoading, isValidating } = useSWR<SnapshotPayload>("/api/air", snapshotFetcher, {
    refreshInterval,
    dedupingInterval: 45_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true,
    errorRetryCount: 2,
    errorRetryInterval: 1_500,
  });

  return {
    data: data ?? null,
    error: error instanceof Error ? error.message : null,
    isLoading,
    isValidating,
  };
}
