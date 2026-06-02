"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type NoteView = {
  id: string;
  transcript: string | null;
  transcriptStatus: "pending" | "done" | "failed";
  recordedAt: string;
  audioKey: string;
};

export function NotesList({ projectId, notes }: { projectId: string; notes: NoteView[] }) {
  if (notes.length === 0) return <p className="text-gray-500">Noch keine Notizen.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((n) => (
        <NoteRow key={n.id} projectId={projectId} note={n} />
      ))}
    </ul>
  );
}

function NoteRow({ projectId, note }: { projectId: string; note: NoteView }) {
  const [text, setText] = useState(note.transcript ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Eingehende Transkripte (z. B. nach Abschluss des Hintergrund-Jobs + router.refresh())
  // übernehmen – aber nur, wenn keine ungespeicherten lokalen Edits vorliegen.
  // React-empfohlenes Muster: State während des Renders anpassen (kein useEffect),
  // ausgelöst durch den Wechsel des transcript-Props.
  const [prevTranscript, setPrevTranscript] = useState(note.transcript);
  if (note.transcript !== prevTranscript) {
    setPrevTranscript(note.transcript);
    if (!dirty) setText(note.transcript ?? "");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      setDirty(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function retry() {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes/${note.id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Erneuter Versuch fehlgeschlagen");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erneuter Versuch fehlgeschlagen");
    }
  }

  return (
    <li className="border rounded p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">{new Date(note.recordedAt).toLocaleString("de-AT")}</span>
        <StatusBadge status={note.transcriptStatus} />
        <audio controls src={`/api/files/${note.audioKey}`} className="h-8" />
      </div>
      {note.transcriptStatus === "failed" && (
        <button onClick={retry} className="self-start text-cobalt underline text-sm">Transkription erneut versuchen</button>
      )}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        placeholder={note.transcriptStatus === "pending" ? "Transkription läuft…" : "Transkript"}
        className="border rounded p-2 min-h-20"
      />
      <button onClick={save} disabled={saving} className="self-start bg-cobalt text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {saving ? "Speichern…" : "Transkript speichern"}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </li>
  );
}

function StatusBadge({ status }: { status: NoteView["transcriptStatus"] }) {
  const map = {
    pending: ["bg-yellow-100 text-yellow-800", "läuft"],
    done: ["bg-green-100 text-green-800", "fertig"],
    failed: ["bg-red-100 text-red-800", "fehlgeschlagen"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
