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
