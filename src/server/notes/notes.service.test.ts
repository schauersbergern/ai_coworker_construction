import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createNote, listNotes, getNoteForOrg, setTranscript, setTranscriptStatus } from "./notes.service";

async function makeProject() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return { org, project };
}

describe("notes.service", () => {
  beforeEach(async () => {
    await prisma.note.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a pending note and lists it for the org", async () => {
    const { org, project } = await makeProject();
    const note = await createNote(project.id, { audioKey: "projects/x/notes/n.webm", recordedAt: new Date("2026-06-01T09:42:00Z") });
    expect(note.transcriptStatus).toBe("pending");
    const list = await listNotes(org.id, project.id);
    expect(list.map((n) => n.id)).toContain(note.id);
  });

  it("does not list notes of a project in another org", async () => {
    const a = await makeProject();
    const b = await makeProject();
    await createNote(a.project.id, { audioKey: "k", recordedAt: new Date() });
    expect(await listNotes(b.org.id, a.project.id)).toHaveLength(0);
  });

  it("getNoteForOrg enforces org scoping", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const note = await createNote(a.project.id, { audioKey: "k", recordedAt: new Date() });
    expect(await getNoteForOrg(b.org.id, note.id)).toBeNull();
    expect((await getNoteForOrg(a.org.id, note.id))?.id).toBe(note.id);
  });

  it("setTranscript stores text and marks done; setTranscriptStatus sets failed", async () => {
    const { project } = await makeProject();
    const note = await createNote(project.id, { audioKey: "k", recordedAt: new Date() });
    const done = await setTranscript(note.id, "Riss in der Wand");
    expect(done.transcript).toBe("Riss in der Wand");
    expect(done.transcriptStatus).toBe("done");
    const failed = await setTranscriptStatus(note.id, "failed");
    expect(failed.transcriptStatus).toBe("failed");
  });
});
