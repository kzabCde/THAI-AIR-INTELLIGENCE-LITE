"use client";

import { useEffect } from "react";
import { useUiStore, type PageKey } from "@/stores/ui-store";

/**
 * Hook for per-page province memory.
 * Each page remembers its own last-selected province independently.
 *
 * @param page - Which page is using this hook (home | map | forecast | trends)
 * @param initialProvinceId - SSR-provided default province
 *
 * Returns: { activeProvinceId, setActiveProvince }
 */
export function useProvincePersistence(
  page: PageKey,
  initialProvinceId: string,
) {
  const rememberedId = useUiStore((s) => s.provinceByPage[page]);
  const setPageProvince = useUiStore((s) => s.setPageProvince);

  // Use remembered province if available, otherwise use SSR default
  const activeProvinceId = rememberedId ?? initialProvinceId;

  // Sync initial province to store on mount if store is empty for this page
  useEffect(() => {
    if (!rememberedId && initialProvinceId) {
      setPageProvince(page, initialProvinceId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveProvince = (id: string) => {
    setPageProvince(page, id);
  };

  return { activeProvinceId, setActiveProvince };
}
