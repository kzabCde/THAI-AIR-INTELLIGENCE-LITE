"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUiStore } from "@/stores/ui-store";

/**
 * Client component that auto-redirects to the remembered province
 * if the current URL has no `?province=` search param.
 *
 * Place this inside a page layout. It renders nothing visible.
 */
export function ProvinceRedirect({ paramName = "province" }: { paramName?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rememberedId = useUiStore((s) => s.selectedProvinceId);

  useEffect(() => {
    // Only redirect if:
    // 1. No province param in URL
    // 2. We have a remembered province
    // 3. The remembered province is different from default "TH-40"
    const current = searchParams.get(paramName);
    if (!current && rememberedId && rememberedId !== "TH-40") {
      const params = new URLSearchParams(searchParams.toString());
      params.set(paramName, rememberedId);
      router.replace(`?${params.toString()}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
