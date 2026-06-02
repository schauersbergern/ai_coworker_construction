import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getReportForOrg, setReportStatus } from "@/server/reports/reports.service";
import { inngest } from "@/inngest/client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const session = await requireSession();
  const { id, reportId } = await params;
  const report = await getReportForOrg(session.orgId, reportId);
  if (!report || report.projectId !== id) return new NextResponse("Not found", { status: 404 });

  // Nur fehlgeschlagene Exporte dürfen erneut versucht werden. Sonst könnte ein fertiges
  // (done) PDF aus der Download-Liste zurückgesetzt oder ein laufender Export gestört werden.
  if (report.status !== "failed") {
    return NextResponse.json(
      { error: "Nur fehlgeschlagene Exporte können erneut versucht werden.", status: report.status },
      { status: 409 },
    );
  }

  await setReportStatus(reportId, "pending");
  try {
    await inngest.send({ name: "report/requested", data: { reportId } });
  } catch {
    const failed = await setReportStatus(reportId, "failed");
    return NextResponse.json(
      { id: failed.id, status: failed.status, error: "Export konnte nicht gestartet werden" },
      { status: 502 },
    );
  }
  return NextResponse.json({ id: reportId, status: "pending" });
}
