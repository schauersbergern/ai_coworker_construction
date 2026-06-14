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
 * Löscht das Foto vollständig. Org-scoped: die Tenant-Grenze wird hier im
 * Service erzwungen (Defense-in-Depth), nicht nur in der Route. Zuerst die
 * Bilddatei (best-effort — ein Fehler hier darf das Löschen des DB-Eintrags
 * nicht blockieren), dann der Eintrag.
 */
export async function deletePhoto(orgId: string, photoId: string): Promise<void> {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, project: { orgId } },
    select: { fileUrl: true },
  });
  if (!photo) return;
  try {
    await storage.delete(photo.fileUrl);
  } catch (err) {
    logError("photos", "file delete failed", err, { photoId });
  }
  // deleteMany statt delete: idempotent bei parallelen Deletes (kein P2025, wenn
  // ein anderer Request die Zeile bereits entfernt hat) und org-scoped.
  await prisma.photo.deleteMany({ where: { id: photoId, project: { orgId } } });
}
