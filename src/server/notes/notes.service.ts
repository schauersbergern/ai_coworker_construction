import { prisma } from "@/server/db";
import type { TranscriptStatus } from "@prisma/client";
import { storage } from "@/server/storage";
import { logError } from "@/server/log";

export type CreateNoteInput = { audioKey: string; recordedAt: Date };

export function createNote(projectId: string, input: CreateNoteInput) {
  return prisma.note.create({
    data: {
      projectId,
      audioUrl: input.audioKey,
      recordedAt: input.recordedAt,
      transcriptStatus: "pending",
    },
  });
}

export function listNotes(orgId: string, projectId: string) {
  return prisma.note.findMany({
    where: { projectId, project: { orgId } },
    orderBy: { recordedAt: "asc" },
  });
}

export function getNoteForOrg(orgId: string, noteId: string) {
  return prisma.note.findFirst({ where: { id: noteId, project: { orgId } } });
}

export function setTranscript(noteId: string, transcript: string) {
  return prisma.note.update({
    where: { id: noteId },
    data: { transcript, transcriptStatus: "done" },
  });
}

export function setTranscriptStatus(noteId: string, status: TranscriptStatus) {
  return prisma.note.update({ where: { id: noteId }, data: { transcriptStatus: status } });
}

/**
 * Löscht die Notiz vollständig. Org-scoped: die Tenant-Grenze wird hier im
 * Service erzwungen (Defense-in-Depth), nicht nur in der Route. Zuerst die
 * Audiodatei (best-effort — ein Fehler hier darf das Löschen des DB-Eintrags
 * nicht blockieren, sonst bleibt eine verwaiste Zeile zurück), dann der Eintrag.
 */
export async function deleteNote(orgId: string, noteId: string): Promise<void> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, project: { orgId } },
    select: { audioUrl: true },
  });
  if (!note) return;
  try {
    await storage.delete(note.audioUrl);
  } catch (err) {
    logError("notes", "audio delete failed", err, { noteId });
  }
  await prisma.note.delete({ where: { id: noteId } });
}
