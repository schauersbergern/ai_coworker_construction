"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Pollt den Server-Component-Status nach (router.refresh im Intervall), solange das Assessment
 * läuft. Wird nur gerendert, wenn der Status pending/running ist — sobald er terminal wird,
 * rendert die Detailseite den Poller nicht mehr, der useEffect-Cleanup stoppt das Intervall.
 */
export function StatusPoller({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
