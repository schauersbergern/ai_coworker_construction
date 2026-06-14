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
