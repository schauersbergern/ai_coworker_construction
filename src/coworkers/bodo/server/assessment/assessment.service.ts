import { prisma } from "@/server/db";
import type { Prisma } from "@prisma/client";

export async function createAssessment(
  orgId: string,
  address: string,
  config: { snapshot: Prisma.InputJsonValue; version: number },
) {
  return prisma.assessment.create({
    data: {
      orgId,
      address,
      status: "pending",
      configSnapshot: config.snapshot,
      configVersion: config.version,
    },
  });
}

export async function listAssessments(orgId: string) {
  return prisma.assessment.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
}

export async function getAssessment(orgId: string, id: string) {
  return prisma.assessment.findFirst({ where: { id, orgId } });
}
