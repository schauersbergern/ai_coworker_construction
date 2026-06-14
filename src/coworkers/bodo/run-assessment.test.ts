import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/server/db";
import { createAssessment } from "./server/assessment/assessment.service";
import { runAssessment, type RunAssessmentDeps } from "./run-assessment";

const deps: RunAssessmentDeps = {
  isAvailable: vi.fn(async () => true),
  buildProfile: vi.fn(async (coord) => ({
    coordinate: coord,
    district: { value: "Fasangarten", status: "ok", source: "test", license: "-", confidence: "high", retrievedAt: new Date().toISOString() },
    plz: { value: "81549", status: "ok", source: "test", license: "-", confidence: "high", retrievedAt: new Date().toISOString() },
    elevation: { value: 550, status: "ok", source: "test", license: "-", confidence: "high", retrievedAt: new Date().toISOString() },
    fields: {},
  })),
  geocode: vi.fn(async () => ({ lat: 48.0865, lon: 11.5951, district: "Fasangarten", plz: "81549", state: "Bayern" })),
};

describe("runAssessment", () => {
  beforeEach(async () => {
    await prisma.assessment.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.organization.create({ data: { id: "org1", name: "org1" } });
    vi.clearAllMocks();
  });

  it("happy path: pending -> ready with stub profile", async () => {
    const a = await createAssessment("org1", "Kiefernstr. 25, München", { snapshot: {}, version: 0 });
    await runAssessment(a.id, deps);
    const after = await prisma.assessment.findUnique({ where: { id: a.id } });
    expect(after?.status).toBe("ready");
    expect(after?.lat).toBe(48.0865);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((after?.profile as any).district.value).toBe("Fasangarten");
  });

  it("is idempotent: second run is a no-op (status stays ready)", async () => {
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    await runAssessment(a.id, deps);
    await runAssessment(a.id, deps); // 2. Lauf sieht status=ready → terminaler No-op
    expect(deps.buildProfile).toHaveBeenCalledTimes(1);
  });

  it("cancels when coworker is not available", async () => {
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    await runAssessment(a.id, { ...deps, isAvailable: vi.fn(async () => false) });
    const after = await prisma.assessment.findUnique({ where: { id: a.id } });
    expect(after?.status).toBe("cancelled");
  });

  it("fails for an address outside Bayern", async () => {
    const a = await createAssessment("org1", "Alexanderplatz, Berlin", { snapshot: {}, version: 0 });
    await runAssessment(a.id, {
      ...deps,
      geocode: vi.fn(async () => ({ lat: 52.52, lon: 13.405, district: "Mitte", plz: "10178", state: "Berlin" })),
    });
    const after = await prisma.assessment.findUnique({ where: { id: a.id } });
    expect(after?.status).toBe("failed");
    expect(after?.error).toMatch(/außerhalb Bayern/);
  });

  it("rethrows a transient error while retries remain (stays running)", async () => {
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    const flaky = { ...deps, buildProfile: vi.fn(async () => { throw new Error("overpass 502"); }) };
    await expect(runAssessment(a.id, flaky, { attempt: 0, maxAttempts: 3 })).rejects.toThrow("overpass 502");
    const after = await prisma.assessment.findUnique({ where: { id: a.id } });
    expect(after?.status).toBe("running");
  });

  it("marks failed on the last attempt instead of hanging in running", async () => {
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    const flaky = { ...deps, buildProfile: vi.fn(async () => { throw new Error("overpass 502"); }) };
    await runAssessment(a.id, flaky, { attempt: 3, maxAttempts: 3 });
    const after = await prisma.assessment.findUnique({ where: { id: a.id } });
    expect(after?.status).toBe("failed");
  });
});
