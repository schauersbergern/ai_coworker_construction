import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable } from "@/coworkers";
import { getAssessment } from "@/coworkers/bodo/server/assessment/assessment.service";
import { renderDossier } from "@/coworkers/bodo/server/pdf/render-dossier";
import type { Scores } from "@/coworkers/bodo/server/scoring/score";
import type { LocationProfile } from "@/coworkers/bodo/server/pipeline/profile";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  // layout.tsx schützt route handler NICHT — eigener Gate hier (Defense-in-Depth).
  if (!(await isAvailable(session.orgId, "bodo"))) return new NextResponse("not available", { status: 403 });
  const a = await getAssessment(session.orgId, id);
  if (!a || a.status !== "ready") return new NextResponse("not ready", { status: 404 });
  const buf = await renderDossier({
    address: a.address,
    scores: a.scores as unknown as Scores,
    narrative: a.narrative,
    profile: a.profile as unknown as LocationProfile,
  });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lagebewertung-${a.id}.pdf"`,
    },
  });
}
