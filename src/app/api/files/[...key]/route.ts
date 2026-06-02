import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { storage } from "@/server/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await requireSession();
  const { key: segments } = await params;
  const key = segments.join("/");

  // Erwartetes Schema: projects/<projectId>/...
  if (segments[0] !== "projects" || segments.length < 3) {
    return new NextResponse("Not found", { status: 404 });
  }
  const projectId = segments[1];
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  if (!(await storage.exists(key))) return new NextResponse("Not found", { status: 404 });

  const data = await storage.read(key);
  const contentType = await storage.contentType(key);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      // Nutzergenerierte Inhalte niemals als aktiven Content ausführen, selbst
      // wenn der Content-Type manipulierbar wäre.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
