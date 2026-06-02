import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createPhoto, listPhotos, getPhotoForOrg, deletePhoto } from "./photos.service";

async function makeProject() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return { org, project };
}

describe("photos.service", () => {
  beforeEach(async () => {
    await prisma.photo.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a photo and lists it org-scoped", async () => {
    const { org, project } = await makeProject();
    const photo = await createPhoto(project.id, {
      fileKey: "projects/p/photos/x.jpg",
      clientCapturedAt: new Date("2026-06-01T09:40:00Z"),
      exifTakenAt: null,
    });
    expect(photo.id).toBeTruthy();
    const list = await listPhotos(org.id, project.id);
    expect(list.map((p) => p.id)).toContain(photo.id);
  });

  it("does not list photos from another org", async () => {
    const a = await makeProject();
    const b = await makeProject();
    await createPhoto(a.project.id, { fileKey: "k", clientCapturedAt: new Date(), exifTakenAt: null });
    expect(await listPhotos(b.org.id, a.project.id)).toHaveLength(0);
  });

  it("getPhotoForOrg enforces org scoping", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const photo = await createPhoto(a.project.id, { fileKey: "k", clientCapturedAt: new Date(), exifTakenAt: null });
    expect(await getPhotoForOrg(b.org.id, photo.id)).toBeNull();
    expect((await getPhotoForOrg(a.org.id, photo.id))?.id).toBe(photo.id);
  });

  it("deletePhoto removes the row; deleting a missing photo is a no-op", async () => {
    const { org, project } = await makeProject();
    const photo = await createPhoto(project.id, { fileKey: "k", clientCapturedAt: new Date(), exifTakenAt: null });
    await deletePhoto(photo.id);
    expect(await listPhotos(org.id, project.id)).toHaveLength(0);
    await expect(deletePhoto(photo.id)).resolves.toBeUndefined();
  });
});
