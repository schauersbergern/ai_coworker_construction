import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createProject, listProjects, getProject } from "./projects.service";

async function makeOrg() {
  return prisma.organization.create({ data: { name: "Test-Büro" } });
}

describe("projects.service", () => {
  beforeEach(async () => {
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a project in the org and lists it", async () => {
    const org = await makeOrg();
    const created = await createProject(org.id, { name: "Wohnbau Lindengasse" });
    expect(created.id).toBeTruthy();
    expect(created.orgId).toBe(org.id);

    const list = await listProjects(org.id);
    expect(list.map((p) => p.id)).toContain(created.id);
  });

  it("does not list projects of other orgs", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await createProject(orgA.id, { name: "A-Projekt" });

    const listB = await listProjects(orgB.id);
    expect(listB).toHaveLength(0);
  });

  it("getProject returns null for a project of another org", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const p = await createProject(orgA.id, { name: "A-Projekt" });

    expect(await getProject(orgB.id, p.id)).toBeNull();
    expect((await getProject(orgA.id, p.id))?.id).toBe(p.id);
  });
});
