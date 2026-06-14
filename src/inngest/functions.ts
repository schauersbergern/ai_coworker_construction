import type { InngestFunction } from "inngest";
import { inngest } from "./client";
import { runTranscribeNote } from "@/coworkers/franz/server/notes/transcribe-note";
import { runGenerateReport } from "@/coworkers/franz/server/reports/generate-report";
import { storage } from "@/server/storage";
import { LocalWhisperTranscriber } from "@/coworkers/franz/server/transcription/local-whisper";
import { ClaudeDocGenerator } from "@/coworkers/franz/server/docgen/claude-doc-generator";
import { log } from "@/server/log";

export const transcribeNote = inngest.createFunction(
  { id: "transcribe-note", retries: 2, triggers: [{ event: "note/created" }] },
  async ({ event }: { event: { data: { noteId: string } } }) => {
    const { noteId } = event.data;
    log("inngest", "transcribe-note invoked", { noteId });
    await runTranscribeNote(noteId, {
      storage,
      transcriber: new LocalWhisperTranscriber(),
    });
    return { noteId };
  },
);

export const generateReport = inngest.createFunction(
  { id: "generate-report", retries: 1, triggers: [{ event: "report/requested" }] },
  async ({ event }: { event: { data: { reportId: string } } }) => {
    log("inngest", "generate-report invoked", { reportId: event.data.reportId });
    await runGenerateReport(event.data.reportId, {
      storage,
      docGenerator: new ClaudeDocGenerator(),
      now: new Date(),
    });
    return { reportId: event.data.reportId };
  },
);

export const functions: InngestFunction.Any[] = [transcribeNote, generateReport];
