"use client";

import { useEffect, useState } from "react";
import { fmtRelativeTh } from "@/lib/format";

/**
 * Live relative timestamp ("x นาทีที่แล้ว"). Re-syncs to the viewer's real clock
 * immediately on mount and then re-renders on an interval, so it tracks elapsed
 * time instead of freezing at server render time. The server paints the initial
 * value and `suppressHydrationWarning` absorbs the expected clock difference.
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
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Recompute right away (no 30s wait after hydration), then keep ticking.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <span className={className} suppressHydrationWarning>
      {fmtRelativeTh(iso, now ?? undefined)}
    </span>
  );
}
