import type { ZodType } from "zod";
import type { InngestFunction } from "inngest";

/** Pro-Org-Ergebnis aus lifecycle + Entitlement + Kill-Switch. */
export type Availability = "available" | "comingSoon" | "notEntitled" | "killSwitched";

export interface CoworkerManifest<C = unknown> {
  /** Stabile ID, z.B. "franz" — Schlüssel für Entitlements & Config. */
  id: string;
  name: string;
  role: string;
  emoji: string;
  blurb: string;
  /** Code-Reifegrad: "comingSoon" ist NIE freischaltbar, auch nicht per DB-Row. */
  lifecycle: "active" | "comingSoon";
  /** Default-Entitlement für neu angelegte Orgs (nur bei lifecycle "active"). */
  enabledByDefault: boolean;
  /** Form der pro-Tenant-Anpassung (Inhalte & Texte). */
  configSchema: ZodType<C>;
  defaultConfig: C;
  /** Bei jeder breaking Schemaänderung erhöhen. Steuert Config-Migration & Snapshots. */
  configVersion: number;
  /** Migrationsfunktionen alt→neu, indexiert nach Quellversion. */
  configMigrations?: Record<number, (old: unknown) => unknown>;
  /** "Öffnen"-Ziel auf dem Dashboard, z.B. "/c/franz/projects". */
  entryPath: string;
  /** Hintergrundjobs/Events, die dieses Modul besitzt. */
  inngestFunctions?: InngestFunction.Any[];
}

export interface ResolvedCoworker<C = unknown> {
  manifest: CoworkerManifest<C>;
  availability: Availability;
  /** Nur gesetzt, wenn availability === "available". */
  config?: C;
}
