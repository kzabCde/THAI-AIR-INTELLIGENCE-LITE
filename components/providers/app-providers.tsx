"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { RealtimeProvider } from "./realtime-provider";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { PwaManager } from "@/components/pwa/pwa-manager";

/** Single client boundary that wires React Query + Supabase Realtime + offline/PWA UX. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <RealtimeProvider>
        <OfflineBanner />
        <PwaManager />
        {children}
      </RealtimeProvider>
    </QueryProvider>
  );
}
