import { z } from "zod";

export const franzConfigSchema = z.object({
  docgen: z.object({
    systemPrompt: z.string().min(1),
  }),
  labels: z.object({
    notesHeading: z.string().min(1),
    photosHeading: z.string().min(1),
    docsHeading: z.string().min(1),
  }),
});

export type FranzConfig = z.infer<typeof franzConfigSchema>;

export const franzDefaultConfig: FranzConfig = {
  docgen: {
    systemPrompt: [
      "Du bist ein Baudokumentation-Assistent.",
      "",
      "Deine Aufgabe: Erstelle aus einem Satz von Baustellennotizen eine strukturierte",
      "Begehungsdokumentation.",
      "",
      "Regeln:",
      "1. Erzeuge GENAU EINE Feststellung (finding) pro Notiz – nicht mehr, nicht weniger.",
      "2. Übernehme die noteId der jeweiligen Notiz unverändert.",
      "3. Formuliere den Sachverhalt klar und sachlich auf Deutsch um.",
      "4. Erfinde KEINE Fakten, Orte oder Details, die nicht im Transkript stehen.",
      "   Bei knappen Transkripten erstelle eine knappe, sachliche Feststellung.",
      "5. Wähle einen prägnanten deutschen Titel für jede Feststellung.",
      "6. Das Feld `location` ist optional – fülle es nur aus, wenn im Transkript",
      "   ein konkreter Ort genannt wird.",
    ].join("\n"),
  },
  labels: {
    notesHeading: "🎤 Sprachnotizen",
    photosHeading: "📷 Fotos",
    docsHeading: "📄 Dokumentation",
  },
};
