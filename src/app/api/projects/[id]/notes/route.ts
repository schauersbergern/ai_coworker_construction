import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { createNote, setTranscriptStatus } from "@/server/notes/notes.service";
import { storage } from "@/server/storage";
import { inngest } from "@/inngest/client";

const ALLOWED = new Map<string, string>([
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
]);
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id: projectId } = await params;
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  const form = await req.formData();
  const file = form.get("audio");
  const recordedAtRaw = form.get("recordedAt");
  if (!(file instanceof File)) return NextResponse.json({ error: "audio fehlt" }, { status: 400 });

  // MediaRecorder liefert z. B. "audio/webm;codecs=opus" — Codec-Suffix für den
  // Typ-Abgleich abschneiden.
  const mimeType = file.type.split(";")[0].trim().toLowerCase();
  const ext = ALLOWED.get(mimeType);
  if (!ext) return NextResponse.json({ error: `Audiotyp ${file.type} nicht unterstützt` }, { status: 400 });

  // Größenlimit VOR dem Puffern in den Speicher prüfen.
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio zu groß (max. 25 MB)" }, { status: 413 });
  }

  const recordedAt = recordedAtRaw ? new Date(String(recordedAtRaw)) : new Date();
  if (Number.isNaN(recordedAt.getTime())) {
    return NextResponse.json({ error: "recordedAt ungültig" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `projects/${projectId}/notes/${crypto.randomUUID()}.${ext}`;
  await storage.put(key, buffer, file.type);
  const note = await createNote(projectId, { audioKey: key, recordedAt });

  // Schlägt das Enqueuen fehl, bliebe die Notiz sonst dauerhaft "pending" ohne
  // Wiederherstellung (die UI bietet Retry nur für "failed"). Daher: auf "failed"
  // setzen, damit sie über den bestehenden Retry-Pfad wiederanstoßbar ist.
  try {
    await inngest.send({ name: "note/created", data: { noteId: note.id } });
  } catch {
    const failed = await setTranscriptStatus(note.id, "failed");
    return NextResponse.json(
      { id: failed.id, transcriptStatus: failed.transcriptStatus, error: "Transkription konnte nicht gestartet werden" },
      { status: 502 },
    );
  }
  return NextResponse.json({ id: note.id, transcriptStatus: note.transcriptStatus });
}
