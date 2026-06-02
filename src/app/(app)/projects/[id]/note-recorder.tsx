"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Safari/iOS unterstützt kein audio/webm. Den ersten unterstützten Typ wählen;
// leerer String → der Browser wählt selbst einen Default.
const MIME_CANDIDATES = ["audio/webm", "audio/mp4", "audio/ogg"];
function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export function NoteRecorder({ projectId }: { projectId: string }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const router = useRouter();

  async function start() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickSupportedMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () =>
      upload(new Blob(chunksRef.current, { type: rec.mimeType || mimeType || "audio/webm" }));
    rec.start();
    mediaRef.current = rec;
    setRecording(true);
  }

  function stop() {
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      // Dateiname egal — die Route liest file.type (= blob.type, durch FormData erhalten).
      fd.append("audio", blob, "note");
      fd.append("recordedAt", new Date().toISOString());
      const res = await fetch(`/api/projects/${projectId}/notes`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload fehlgeschlagen");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {!recording ? (
          <button onClick={start} disabled={busy} className="bg-cobalt text-white rounded p-2 disabled:opacity-50">
            🎤 Notiz aufnehmen
          </button>
        ) : (
          <button onClick={stop} className="bg-red-600 text-white rounded p-2">■ Stopp</button>
        )}
        {busy && <span className="text-gray-500 self-center">lädt…</span>}
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
