import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable } from "@/coworkers";
import { getNoteForOrg, setTranscriptStatus } from "@/coworkers/franz/server/notes/notes.service";
import { inngest } from "@/inngest/client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await requireSession();
  if (!(await isAvailable(session.orgId, "franz"))) return new NextResponse("Not found", { status: 404 });
  const { id, noteId } = await params;
  const note = await getNoteForOrg(session.orgId, noteId);
  if (!note || note.projectId !== id) return new NextResponse("Not found", { status: 404 });

  // Nur fehlgeschlagene/abgebrochene Transkriptionen dürfen erneut versucht werden. Sonst
  // könnte ein direkter Request ein fertiges ("done") Transkript verwerfen oder einen
  // parallelen Job für eine bereits laufende ("pending") Notiz starten.
  if (note.transcriptStatus !== "failed" && note.transcriptStatus !== "cancelled") {
    return NextResponse.json(
      { error: "Nur fehlgeschlagene oder abgebrochene Transkriptionen können erneut versucht werden.", status: note.transcriptStatus },
      { status: 409 },
    );
  }

  await setTranscriptStatus(noteId, "pending");
  // Wie im Upload: schlägt das Enqueuen fehl, bliebe die Note "pending" und die UI
  // würde den Retry-Button ausblenden. Daher zurück auf "failed" setzen.
  try {
    await inngest.send({ name: "note/created", data: { noteId } });
  } catch {
    const failed = await setTranscriptStatus(noteId, "failed");
    return NextResponse.json(
      { ok: false, transcriptStatus: failed.transcriptStatus, error: "Transkription konnte nicht gestartet werden" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
