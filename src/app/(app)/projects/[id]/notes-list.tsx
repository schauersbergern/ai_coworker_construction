"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./confirm-dialog";

export type NoteView = {
  id: string;
  transcript: string | null;
  transcriptStatus: "pending" | "done" | "failed" | "cancelled";
  recordedAt: string;
  audioKey: string;
};

export function NotesList({ projectId, notes }: { projectId: string; notes: NoteView[] }) {
  const router = useRouter();

  // Die Transkription läuft asynchron im Hintergrund (Inngest-Job). Solange noch
  // eine Notiz "pending" ist, die Server-Component periodisch neu laden, damit der
  // fertige Status (und das Transkript) ohne manuelles Neuladen erscheint.
  const hasPending = notes.some((n) => n.transcriptStatus === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [hasPending, router]);

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  async function del() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      setConfirmOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="relative border border-line rounded-xl p-3 flex flex-col gap-2 bg-paper/40">
      <div className="flex items-center gap-2 text-sm flex-wrap pr-8">
        <span className="text-muted font-mono text-xs">
          {new Date(note.recordedAt).toLocaleString("de-AT")}
        </span>
        <StatusBadge status={note.transcriptStatus} />
        <audio controls src={`/api/files/${note.audioKey}`} className="h-8 ml-auto" />
      </div>

      {/* 3-Punkte-Menü oben rechts */}
      <div className="absolute top-2 right-2">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Notiz-Menü"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="px-2 py-1 rounded-md text-muted hover:bg-line/60 leading-none"
        >
          ⋮
        </button>
        {menuOpen && (
          <>
            {/* Klick außerhalb schließt das Menü */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 min-w-32 rounded-lg border border-line bg-paper shadow-lg py-1"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
                className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-line/60"
              >
                Löschen
              </button>
            </div>
          </>
        )}
      </div>

      {note.transcriptStatus === "failed" && (
        <button onClick={retry} className="self-start text-cobalt underline text-sm">
          Transkription erneut versuchen
        </button>
      )}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        placeholder={note.transcriptStatus === "pending" ? "Transkription läuft…" : "Transkript"}
        className="field min-h-20 resize-y"
      />
      <button onClick={save} disabled={saving} className="btn btn-outline self-start">
        {saving ? "Speichern…" : "Transkript speichern"}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {confirmOpen && (
        <ConfirmDialog
          title="Notiz löschen?"
          message="Audioaufnahme und Transkript werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden."
          busy={deleting}
          onConfirm={del}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: NoteView["transcriptStatus"] }) {
  const map = {
    pending: ["bg-yellow-100 text-yellow-800", "läuft"],
    done: ["bg-green-100 text-green-800", "fertig"],
    failed: ["bg-red-100 text-red-800", "fehlgeschlagen"],
    cancelled: ["bg-gray-100 text-gray-700", "abgebrochen"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
