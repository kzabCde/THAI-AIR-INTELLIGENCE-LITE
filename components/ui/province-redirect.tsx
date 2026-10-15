"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUiStore, type PageKey } from "@/stores/ui-store";

/**
 * Client component that auto-redirects to the remembered province
 * for a specific page if the current URL has no `?province=` search param.
 *
 * Place this inside a page layout. It renders nothing visible.
 */
export function ProvinceRedirect({
  page,
  paramName = "province",
}: {
  page: PageKey;
  paramName?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rememberedId = useUiStore((s) => s.provinceByPage[page]);
  const homeRememberedId = useUiStore((s) => s.provinceByPage.home);

  useEffect(() => {
    // Only redirect if:
    // 1. No province param in URL
    // 2. We have a remembered province for this page (or fallback to home for forecast)
    // 3. The remembered province is different from default "TH-40"
    const current = searchParams.get(paramName);
    const targetId = rememberedId || (page === "forecast" ? homeRememberedId : null);

    if (!current && targetId && targetId !== "TH-40") {
      const params = new URLSearchParams(searchParams.toString());
      params.set(paramName, targetId);
      if (page === "forecast" && !params.get("tab")) {
        params.set("tab", "province");
      }
      router.replace(`?${params.toString()}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
