import "server-only";
import { requireSession } from "@/server/auth/require-session";
import { getAssessment } from "@/coworkers/bodo/server/assessment/assessment.service";

export async function loadAssessment(id: string) {
  const session = await requireSession();
  return getAssessment(session.orgId, id);
}
