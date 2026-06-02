"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExportButton({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function exportNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reports`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export fehlgeschlagen");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={exportNow} disabled={busy} className="self-start bg-cobalt text-white rounded p-2 disabled:opacity-50">
        {busy ? "Wird erstellt…" : "📄 Dokumentation exportieren"}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
