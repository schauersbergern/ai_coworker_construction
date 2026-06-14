import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/server/db";
import { LocalStorage } from "@/server/storage/local-storage";
import { FakeTranscriber } from "@/coworkers/franz/server/transcription/transcriber";
import { runTranscribeNote } from "./transcribe-note";

let dir: string;

async function makeNote(audioKey: string) {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return prisma.note.create({
    data: { projectId: project.id, audioUrl: audioKey, recordedAt: new Date(), transcriptStatus: "pending" },
  });
}

beforeEach(async () => {
  await prisma.note.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();
  dir = mkdtempSync(join(tmpdir(), "baudoku-job-"));
});

describe("runTranscribeNote", () => {
  it("transcribes a note and marks it done", async () => {
    const key = "projects/p/notes/n.webm";
    const storage = new LocalStorage(dir);
    await storage.put(key, Buffer.from("audio"), "audio/webm");
    const note = await makeNote(key);

    const result = await runTranscribeNote(note.id, {
      storage,
      transcriber: new FakeTranscriber("Riss in der Wand"),
    });

    expect(result?.transcriptStatus).toBe("done");
    expect(result?.transcript).toBe("Riss in der Wand");
  });

  it("marks the note failed if transcription throws", async () => {
    const key = "projects/p/notes/n2.webm";
    const storage = new LocalStorage(dir);
    await storage.put(key, Buffer.from("audio"), "audio/webm");
    const note = await makeNote(key);

    const throwing = { transcribe: async () => { throw new Error("whisper down"); } };
    await expect(
      runTranscribeNote(note.id, { storage, transcriber: throwing }),
    ).rejects.toThrow("whisper down");

    const reloaded = await prisma.note.findUnique({ where: { id: note.id } });
    expect(reloaded?.transcriptStatus).toBe("failed");
  });

  it("is a no-op (no throw) when the note was already deleted before the job runs", async () => {
    const storage = new LocalStorage(dir);
    const result = await runTranscribeNote("missing-note-id", {
      storage,
      transcriber: new FakeTranscriber("egal"),
    });
    expect(result).toBeNull();
  });

  it("does not mark failed if the note is deleted mid-job", async () => {
    const key = "projects/p/notes/n3.webm";
    const storage = new LocalStorage(dir);
    await storage.put(key, Buffer.from("audio"), "audio/webm");
    const note = await makeNote(key);

    // Transcriber, der die Notiz während der Verarbeitung löscht und dann wirft.
    const deletingTranscriber = {
      transcribe: async () => {
        await prisma.note.delete({ where: { id: note.id } });
        throw new Error("whisper down");
      },
    };
    const result = await runTranscribeNote(note.id, { storage, transcriber: deletingTranscriber });
    expect(result).toBeNull();
  });
});
