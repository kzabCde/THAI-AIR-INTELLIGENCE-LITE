"use client";

import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";

/**
 * Hook that reads the last selected province from localStorage-backed Zustand store.
 * Returns: { rememberedProvinceId, rememberProvince }
 *
 * - `rememberedProvinceId`: The province ID saved in localStorage, or null if none.
 * - `rememberProvince(id)`: Save a new province ID to localStorage and Zustand store.
 */
export function useProvinceMemory() {
  const selectedProvinceId = useUiStore((s) => s.selectedProvinceId);
  const setSelectedProvince = useUiStore((s) => s.setSelectedProvince);

  return {
    rememberedProvinceId: selectedProvinceId,
    rememberProvince: setSelectedProvince,
  };
}

/**
 * Hook for pages that receive `initialProvinceId` from SSR.
 * On mount, if there's a remembered province in localStorage, uses it instead.
 * When user selects a province, saves it.
 *
 * Returns: { activeProvinceId, setActiveProvince }
 */
export function useProvincePersistence(
  initialProvinceId: string,
  onProvinceChange?: (id: string) => void,
) {
  const { rememberedProvinceId, rememberProvince } = useProvinceMemory();

  // On first render, if we have a remembered province, use it
  const activeProvinceId = rememberedProvinceId ?? initialProvinceId;

  // Sync initial province to store on mount if store is empty
  useEffect(() => {
    if (!rememberedProvinceId && initialProvinceId) {
      rememberProvince(initialProvinceId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveProvince = (id: string) => {
    rememberProvince(id);
    onProvinceChange?.(id);
  };

  return { activeProvinceId, setActiveProvince };
}
