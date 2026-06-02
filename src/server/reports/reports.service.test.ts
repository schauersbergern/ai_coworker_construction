import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createReport, listReports, getReportForOrg, setReportResult, setReportStatus } from "./reports.service";

async function makeProject() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return { org, project };
}

describe("reports.service", () => {
  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a pending report and lists it org-scoped", async () => {
    const { org, project } = await makeProject();
    const r = await createReport(project.id, { label: "Export 1", createdById: null });
    expect(r.status).toBe("pending");
    const list = await listReports(org.id, project.id);
    expect(list.map((x) => x.id)).toContain(r.id);
  });

  it("does not list reports from another org", async () => {
    const a = await makeProject();
    const b = await makeProject();
    await createReport(a.project.id, { label: "X", createdById: null });
    expect(await listReports(b.org.id, a.project.id)).toHaveLength(0);
  });

  it("getReportForOrg enforces org scoping", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const r = await createReport(a.project.id, { label: "X", createdById: null });
    expect(await getReportForOrg(b.org.id, r.id)).toBeNull();
    expect((await getReportForOrg(a.org.id, r.id))?.id).toBe(r.id);
  });

  it("setReportResult marks done with pdfUrl + json; setReportStatus sets failed", async () => {
    const { project } = await makeProject();
    const r = await createReport(project.id, { label: "X", createdById: null });
    const done = await setReportResult(r.id, { pdfUrl: "projects/p/reports/x.pdf", reportJson: { findings: [] } });
    expect(done.status).toBe("done");
    expect(done.pdfUrl).toBe("projects/p/reports/x.pdf");
    const failed = await setReportStatus(r.id, "failed");
    expect(failed.status).toBe("failed");
  });
});
