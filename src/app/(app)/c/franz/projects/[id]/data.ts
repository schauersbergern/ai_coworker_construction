import "server-only";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { listNotes } from "@/coworkers/franz/server/notes/notes.service";
import { listPhotos } from "@/coworkers/franz/server/photos/photos.service";
import { listReports } from "@/coworkers/franz/server/reports/reports.service";
import { getResolvedCoworker } from "@/coworkers";
import { franzDefaultConfig, type FranzConfig } from "@/coworkers/franz/config";

export async function loadProjectDetail(projectId: string) {
  const session = await requireSession();
  const project = await getProject(session.orgId, projectId);
  if (!project) return null;
  const [notes, photos, reports] = await Promise.all([
    listNotes(session.orgId, projectId),
    listPhotos(session.orgId, projectId),
    listReports(session.orgId, projectId),
  ]);
  const franz = await getResolvedCoworker(session.orgId, "franz");
  const config = (franz?.config as FranzConfig) ?? franzDefaultConfig;
  return { project, notes, photos, reports, config };
}
