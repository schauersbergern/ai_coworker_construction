import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/db";
import { createAssessment, listAssessments, getAssessment } from "./assessment.service";
import { claimForRun } from "./assessment.internal";

async function makeOrg(id: string) {
  await prisma.organization.create({ data: { id, name: id } });
}

describe("assessment.service", () => {
  beforeEach(async () => {
    await prisma.assessment.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates an org-scoped pending assessment with a config snapshot", async () => {
    await makeOrg("org1");
    const a = await createAssessment("org1", "Kiefernstr. 25, München", { snapshot: { x: 1 }, version: 0 });
    expect(a.status).toBe("pending");
    expect(a.orgId).toBe("org1");
    expect(a.configSnapshot).toEqual({ x: 1 });
  });

  it("getAssessment does not leak across orgs", async () => {
    await makeOrg("org1");
    await makeOrg("org2");
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    expect(await getAssessment("org2", a.id)).toBeNull();
  });

  it("claimForRun atomically moves pending -> running once", async () => {
    await makeOrg("org1");
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    expect(await claimForRun(a.id)).toBe(true);
    expect(await claimForRun(a.id)).toBe(false); // already running
  });

  it("listAssessments returns only the org's own assessments", async () => {
    await makeOrg("org1");
    await makeOrg("org2");
    await createAssessment("org1", "a1", { snapshot: {}, version: 0 });
    await createAssessment("org2", "a2", { snapshot: {}, version: 0 });
    const list = await listAssessments("org1");
    expect(list).toHaveLength(1);
    expect(list[0]?.address).toBe("a1");
  });
});
