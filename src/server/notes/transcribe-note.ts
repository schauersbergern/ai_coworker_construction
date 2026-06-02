import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { getNoteForOrgless, setTranscript, setTranscriptStatus } from "./notes.internal";
import type { ObjectStorage } from "@/server/storage/object-storage";
import type { Transcriber } from "@/server/transcription/transcriber";

export type TranscribeDeps = { storage: ObjectStorage; transcriber: Transcriber };

/**
 * Lädt das Audio des Notes aus dem Storage in eine temporäre Datei, transkribiert
 * es und speichert das Ergebnis. Bei Fehler wird der Status auf `failed` gesetzt
 * und der Fehler weitergeworfen (Inngest retryt dann).
 */
export async function runTranscribeNote(noteId: string, deps: TranscribeDeps) {
  const note = await getNoteForOrgless(noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);

  const ext = extname(note.audioUrl) || ".webm";
  const tmp = await mkdtemp(join(tmpdir(), "whisper-"));
  const audioPath = join(tmp, `audio${ext}`);
  try {
    const buf = await deps.storage.read(note.audioUrl);
    await writeFile(audioPath, buf);
    const text = await deps.transcriber.transcribe(audioPath);
    return await setTranscript(noteId, text);
  } catch (err) {
    await setTranscriptStatus(noteId, "failed");
    throw err;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
