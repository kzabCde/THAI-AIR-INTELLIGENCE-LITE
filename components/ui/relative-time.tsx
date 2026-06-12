"use client";

import { useEffect, useState } from "react";
import { fmtRelativeTh } from "@/lib/format";

/**
 * Live relative timestamp ("x นาทีที่แล้ว"). Computed against the viewer's real
 * clock and re-rendered on an interval so it stays in sync instead of freezing
 * at server render time. `suppressHydrationWarning` absorbs the expected
 * server/client clock difference on first paint.
 */
export function RelativeTime({
  iso,
  className,
  intervalMs = 30_000,
}: {
  iso: string | null | undefined;
  className?: string;
  intervalMs?: number;
}) {
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <span className={className} suppressHydrationWarning>
      {fmtRelativeTh(iso)}
    </span>
  );
}
