import { z } from "zod";

// Feste Gewichts-Keys (eine pro Teilscore) mit nichtnegativen Werten. KEIN z.record:
// unbekannte/negative Gewichte würden den Nenner verfälschen und den 0–100-Score aus
// dem Wertebereich treiben.
export const scoringWeightsSchema = z.object({
  nahversorgung: z.number().min(0),
  oepnv: z.number().min(0),
  schulen: z.number().min(0),
  gruen: z.number().min(0),
  walkability: z.number().min(0),
  kaufkraft: z.number().min(0),
  gastroKultur: z.number().min(0),
});
export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;

export const bodoConfigSchema = z.object({
  narrative: z.object({ systemPrompt: z.string().min(1) }),
  scoring: z.object({ weights: scoringWeightsSchema }),
  sources: z.object({
    geocode: z.boolean(),
    elevation: z.boolean(),
    pois: z.boolean(),
    transit: z.boolean(),
    hochwasser: z.boolean(),
    natur: z.boolean(),
    geologie: z.boolean(),
    solar: z.boolean(),
    luft: z.boolean(),
    geschosse: z.boolean(),
    sozio: z.boolean(),
    denkmal: z.boolean(),
  }),
  labels: z.object({
    listHeading: z.string().min(1),
    newHeading: z.string().min(1),
  }),
});

export type BodoConfig = z.infer<typeof bodoConfigSchema>;

export const bodoDefaultConfig: BodoConfig = {
  narrative: {
    systemPrompt: [
      "Du bist ein Standort-Analyst für Immobilien-Projektentwicklung in Bayern.",
      "",
      "Aufgabe: Schreibe aus den strukturierten Standortdaten eine sachliche",
      "Mikrolage-Analyse auf Deutsch (3-5 Absätze).",
      "",
      "Regeln:",
      "1. Nutze AUSSCHLIESSLICH die übergebenen Datenpunkte. Erfinde nichts.",
      "2. Felder mit Status 'unavailable' NICHT als Tatsache behaupten — benenne sie",
      "   als 'nicht ermittelbar' oder lasse sie weg.",
      "3. Benenne Stärken und Schwächen der Lage klar (z.B. ÖPNV, Lärm, Nahversorgung).",
      "4. Keine Kauf-/Rechtsberatung, keine erfundenen Zahlen.",
    ].join("\n"),
  },
  scoring: {
    weights: {
      nahversorgung: 1,
      oepnv: 1,
      schulen: 1,
      gruen: 1,
      walkability: 1,
      kaufkraft: 1,
      gastroKultur: 1,
    },
  },
  sources: {
    geocode: true,
    elevation: true,
    pois: true,
    transit: true,
    hochwasser: true,
    natur: true,
    geologie: true,
    solar: true,
    luft: true,
    geschosse: true,
    sozio: true,
    denkmal: true,
  },
  labels: { listHeading: "📍 Standorte", newHeading: "Neuen Standort bewerten" },
};
