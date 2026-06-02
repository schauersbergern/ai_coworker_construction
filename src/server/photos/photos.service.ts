import { prisma } from "@/server/db";

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
