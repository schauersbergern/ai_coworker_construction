import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable } from "@/coworkers";
import { getProject } from "@/server/projects/projects.service";
import { createPhoto } from "@/coworkers/franz/server/photos/photos.service";
import { extractTakenAt } from "@/coworkers/franz/server/photos/exif";
import { storage } from "@/server/storage";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/heic", "heic"],
  ["image/webp", "webp"],
]);
const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id: projectId } = await params;
  if (!(await isAvailable(session.orgId, "franz"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  const form = await req.formData();
  const file = form.get("photo");
  const capturedRaw = form.get("clientCapturedAt");
  if (!(file instanceof File)) return NextResponse.json({ error: "photo fehlt" }, { status: 400 });

  const ext = ALLOWED.get(file.type);
  if (!ext) return NextResponse.json({ error: `Bildtyp ${file.type} nicht unterstützt` }, { status: 400 });

  // Größenlimit VOR dem Puffern in den Speicher prüfen.
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Foto zu groß (max. 15 MB)" }, { status: 413 });
  }

  const clientCapturedAt = capturedRaw ? new Date(String(capturedRaw)) : new Date();
  if (Number.isNaN(clientCapturedAt.getTime())) {
    return NextResponse.json({ error: "clientCapturedAt ungültig" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const exifTakenAt = await extractTakenAt(buffer);
  const key = `projects/${projectId}/photos/${crypto.randomUUID()}.${ext}`;
  await storage.put(key, buffer, file.type);
  const photo = await createPhoto(projectId, { fileKey: key, clientCapturedAt, exifTakenAt });

  return NextResponse.json({ id: photo.id, fileKey: key });
}
