import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/server/db";
import { LocalStorage } from "@/server/storage/local-storage";
import { FakeDocGenerator } from "@/coworkers/franz/server/docgen/doc-generator";
import { runGenerateReport } from "./generate-report";
import "@/coworkers"; // registriert Franz im Resolver (isAvailable braucht das Manifest)

let dir: string;
let storage: LocalStorage;

async function seed() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "Wohnbau", projectNo: "2026-014" } });
  const note = await prisma.note.create({
    data: { projectId: project.id, audioUrl: "k", transcript: "Riss in der Wand", transcriptStatus: "done", recordedAt: new Date("2026-06-01T09:00:00Z") },
  });
  const photoKey = `projects/${project.id}/photos/p1.png`;
  // Echtes 1×1-PNG, damit sharp dekodieren kann (sonst würde das Foto übersprungen).
  const onePxPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await storage.put(photoKey, onePxPng, "image/png");
  await prisma.photo.create({
    data: { projectId: project.id, fileUrl: photoKey, clientCapturedAt: new Date("2026-06-01T09:01:00Z") },
  });
  const report = await prisma.report.create({ data: { projectId: project.id, label: "Export 1", status: "pending" } });
  return { project, note, report };
}

beforeEach(async () => {
  await prisma.report.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.note.deleteMany();
  await prisma.project.deleteMany();
  await prisma.orgModule.deleteMany();
  await prisma.organization.deleteMany();
  dir = mkdtempSync(join(tmpdir(), "baudoku-report-"));
  storage = new LocalStorage(dir);
});

describe("runGenerateReport", () => {
  it("generates a PDF, stores it, and marks the report done", async () => {
    const { report } = await seed();
    const result = await runGenerateReport(report.id, {
      storage,
      docGenerator: new FakeDocGenerator(),
      now: new Date("2026-06-02T00:00:00Z"),
    });
    expect(result?.status).toBe("done");
    expect(result?.pdfUrl).toMatch(/reports\/.*\.pdf$/);
    expect(await storage.exists(result!.pdfUrl!)).toBe(true);
    const pdf = await storage.read(result!.pdfUrl!);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("marks the report failed and rethrows when generation throws", async () => {
    const { report } = await seed();
    const boom = { generate: async () => { throw new Error("llm down"); } };
    await expect(
      runGenerateReport(report.id, { storage, docGenerator: boom, now: new Date() }),
    ).rejects.toThrow("llm down");
    const reloaded = await prisma.report.findUnique({ where: { id: report.id } });
    expect(reloaded?.status).toBe("failed");
  });

  it("throws (and marks failed) for an empty project (no notes)", async () => {
    const org = await prisma.organization.create({ data: { name: "B" } });
    const project = await prisma.project.create({ data: { orgId: org.id, name: "Leer" } });
    const report = await prisma.report.create({ data: { projectId: project.id, label: "E", status: "pending" } });
    await expect(
      runGenerateReport(report.id, { storage, docGenerator: new FakeDocGenerator(), now: new Date() }),
    ).rejects.toThrow();
    const reloaded = await prisma.report.findUnique({ where: { id: report.id } });
    expect(reloaded?.status).toBe("failed");
  });

  it("cancels (no docgen call) when franz is unavailable for the org", async () => {
    const org = await prisma.organization.create({ data: { name: "Ohne Franz" } });
    // Franz ist enabledByDefault → explizit entziehen, damit der Resolver notEntitled liefert.
    await prisma.orgModule.create({ data: { orgId: org.id, coworkerId: "franz", enabled: false } });
    const project = await prisma.project.create({ data: { orgId: org.id, name: "Wohnbau" } });
    await prisma.note.create({
      data: { projectId: project.id, audioUrl: "k", transcript: "Riss", transcriptStatus: "done", recordedAt: new Date() },
    });
    const report = await prisma.report.create({ data: { projectId: project.id, label: "E", status: "pending" } });

    let generateCalls = 0;
    const spyGen = { generate: async () => { generateCalls++; return { intro: "", findings: [] }; } };

    const result = await runGenerateReport(report.id, { storage, docGenerator: spyGen, now: new Date() });

    expect(result).toBeNull();
    expect((await prisma.report.findUnique({ where: { id: report.id } }))?.status).toBe("cancelled");
    expect(generateCalls).toBe(0);
  });

  it("drives the doc generator from the stored config snapshot (reproducible)", async () => {
    const { report } = await seed();
    const customPrompt = "SNAPSHOT-PROMPT — reproduzierbar";
    await prisma.report.update({
      where: { id: report.id },
      data: {
        configSnapshot: {
          docgen: { systemPrompt: customPrompt },
          labels: { notesHeading: "a", photosHeading: "b", docsHeading: "c" },
        },
        configVersion: 0,
      },
    });

    // An FakeDocGenerator delegieren (liefert vertragskonforme Findings), aber den
    // tatsächlich übergebenen systemPrompt mitschneiden.
    const fake = new FakeDocGenerator();
    let seenPrompt: string | undefined;
    const spyGen = {
      generate: async (input: Parameters<FakeDocGenerator["generate"]>[0]) => {
        seenPrompt = input.systemPrompt;
        return fake.generate(input);
      },
    };

    const result = await runGenerateReport(report.id, { storage, docGenerator: spyGen, now: new Date() });

    expect(result?.status).toBe("done");
    expect(seenPrompt).toBe(customPrompt);
  });

  it("is idempotent: skips a report already in a terminal state (no docgen call)", async () => {
    // Org hat Franz verfügbar; der Terminal-Check muss VOR Verfügbarkeits-/Docgen-Logik greifen.
    const { report } = await seed();
    await prisma.report.update({ where: { id: report.id }, data: { status: "done" } });

    let generateCalls = 0;
    const spyGen = { generate: async () => { generateCalls++; return { intro: "", findings: [] }; } };

    const result = await runGenerateReport(report.id, { storage, docGenerator: spyGen, now: new Date() });

    expect(result).toBeNull();
    expect(generateCalls).toBe(0);
    expect((await prisma.report.findUnique({ where: { id: report.id } }))?.status).toBe("done");
  });

  it("throws (and marks failed) when notes exist but none has a usable transcript", async () => {
    const org = await prisma.organization.create({ data: { name: "B" } });
    const project = await prisma.project.create({ data: { orgId: org.id, name: "Pending" } });
    await prisma.note.create({
      data: { projectId: project.id, audioUrl: "k", transcript: null, transcriptStatus: "pending", recordedAt: new Date() },
    });
    const report = await prisma.report.create({ data: { projectId: project.id, label: "E", status: "pending" } });
    await expect(
      runGenerateReport(report.id, { storage, docGenerator: new FakeDocGenerator(), now: new Date() }),
    ).rejects.toThrow();
    expect((await prisma.report.findUnique({ where: { id: report.id } }))?.status).toBe("failed");
  });
});
