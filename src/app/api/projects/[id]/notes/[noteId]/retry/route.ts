import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getNoteForOrg, setTranscriptStatus } from "@/server/notes/notes.service";
import { inngest } from "@/inngest/client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await requireSession();
  const { id, noteId } = await params;
  const note = await getNoteForOrg(session.orgId, noteId);
  if (!note || note.projectId !== id) return new NextResponse("Not found", { status: 404 });

  await setTranscriptStatus(noteId, "pending");
  await inngest.send({ name: "note/created", data: { noteId } });
  return NextResponse.json({ ok: true });
}
