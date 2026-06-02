import type { ReportContent } from "@/server/reports/report-content";

/**
 * Erzwingt den Kernvertrag der Doku-Generierung: GENAU eine Feststellung pro Eingabe-Notiz,
 * mit exakt den Eingabe-noteIds (keine fehlenden, doppelten oder fremden IDs). Die
 * zurückgegebenen Feststellungen werden in Eingabe-Reihenfolge gebracht (deterministische
 * Nummerierung im PDF). Bei Verletzung wird geworfen → der Job markiert den Report `failed`.
 */
export function enforceFindingsContract(content: ReportContent, expectedNoteIds: string[]): ReportContent {
  const byId = new Map(content.findings.map((f) => [f.noteId, f] as const));
  const noDuplicates = byId.size === content.findings.length;
  const sameCount = content.findings.length === expectedNoteIds.length;
  const allExpectedPresent = expectedNoteIds.every((id) => byId.has(id));
  if (!sameCount || !noDuplicates || !allExpectedPresent) {
    throw new Error(
      `Feststellungen entsprechen nicht den Eingabe-Notizen ` +
        `(erwartet ${expectedNoteIds.length} eindeutige noteIds, erhalten ${content.findings.length}).`,
    );
  }
  return {
    intro: content.intro,
    findings: expectedNoteIds.map((id) => byId.get(id)!),
  };
}
