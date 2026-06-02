import { prisma } from "@/server/db";
export { setTranscript, setTranscriptStatus } from "./notes.service";
export function getNoteForOrgless(noteId: string) {
  return prisma.note.findUnique({ where: { id: noteId } });
}
