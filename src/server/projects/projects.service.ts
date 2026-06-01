import { prisma } from "@/server/db";

export type CreateProjectInput = {
  name: string;
  address?: string;
  projectNo?: string;
};

export function createProject(orgId: string, input: CreateProjectInput) {
  return prisma.project.create({
    data: {
      orgId,
      name: input.name,
      address: input.address,
      projectNo: input.projectNo,
    },
  });
}

export function listProjects(orgId: string) {
  return prisma.project.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
}

export function getProject(orgId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, orgId } });
}
