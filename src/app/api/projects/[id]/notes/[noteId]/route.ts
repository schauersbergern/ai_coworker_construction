import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getNoteForOrg, setTranscript } from "@/server/notes/notes.service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await requireSession();
  const { id, noteId } = await params;
  const note = await getNoteForOrg(session.orgId, noteId);
  if (!note || note.projectId !== id) return new NextResponse("Not found", { status: 404 });

  const body = await req.json().catch(() => ({}));
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const updated = await setTranscript(noteId, transcript);
  return NextResponse.json({ id: updated.id, transcriptStatus: updated.transcriptStatus });
}
