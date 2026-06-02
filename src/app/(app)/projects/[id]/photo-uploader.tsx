"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PhotoUploader({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("photo", file);
        fd.append("clientCapturedAt", new Date(file.lastModified).toISOString());
        const res = await fetch(`/api/projects/${projectId}/photos`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload fehlgeschlagen");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="file" accept="image/*" capture="environment" multiple onChange={onChange} disabled={busy} />
      {busy && <span className="text-gray-500 text-sm">lädt…</span>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
