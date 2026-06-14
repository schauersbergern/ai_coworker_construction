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
 * Beansprucht eine Notiz atomar für einen erneuten Versuch: setzt sie nur dann auf
 * `pending`, wenn sie aktuell `failed`/`cancelled` ist (und org-scoped). Liefert true,
 * wenn dieser Aufruf den Übergang gewonnen hat. Verhindert per bedingtem updateMany
 * ein TOCTOU-Race zwischen lesen und schreiben: bei zwei parallelen Retries gewinnt
 * genau einer (count === 1), der zweite sieht `pending` (nicht mehr in der Menge) → false.
 */
export async function claimNoteForRetry(orgId: string, noteId: string): Promise<boolean> {
  const res = await prisma.note.updateMany({
    where: { id: noteId, project: { orgId }, transcriptStatus: { in: ["failed", "cancelled"] } },
    data: { transcriptStatus: "pending" },
  });
  return res.count === 1;
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
  // deleteMany statt delete: idempotent bei parallelen Deletes (kein P2025, wenn
  // ein anderer Request die Zeile bereits entfernt hat) und org-scoped.
  await prisma.note.deleteMany({ where: { id: noteId, project: { orgId } } });
}
