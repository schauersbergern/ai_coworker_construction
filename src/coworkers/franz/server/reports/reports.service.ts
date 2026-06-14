import { prisma } from "@/server/db";
import type { Prisma, ReportStatus } from "@prisma/client";

export type CreateReportInput = {
  label: string;
  createdById: string | null;
  configSnapshot: Prisma.InputJsonValue;
  configVersion: number;
};

export function createReport(projectId: string, input: CreateReportInput) {
  return prisma.report.create({
    data: {
      projectId,
      label: input.label,
      createdById: input.createdById ?? undefined,
      status: "pending",
      configSnapshot: input.configSnapshot,
      configVersion: input.configVersion,
    },
  });
}

export function listReports(orgId: string, projectId: string) {
  return prisma.report.findMany({
    where: { projectId, project: { orgId } },
    orderBy: { generatedAt: "desc" },
  });
}

export function getReportForOrg(orgId: string, reportId: string) {
  return prisma.report.findFirst({ where: { id: reportId, project: { orgId } } });
}

export function setReportResult(reportId: string, result: { pdfUrl: string; reportJson: Prisma.InputJsonValue }) {
  return prisma.report.update({
    where: { id: reportId },
    data: { pdfUrl: result.pdfUrl, reportJson: result.reportJson, status: "done" },
  });
}

export function setReportStatus(reportId: string, status: ReportStatus) {
  return prisma.report.update({ where: { id: reportId }, data: { status } });
}

/**
 * Beansprucht einen Report atomar für einen erneuten Versuch: setzt ihn nur dann auf
 * `pending`, wenn er aktuell `failed`/`cancelled` ist (und org-scoped). Liefert true,
 * wenn dieser Aufruf den Übergang gewonnen hat. Verhindert per bedingtem updateMany ein
 * TOCTOU-Race: bei zwei parallelen Retries gewinnt genau einer (count === 1); der zweite
 * sieht `pending` (nicht mehr in der Menge) → false. So kann ein fertiges PDF nicht
 * zurückgesetzt und kein Doppel-Job enqueued werden.
 */
export async function claimReportForRetry(orgId: string, reportId: string): Promise<boolean> {
  const res = await prisma.report.updateMany({
    where: { id: reportId, project: { orgId }, status: { in: ["failed", "cancelled"] } },
    data: { status: "pending" },
  });
  return res.count === 1;
}
