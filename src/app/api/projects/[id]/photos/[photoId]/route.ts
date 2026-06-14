import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable } from "@/coworkers";
import { getPhotoForOrg, deletePhoto } from "@/server/photos/photos.service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const session = await requireSession();
  const { id, photoId } = await params;
  if (!(await isAvailable(session.orgId, "franz"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const photo = await getPhotoForOrg(session.orgId, photoId);
  if (!photo || photo.projectId !== id) return new NextResponse("Not found", { status: 404 });

  await deletePhoto(session.orgId, photoId);
  return new NextResponse(null, { status: 204 });
}
