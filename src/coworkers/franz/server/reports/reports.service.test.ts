import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { claimReportForRetry, createReport, listReports, getReportForOrg, setReportResult, setReportStatus } from "./reports.service";

const snapshotArgs = { configSnapshot: {}, configVersion: 0 } as const;

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
    const r = await createReport(project.id, { label: "Export 1", createdById: null, ...snapshotArgs });
    expect(r.status).toBe("pending");
    const list = await listReports(org.id, project.id);
    expect(list.map((x) => x.id)).toContain(r.id);
  });

  it("does not list reports from another org", async () => {
    const a = await makeProject();
    const b = await makeProject();
    await createReport(a.project.id, { label: "X", createdById: null, ...snapshotArgs });
    expect(await listReports(b.org.id, a.project.id)).toHaveLength(0);
  });

  it("getReportForOrg enforces org scoping", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const r = await createReport(a.project.id, { label: "X", createdById: null, ...snapshotArgs });
    expect(await getReportForOrg(b.org.id, r.id)).toBeNull();
    expect((await getReportForOrg(a.org.id, r.id))?.id).toBe(r.id);
  });

  it("setReportResult marks done with pdfUrl + json; setReportStatus sets failed", async () => {
    const { project } = await makeProject();
    const r = await createReport(project.id, { label: "X", createdById: null, ...snapshotArgs });
    const done = await setReportResult(r.id, { pdfUrl: "projects/p/reports/x.pdf", reportJson: { findings: [] } });
    expect(done.status).toBe("done");
    expect(done.pdfUrl).toBe("projects/p/reports/x.pdf");
    const failed = await setReportStatus(r.id, "failed");
    expect(failed.status).toBe("failed");
  });

  it("claimReportForRetry claims a failed/cancelled report atomically and sets pending", async () => {
    const { org, project } = await makeProject();
    const r = await createReport(project.id, { label: "X", createdById: null, ...snapshotArgs });
    await setReportStatus(r.id, "failed");

    expect(await claimReportForRetry(org.id, r.id)).toBe(true);
    expect((await getReportForOrg(org.id, r.id))?.status).toBe("pending");
  });

  it("claimReportForRetry rejects a done report (cannot reset a finished PDF)", async () => {
    const { org, project } = await makeProject();
    const r = await createReport(project.id, { label: "X", createdById: null, ...snapshotArgs });
    await setReportResult(r.id, { pdfUrl: "projects/p/reports/x.pdf", reportJson: {} }); // → done

    expect(await claimReportForRetry(org.id, r.id)).toBe(false);
    const reloaded = await getReportForOrg(org.id, r.id);
    expect(reloaded?.status).toBe("done");
    expect(reloaded?.pdfUrl).toBe("projects/p/reports/x.pdf");
  });

  it("claimReportForRetry: only one of two parallel claims wins (atomic, no double-enqueue)", async () => {
    const { org, project } = await makeProject();
    const r = await createReport(project.id, { label: "X", createdById: null, ...snapshotArgs });
    await setReportStatus(r.id, "cancelled");

    const [a, b] = await Promise.all([
      claimReportForRetry(org.id, r.id),
      claimReportForRetry(org.id, r.id),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("claimReportForRetry is org-scoped: a foreign org cannot claim", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const r = await createReport(a.project.id, { label: "X", createdById: null, ...snapshotArgs });
    await setReportStatus(r.id, "failed");

    expect(await claimReportForRetry(b.org.id, r.id)).toBe(false);
    expect((await getReportForOrg(a.org.id, r.id))?.status).toBe("failed");
  });
});
