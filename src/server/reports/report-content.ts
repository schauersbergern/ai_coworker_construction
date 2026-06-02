import { z } from "zod";

/** Eine vom LLM erzeugte Feststellung, 1:1 zu einer Notiz. */
export type Finding = {
  noteId: string;
  title: string;
  location?: string;
  text: string;
};

/** Die strukturierte Ausgabe der Doku-Generierung (wird als Report.reportJson gespeichert). */
export type ReportContent = {
  intro?: string;
  findings: Finding[];
};

/**
 * Laufzeit-Validierung der LLM-Tool-Ausgabe. Wird in ClaudeDocGenerator genutzt, damit
 * eine fehlerhafte/unerwartete Claude-Antwort als Fehler auffällt (→ Report `failed` +
 * Retry) statt still ein kaputtes PDF zu erzeugen.
 */
export const reportContentSchema = z.object({
  intro: z.string().optional(),
  findings: z
    .array(
      z.object({
        noteId: z.string().min(1),
        title: z.string().min(1),
        location: z.string().optional(),
        text: z.string(),
      }),
    )
    .min(1),
}) satisfies z.ZodType<ReportContent>;
