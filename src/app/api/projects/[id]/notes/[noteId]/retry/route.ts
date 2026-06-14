import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable } from "@/coworkers";
import { claimNoteForRetry, getNoteForOrg, setTranscriptStatus } from "@/coworkers/franz/server/notes/notes.service";
import { inngest } from "@/inngest/client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await requireSession();
  if (!(await isAvailable(session.orgId, "franz"))) return new NextResponse("Not found", { status: 404 });
  const { id, noteId } = await params;
  const note = await getNoteForOrg(session.orgId, noteId);
  if (!note || note.projectId !== id) return new NextResponse("Not found", { status: 404 });

  // Übergang atomar beanspruchen: nur fehlgeschlagene/abgebrochene Transkriptionen dürfen
  // erneut versucht werden, und nur EIN paralleler Request gewinnt failed/cancelled → pending.
  // Sonst könnte ein direkter (oder doppelter) Request ein fertiges Transkript verwerfen oder
  // parallele Jobs starten. Status erst NACH gewonnenem Claim enqueuen.
  if (!(await claimNoteForRetry(session.orgId, noteId))) {
    return NextResponse.json(
      { error: "Nur fehlgeschlagene oder abgebrochene Transkriptionen können erneut versucht werden.", status: note.transcriptStatus },
      { status: 409 },
    );
  }

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
