import type { CoworkerManifest } from "../types";
import { bodoConfigSchema, bodoDefaultConfig, type BodoConfig } from "./config";

export const bodoManifest: CoworkerManifest<BodoConfig> = {
  id: "bodo",
  name: "Bodo",
  role: "Standort- & Lagebewertung",
  emoji: "📍",
  blurb:
    "Bewertet aus einer Adresse die Lage: Infrastruktur, Risiken, Umwelt und Markt — und erstellt ein PDF-Dossier auf Knopfdruck.",
  lifecycle: "active",
  // Bewusst NICHT per Default freigeschaltet: mehrere Risiko-Endpoints in sources/endpoints.ts
  // sind noch nicht live verifiziert (v.a. der DGM1-Platzhalter). Bodo wird pro Org gezielt per
  // OrgModule-Row aktiviert (siehe seed-coworkers.ts), sobald die Quellen verifiziert sind.
  enabledByDefault: false,
  configSchema: bodoConfigSchema,
  defaultConfig: bodoDefaultConfig,
  configVersion: 0,
  entryPath: "/c/bodo/standorte",
  // KEIN inngestFunctions hier: Das Feld wird nirgends ausgewertet (nur in types.ts deklariert) —
  // die Job-Registrierung läuft ausschließlich über das functions[]-Array in src/inngest/functions.ts.
  // Ein Import von @/inngest/functions im Manifest erzeugte einen Import-Zyklus. Franz hält es genauso.
};
