"use client";

import { useEffect, useState } from "react";

const TH = "th-TH";

/**
 * Live wall-clock that ticks every second against the viewer's real clock
 * (e.g. "14:32:05"). Renders a stable placeholder on the server so hydration
 * stays clean, then starts ticking once mounted in the browser.
 */
export function LiveClock({
  className,
  withSeconds = true,
  withDate = false,
}: {
  className?: string;
  withSeconds?: boolean;
  withDate?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString(TH, {
        hour: "2-digit",
        minute: "2-digit",
        ...(withSeconds ? { second: "2-digit" } : {}),
      })
    : withSeconds
      ? "--:--:--"
      : "--:--";

  const date = now && withDate ? now.toLocaleDateString(TH, { day: "numeric", month: "short" }) : null;

  return (
    <span className={className} suppressHydrationWarning>
      {date ? `${date} ` : ""}
      {time}
    </span>
  );
}
