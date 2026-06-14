import type { ReportContent } from "@/coworkers/franz/server/reports/report-content";

export type DocGenInput = {
  projectName: string;
  notes: { id: string; transcript: string }[];
  systemPrompt: string;
};

export interface DocGenerator {
  generate(input: DocGenInput): Promise<ReportContent>;
}

/** Deterministische Test-Implementierung: 1 Finding pro Notiz, kein LLM. */
export class FakeDocGenerator implements DocGenerator {
  async generate(input: DocGenInput): Promise<ReportContent> {
    return {
      intro: `Begehungsdokumentation ${input.projectName}`,
      findings: input.notes.map((n, i) => ({
        noteId: n.id,
        title: `Feststellung ${i + 1}`,
        text: n.transcript,
      })),
    };
  }
}
