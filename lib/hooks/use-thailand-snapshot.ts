"use client";

import useSWR from "swr";
import type { ProvinceSnapshot } from "@/types/air";

const fetcher = async (url: string): Promise<{ updatedAt: string; data: ProvinceSnapshot[] }> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("โหลดข้อมูลไม่สำเร็จ");
  }
  return res.json();
};

export function useThailandSnapshot() {
  return useSWR("/api/air", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    dedupingInterval: 20_000,
  });
}
