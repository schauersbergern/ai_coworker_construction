import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable } from "@/coworkers";
import { getProject } from "@/server/projects/projects.service";
import { listNotes } from "@/server/notes/notes.service";
import { createReport, setReportStatus } from "@/server/reports/reports.service";
import { inngest } from "@/inngest/client";
import { log, logError } from "@/server/log";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id: projectId } = await params;
  if (!(await isAvailable(session.orgId, "franz"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  // Nur exportieren, wenn mindestens ein fertiges, nicht-leeres Transkript vorliegt.
  const notes = await listNotes(session.orgId, projectId);
  const usable = notes.filter((n) => n.transcriptStatus === "done" && n.transcript && n.transcript.trim().length > 0);
  if (usable.length === 0) {
    const pending = notes.some((n) => n.transcriptStatus === "pending");
    return NextResponse.json(
      {
        error: pending
          ? "Transkription läuft noch – bitte warten, bis die Notizen fertig transkribiert sind."
          : "Keine nutzbaren Sprachnotizen vorhanden – nichts zu exportieren.",
      },
      { status: 400 },
    );
  }

  const label = `Export ${new Date().toLocaleDateString("de-AT")}`;
  const report = await createReport(projectId, { label, createdById: session.userId });
  log("export", "report requested", { projectId, reportId: report.id, usableNotes: usable.length });

  try {
    await inngest.send({ name: "report/requested", data: { reportId: report.id } });
    log("export", "report/requested enqueued", { reportId: report.id });
  } catch (err) {
    const failed = await setReportStatus(report.id, "failed");
    logError("export", "report/requested enqueue failed", err, { reportId: report.id });
    return NextResponse.json(
      { id: failed.id, status: failed.status, error: "Export konnte nicht gestartet werden" },
      { status: 502 },
    );
  }
  return NextResponse.json({ id: report.id, status: report.status });
}
