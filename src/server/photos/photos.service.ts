import { prisma } from "@/server/db";
import { storage } from "@/server/storage";
import { logError } from "@/server/log";

export type CreatePhotoInput = {
  fileKey: string;
  clientCapturedAt: Date;
  exifTakenAt: Date | null;
};

export function createPhoto(projectId: string, input: CreatePhotoInput) {
  return prisma.photo.create({
    data: {
      projectId,
      fileUrl: input.fileKey,
      clientCapturedAt: input.clientCapturedAt,
      exifTakenAt: input.exifTakenAt ?? undefined,
    },
  });
}

export function listPhotos(orgId: string, projectId: string) {
  return prisma.photo.findMany({
    where: { projectId, project: { orgId } },
    orderBy: [{ exifTakenAt: "asc" }, { uploadedAt: "asc" }],
  });
}

export function getPhotoForOrg(orgId: string, photoId: string) {
  return prisma.photo.findFirst({ where: { id: photoId, project: { orgId } } });
}

/**
 * Löscht das Foto vollständig: zuerst die Bilddatei (best-effort — ein Fehler
 * hier darf das Löschen des DB-Eintrags nicht blockieren), dann den DB-Eintrag.
 */
export async function deletePhoto(photoId: string): Promise<void> {
  const photo = await prisma.photo.findUnique({ where: { id: photoId }, select: { fileUrl: true } });
  if (!photo) return;
  try {
    await storage.delete(photo.fileUrl);
  } catch (err) {
    logError("photos", "file delete failed", err, { photoId });
  }
  await prisma.photo.delete({ where: { id: photoId } });
}
