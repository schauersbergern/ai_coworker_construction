import "server-only";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { listNotes } from "@/server/notes/notes.service";
import { listPhotos } from "@/server/photos/photos.service";
import { listReports } from "@/server/reports/reports.service";

export async function loadProjectDetail(projectId: string) {
  const session = await requireSession();
  const project = await getProject(session.orgId, projectId);
  if (!project) return null;
  const [notes, photos, reports] = await Promise.all([
    listNotes(session.orgId, projectId),
    listPhotos(session.orgId, projectId),
    listReports(session.orgId, projectId),
  ]);
  return { project, notes, photos, reports };
}
