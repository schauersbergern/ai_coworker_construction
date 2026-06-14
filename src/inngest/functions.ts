import type { InngestFunction } from "inngest";
import { inngest } from "./client";
import { runTranscribeNote } from "@/coworkers/franz/server/notes/transcribe-note";
import { runGenerateReport } from "@/coworkers/franz/server/reports/generate-report";
import { storage } from "@/server/storage";
import { LocalWhisperTranscriber } from "@/coworkers/franz/server/transcription/local-whisper";
import { ClaudeDocGenerator } from "@/coworkers/franz/server/docgen/claude-doc-generator";
import { log } from "@/server/log";
import { isAvailable } from "@/coworkers";
import { runAssessment } from "@/coworkers/bodo/run-assessment";
import { geocode } from "@/coworkers/bodo/server/sources/nominatim";
import { buildProfile } from "@/coworkers/bodo/server/pipeline/build-profile";
import { failIfNotTerminal } from "@/coworkers/bodo/server/assessment/assessment.internal";
import { buildNarrative } from "@/coworkers/bodo/server/narrative/narrative";
import { ClaudeNarrativeGenerator } from "@/coworkers/bodo/server/narrative/claude-narrative";

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

const RUN_ASSESSMENT_RETRIES = 3;

export const runAssessmentJob = inngest.createFunction(
  {
    id: "run-assessment",
    retries: RUN_ASSESSMENT_RETRIES,
    idempotency: "event.data.assessmentId",
    triggers: [{ event: "assessment/requested" }],
    onFailure: async ({ event, error }: { event: { data: { event?: { data?: { assessmentId?: string } } } }; error: Error }) => {
      const assessmentId = event.data?.event?.data?.assessmentId;
      if (assessmentId) {
        await failIfNotTerminal(assessmentId, error.message ?? "Job nach Retries fehlgeschlagen");
      }
    },
  },
  async ({ event, attempt }: { event: { data: { assessmentId: string } }; attempt: number }) => {
    const { assessmentId } = event.data;
    log("inngest", "run-assessment invoked", { assessmentId, attempt });
    await runAssessment(
      assessmentId,
      { isAvailable, geocode, buildProfile, generateNarrative: (input) => buildNarrative(input, new ClaudeNarrativeGenerator()) },
      { attempt, maxAttempts: RUN_ASSESSMENT_RETRIES },
    );
    return { assessmentId };
  },
);

export const functions: InngestFunction.Any[] = [transcribeNote, generateReport, runAssessmentJob];
