# Modulare KI-Mitarbeiter-Architektur — Design

**Datum:** 2026-06-14
**Status:** Überarbeitet nach Review (Findings #1–#5 eingearbeitet) — wartet auf Freigabe
**Branch:** `feat/modular-coworker-architecture`

## Problemstellung

Die App stellt am Hauptdashboard mehrere „KI-Mitarbeiter" (AI Coworker) dar. Aktuell
ist diese Liste hartcodiert (`EMPLOYEES`-Array in `src/app/(app)/page.tsx`) und die
Funktionalität des einzigen aktiven Mitarbeiters (Franz / Baudokumentation) ist quer
über `src/server/*`, `src/app/api/*`, `src/app/(app)/projects/*` und
`src/inngest/functions.ts` fest verkabelt.

Ziele des Umbaus:

1. **Kapselung** — jeder Mitarbeiter ist ein eigenständiges Modul mit klarer Schnittstelle.
2. **An/Aus pro Tenant** — Mitarbeiter lassen sich pro Kunde (Organization) per Config
   aktivieren/deaktivieren.
3. **Anpassung ohne Fork** — ein Kunde kann eine angepasste Variante eines Mitarbeiters
   erhalten, ohne dass ein Feature für alle Kunden ausgerollt werden muss.

## Nicht-Ziele (bewusst ausgeschlossen, YAGNI)

- **Tiefe pro-Tenant-Code-Injektion** (Adapter/Hooks pro Kunde, eigene Berechnungen,
  ERP/CRM-Integrationen). Anpassung beschränkt sich auf **Inhalte & Texte** (Config-as-Data).
  Falls später nötig, additiv über einen Adapter-Layer ergänzbar.
- **Felder-/Workflow-Konfigurator** (konfigurierbare Eingabefelder/Schritte) — nicht in dieser Spec.
- **Separate Deployments pro Kunde** — es gibt **eine geteilte SaaS-Instanz**; Tenants sind
  `Organization`s. Komposition geschieht zur **Laufzeit** (Runtime Composition), nicht zur Build-Zeit.
- **Admin-UI** für Entitlements/Config — spätere, eigene Spec. Vorerst Seed-Script + direkte DB.
- **Ausbau von Mira/Theo** zu echten Mitarbeitern — sie bleiben registrierte, deaktivierte Stubs.

## Recherche-Grundlage (Best Practices großer Anbieter)

| Thema | Gewähltes Pattern | Quelle/Vorbild |
|---|---|---|
| Code-Struktur | Modular Monolith + DDD Bounded Contexts | Shopify, Salesforce; Newman *Monolith to Microservices* |
| Modul-Grenzen | Hexagonal / Ports & Adapters + Plugin-Registry mit Manifest | Cockburn; VS Code, Atlassian Forge |
| An/Aus | Feature Flags in zwei Schichten (Entitlement vs. Release) | Fowler/Hodgson *Feature Toggles*; Meta Gatekeeper, Google Flagz |
| Anpassung ohne Fork | Config-as-Data / Metadaten-Layer (default → tenant-override) | Salesforce Platform Multitenancy |
| Auslieferung | Runtime Composition (ein Build, Registry + Flags entscheiden) | Standard-SaaS |

**Leitsatz:** Eine Kundenanpassung ist ein Flag + eine Config-Zeile — niemals ein Code-Branch.

## Scope dieser Spec

**Fundament + Franz migrieren.** Die Modul-/Registry-/Config-Infrastruktur bauen UND den
bestehenden Franz (Baudoku) als Referenz-Mitarbeiter darauf umstellen. Mira/Theo bleiben
registrierte, deaktivierte Stubs.

## Architektur

### Verzeichnisstruktur

```
src/coworkers/
  types.ts          # CoworkerManifest-Port (Interface) + zugehörige Typen
  registry.ts       # registerCoworker() / getCoworker(id) / getAllCoworkers()
  resolve.ts        # Entitlement-Auflösung + Config-Merge pro Organization
  guard.ts          # requireCoworker(orgId, id) → notFound() wenn nicht freigeschaltet
  index.ts          # importiert alle Mitarbeiter-Module (Selbst-Registrierung als Seiteneffekt)
  franz/
    manifest.ts     # id, name, role, emoji, blurb, configSchema, defaultConfig, entryPath, inngest-fns
    config.ts       # Zod-Schema + Defaults: Prompts, Branding, PDF-Vorlage, Labels
    server/         # baudoku-spezifische Logik (notes, photos, reports, docgen, pdf) — Franz besitzt sie
    ui/             # Projekt-/Aufnahme-/Galerie-/Report-UI
  mira/manifest.ts  # Stub: enabledByDefault: false, leeres configSchema
  theo/manifest.ts  # Stub: enabledByDefault: false, leeres configSchema
```

Geteilte Primitive bleiben unter `src/server/` und werden von allen Modulen gemeinsam genutzt:
`auth/`, `db.ts`, `storage/`, `log.ts`. `projects/` bleibt vorerst geteilt (Projekt ist die
gemeinsame Klammer, an der Notes/Photos/Reports hängen).

### Der Port: CoworkerManifest

```ts
// src/coworkers/types.ts
import type { ZodType } from "zod";
import type { InngestFunction } from "inngest";

export interface CoworkerManifest<C = unknown> {
  /** Stabile ID, z.B. "franz" — Schlüssel für Entitlements & Config. */
  id: string;
  /** Dashboard-Karte. */
  name: string;
  role: string;
  emoji: string;
  blurb: string;
  /**
   * Reifegrad des Moduls im CODE (nicht pro Tenant!):
   * - "active"     → fertig, kann pro Org freigeschaltet werden.
   * - "comingSoon" → Teaser; KANN NICHT freigeschaltet werden, auch nicht per DB-Row.
   * Trennt „technisch verfügbar" von „dieser Kunde hat es gebucht" (Entitlement).
   */
  lifecycle: "active" | "comingSoon";
  /**
   * Default-Entitlement für NEU angelegte Orgs (nur relevant bei lifecycle "active").
   * false = exklusiv/opt-in: muss pro Org bewusst per OrgModule-Row aktiviert werden.
   */
  enabledByDefault: boolean;
  /** Form der pro-Tenant-Anpassung (Inhalte & Texte). */
  configSchema: ZodType<C>;
  /** Basiswerte, die per Tenant-Override teil-überschrieben werden. */
  defaultConfig: C;
  /**
   * Ganzzahl, bei jeder breaking Schemaänderung erhöht. Steuert Config-Migrationen
   * und das Versions-Stempeln gespeicherter Config-Snapshots. Siehe „Config-Evolution".
   */
  configVersion: number;
  /** Migrationsfunktionen alt→neu, indexiert nach Quellversion. Optional. */
  configMigrations?: Record<number, (old: unknown) => unknown>;
  /** "Öffnen"-Ziel auf dem Dashboard, z.B. "/c/franz". */
  entryPath: string;
  /** Hintergrundjobs/Events, die dieses Modul besitzt. Optional. */
  inngestFunctions?: InngestFunction.Any[];
}
```

**Drei orthogonale Zustände — strikt getrennt halten:**

| Zustand | Ebene | Werte | Bedeutung |
|---|---|---|---|
| **lifecycle** | Code/Manifest | `active` / `comingSoon` | Ist das Modul fertig gebaut? `comingSoon` ist nie freischaltbar. |
| **entitlement** | pro Org (DB) | `enabled` true/false | Hat dieser Kunde den Mitarbeiter gebucht? Nur bei `active` wirksam. |
| **kill-switch** | global (Env) | in `DISABLED_COWORKERS` | Notabschaltung für alle (Provider-Störung), unabhängig von Buchung. |

### Registry

```ts
// src/coworkers/registry.ts
const registry = new Map<string, CoworkerManifest<any>>();

export function registerCoworker<C>(m: CoworkerManifest<C>): void; // dup-id → throw
export function getCoworker(id: string): CoworkerManifest | undefined;
export function getAllCoworkers(): CoworkerManifest[];
```

`src/coworkers/index.ts` importiert jedes `*/manifest.ts`, das sich beim Import via
`registerCoworker(...)` selbst einträgt. Eine einzige Import-Stelle für alle Module.

### Datenmodell (Prisma)

```prisma
model OrgModule {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  coworkerId    String           // entspricht CoworkerManifest.id, z.B. "franz"
  enabled       Boolean  @default(true)
  config        Json?            // Tenant-Overrides, validiert gegen configSchema
  configVersion Int      @default(0) // Schemaversion, gegen die `config` geschrieben wurde
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([orgId, coworkerId])
  @@index([orgId])
}
```

`Organization` erhält die Gegenrelation `modules OrgModule[]`.

**Job-Records: Config-Snapshot + terminaler Abbruch-Zustand** (siehe Findings #3, #4).
Hintergrundjob-erzeugende Records (`Note`, `Report`) erhalten:

```prisma
enum TranscriptStatus { pending  done  failed  cancelled }   // + cancelled
enum ReportStatus     { pending  done  failed  cancelled }   // + cancelled

model Note {
  // ... bestehend ...
  configSnapshot     Json?    // effektive Franz-Config beim Enqueue (reproduzierbarer Retry)
  configVersion      Int?     // Version dieses Snapshots
}

model Report {
  // ... bestehend ...
  configSnapshot     Json?    // effektive Franz-Config beim Anlegen
  configVersion      Int?     // Version dieses Snapshots
}
```

`cancelled` ist terminal (nicht `pending`) und entsteht ausschließlich durch einen
kontrollierten Übergang im Job, wenn der Coworker zwischen Enqueue und Ausführung
deaktiviert oder kill-switched wurde. Siehe „Hintergrundjobs".

### Auflösung zur Laufzeit (`resolve.ts`)

```ts
type Availability =
  | "available"    // active, entitled, nicht kill-switched → nutzbar
  | "comingSoon"   // lifecycle "comingSoon" → Teaser, nicht buchbar
  | "notEntitled"  // active, aber diese Org hat es nicht gebucht
  | "killSwitched" // global per Env abgeschaltet

type ResolvedCoworker<C> = {
  manifest: CoworkerManifest<C>;
  availability: Availability;
  config: C;            // nur gesetzt wenn availability === "available"
};

getResolvedCoworkers(orgId): Promise<ResolvedCoworker[]>   // ALLE, je mit availability
getAvailableCoworkers(orgId): Promise<ResolvedCoworker[]>  // nur availability === "available"
getResolvedCoworker(orgId, id): Promise<ResolvedCoworker | null>
isAvailable(orgId, id): Promise<boolean>                   // Convenience für Guards
```

Auflösungsreihenfolge je Mitarbeiter (erste zutreffende Regel gewinnt):
1. `lifecycle === "comingSoon"` → **`comingSoon`** (egal welche DB-Rows existieren —
   ein nicht fertig gebauter Mitarbeiter ist niemals freischaltbar).
2. `id ∈ DISABLED_COWORKERS` (Env) → **`killSwitched`**.
3. Entitlement bestimmen: `OrgModule.enabled` falls Row existiert, sonst `manifest.enabledByDefault`.
   - `false` → **`notEntitled`**.
   - `true`  → **`available`** + Config auflösen.

**Config-Auflösung** (nur bei `available`):
- Falls `OrgModule.config` vorhanden und `OrgModule.configVersion < manifest.configVersion`:
  `configMigrations` der Reihe nach anwenden (siehe „Config-Evolution").
- `deepMerge(manifest.defaultConfig, migratedOverride ?? {})`, dann `configSchema.parse(...)`.
- Schlägt die Validierung fehl → **laut** loggen (Org-ID, Coworker, Zod-Fehler) und auf
  `defaultConfig` zurückfallen. Der Fallback ist eine Sicherung, kein stiller Normalzustand —
  er wird auf Fehler-Level geloggt, damit kaputte Kundenkonfig sichtbar wird.

**Exklusiver Mitarbeiter für einen Kunden:** Manifest `lifecycle: "active"`,
`enabledByDefault: false` + genau eine `OrgModule`-Row mit `enabled: true` für diese Org.

**Beziehung der Begriffe:** `lifecycle` ist Code-Zustand (alle Tenants gleich),
`availability` ist das pro-Org-Ergebnis aus lifecycle + Entitlement + kill-switch.

### Durchsetzung (Defense in Depth)

**Grundsatz:** Das Page-Layout ist KEIN Sicherheits-Gate — es schützt nur das gerenderte
UI unter `/c/[coworker]/*`. API-Routen, Server Actions, Dateidownloads und Inngest-Jobs
laufen außerhalb dieses Layouts und MÜSSEN jeweils eigenständig gegated werden. Das Gate
sitzt in der **Service-/Route-Schicht**, nicht in der UI.

`guard.ts` stellt bereit:
```ts
requireAvailable(orgId, coworkerId): Promise<ResolvedCoworker>  // wirft 403/404 wenn nicht "available"
assertProjectCoworker(orgId, projectId, coworkerId)            // Ressource→Coworker-Zuordnung
```

Das Gate greift an **fünf** Stellen:

1. **Dashboard** (`src/app/(app)/page.tsx`) — Karten aus `getResolvedCoworkers(orgId)`:
   `available` → „Öffnen", `comingSoon` → „bald verfügbar", `notEntitled`/`killSwitched`
   → nicht gerendert. Ersetzt das hartcodierte `EMPLOYEES`-Array.
2. **Coworker-Routesegment** (`/c/[coworker]/layout.tsx`) — `requireAvailable` für die UX
   (sauberes 404 statt kaputter Seite). Reine Bequemlichkeit, kein Verlass darauf.
3. **API-Routen** — JEDER Franz-Handler ruft `requireAvailable(orgId, "franz")` am Anfang.
   Betrifft konkret: `api/projects/route.ts`, `api/projects/[id]/notes/**`,
   `api/projects/[id]/photos/**`, `api/projects/[id]/reports/**` inkl. der `retry`-Routen.
4. **Server Actions** — `projects/new/action.ts` und alle weiteren Franz-Actions gaten
   ebenso am Anfang (Server Actions sind eigene Endpunkte, nicht vom Layout geschützt).
5. **Dateidownloads** (`api/files/[...key]/route.ts`) — zusätzlich zur bestehenden
   Org-Scope-Prüfung: die zur Datei gehörende Ressource (Note/Photo/Report → Project → Org)
   ermitteln und `requireAvailable(orgId, "franz")` prüfen. Verhindert, dass Dateien eines
   deaktivierten Mitarbeiters weiter ausgeliefert werden.
6. **Inngest-Funktionen** — Guard am Funktionsanfang (siehe „Hintergrundjobs" für den
   definierten Abbruchpfad).

Ein **Integrationstest** verifiziert, dass bei deaktiviertem Franz jeder dieser Endpunkte
403/404 liefert — nicht nur das Dashboard. Damit ist „unsichtbar ≠ unerreichbar" abgesichert.

### Routing

Eigener Namespace mit Guard-Layout:

```
src/app/(app)/c/[coworker]/
  layout.tsx        # requireCoworker(orgId, params.coworker) — gemeinsames Gate
  ...               # Franz' Projekt-UI zieht hierher (vorher unter /projects)
```

Franz' bisherige Routen `/projects/*` wandern nach `/c/franz/projects/*`. Der Dashboard-Link
kommt aus `manifest.entryPath`. (Akzeptierte Konsequenz: URL-Änderung bei Franz.)

### Grenzen erzwingen

`dependency-cruiser`-Regel (oder ESLint-`no-restricted-imports`): Module unter
`src/coworkers/<id>/` dürfen nicht die Interna eines anderen `src/coworkers/<other>/`
importieren. Erlaubt sind: `src/coworkers/types`, `src/coworkers/registry` und geteilte
`src/server/{auth,db,storage,log}`-Primitive. Macht die Kapselung im CI überprüfbar.

### Config-Konsum bei Franz

Hardcodierte Texte/Vorlagen, die pro Tenant variieren sollen, werden aus `effectiveConfig`
gelesen statt aus Konstanten:
- KI-Prompts in `docgen` (Berichtserstellung),
- Branding/Logo + Vorlagenwahl im PDF (`report-document.tsx`),
- sichtbare Labels/Bezeichnungen.

`franz/config.ts` definiert das Zod-Schema dieser Werte samt Defaults (= heutiges Verhalten,
damit die Migration verhaltensneutral ist).

### Hintergrundjobs (Snapshot + kontrollierter Abbruch)

Transkription (Note) und Berichtserstellung (Report) laufen asynchron via Inngest. Zwischen
Enqueue und Ausführung kann sich der Zustand ändern. Zwei Regeln:

**Config-Snapshot beim Enqueue (Finding #4).** Beim Anlegen der Note/des Reports wird die
zu diesem Zeitpunkt `available` aufgelöste effektive Config in `configSnapshot` gespeichert,
zusammen mit `configVersion`. Der Job liest die Config **ausschließlich aus dem Snapshot**,
nicht erneut zur Laufzeit. Damit erzeugen verzögerte Ausführung und Retry reproduzierbare
Ergebnisse, auch wenn Prompts/Branding zwischenzeitlich geändert wurden. Retry verwendet
denselben Snapshot.

**Kontrollierter Abbruch statt Hängenbleiben (Finding #3).** Am Funktionsanfang prüft der
Job `isAvailable(orgId, "franz")`. Ist der Mitarbeiter nicht mehr `available` (deaktiviert
oder kill-switched):
- Der Record wird **kontrolliert auf `cancelled`** gesetzt (terminal), nicht auf `pending`
  belassen. Begründung wird geloggt.
- Die UI zeigt `cancelled` mit klarer Meldung („Mitarbeiter derzeit deaktiviert").
- **Retry-Politik:** `cancelled` ist retry-fähig, sobald der Mitarbeiter wieder `available`
  ist; ein Retry bei weiterhin nicht-verfügbarem Coworker wird abgelehnt. (Im Unterschied
  zu `failed`, das einen echten Verarbeitungsfehler markiert.)
- Idempotenz bleibt gewahrt: bereits auf `done`/`cancelled` stehende Records werden nicht
  erneut verarbeitet.

### Config-Evolution (Versionierung & Migration)

Schemaänderungen dürfen bestehende Tenant-Overrides nicht still entwerten (Finding #5).

- **`configVersion`** im Manifest wird bei jeder breaking Änderung erhöht. Gespeicherte
  Overrides (`OrgModule.configVersion`) und Snapshots (`Note/Report.configVersion`) tragen
  die Version, gegen die sie geschrieben wurden.
- **Migration beim Lesen:** liegt eine ältere Version vor, werden `configMigrations` in
  aufsteigender Reihenfolge angewandt, bevor gemerged/validiert wird. Optional schreibt ein
  Wartungsjob migrierte Overrides zurück (lazy-on-read genügt für den MVP).
- **Startup-Selbstvalidierung:** beim App-Start (bzw. im Test) wird für jedes Manifest
  geprüft, dass `configSchema.parse(defaultConfig)` erfolgreich ist. Ein Manifest mit
  Default, der sein eigenes Schema verletzt, ist ein harter Startfehler — verhindert, dass
  ein fehlerhaftes Default-Set unbemerkt alle Tenants auf einen ungültigen Zustand zwingt.
- Ein **fehlgeschlagener Override-Parse** nach versuchter Migration ist KEIN stiller
  Default-Fallback im Verborgenen: er wird auf Error-Level mit Org-/Coworker-Kontext
  geloggt (siehe `resolve.ts`), sodass kaputte Kundenkonfig auffällt und korrigiert wird.

## Datenfluss (Beispiel: Dashboard-Aufruf)

```
Request (User → Org-Kontext aus Session)
  → getResolvedCoworkers(orgId)
      → getAllCoworkers() (Registry)
      → OrgModule-Rows der Org laden
      → je Mitarbeiter: availability auflösen (lifecycle → kill-switch → entitlement),
        bei "available" config migrieren+mergen+validieren
  → Dashboard: "available" → Öffnen, "comingSoon" → bald, sonst nicht gerendert
```

```
Request (User → POST /api/projects/123/reports)  // API, NICHT vom Layout geschützt
  → Handler: requireAvailable(orgId, "franz") → 403/404 falls nicht available
  → Report anlegen + effektive Config als configSnapshot (+configVersion) speichern
  → Inngest-Event enqueuen
  → Job-Start: isAvailable? nein → Record auf "cancelled"; ja → Snapshot-Config nutzen
```

## Fehlerbehandlung

- **Ungültige Tenant-Config** (auch nach Migration) → Error-Level loggen (Org/Coworker/Zod),
  auf `defaultConfig` zurückfallen; andere Mitarbeiter bleiben unberührt. Kein App-weiter Crash.
- **Manifest-Default verletzt eigenes Schema** → harter Startfehler (Startup-Selbstvalidierung).
- **Unbekannte `coworkerId`** in Route → `notFound()`.
- **Duplikat-ID** bei Registrierung → harter Fehler beim Start (Programmierfehler, früh sichtbar).
- **Coworker zwischen Enqueue und Job-Start deaktiviert/kill-switched** → Record kontrolliert
  auf `cancelled` (terminal), niemals dauerhaft `pending`; idempotent.

## Teststrategie

- **Registry:** Registrierung, Duplikat-Erkennung, `getAll/get`.
- **resolve.ts:** availability-Matrix (lifecycle `comingSoon` → nie buchbar; kill-switch-Vorrang;
  Entitlement-Row vorhanden/abwesend → Fallback auf `enabledByDefault`); Config-Merge
  (default + partieller Override); Migration alt→neu vor Validierung; lauter Error-Log + Fallback
  bei kaputter Config.
- **guard.ts:** `available` → ok; `comingSoon`/`notEntitled`/`killSwitched` → 403/404.
- **API-Bypass-Test (Finding #1):** bei deaktiviertem Franz liefern ALLE Franz-Endpunkte
  (projects/notes/photos/reports inkl. retry), Server Actions und `api/files/[...key]`
  403/404 — nicht nur das Dashboard.
- **Job-Lifecycle (Finding #3):** Coworker nach Enqueue deaktiviert → Record wird `cancelled`,
  nicht `pending`; Retry abgelehnt solange nicht `available`, erlaubt sobald wieder `available`.
- **Config-Snapshot (Finding #4):** Job nutzt `configSnapshot`, nicht Live-Config; geänderte
  Live-Config beeinflusst laufenden/retry-ten Job nicht.
- **Config-Evolution (Finding #5):** Startup-Selbstvalidierung schlägt bei kaputtem Default an;
  alter Override wird vor Validierung migriert.
- **Migration verhaltensneutral:** bestehende Franz-Tests (notes/photos/reports/docgen/pdf)
  laufen nach dem Verschieben unverändert grün; Default-Config reproduziert heutiges Verhalten.
- **Grenzregel:** dependency-cruiser-Check schlägt bei modulübergreifendem Interna-Import an.

## Migrationsschritte (grobe Reihenfolge, Detail folgt im Plan)

1. Prisma: `OrgModule` (+ `configVersion`) + Relation; `cancelled` zu `TranscriptStatus`/
   `ReportStatus`; `configSnapshot`/`configVersion` an `Note`/`Report`. Migration + Seed
   (Franz für bestehende Orgs `enabled: true`).
2. `coworkers/`-Fundament: `types` (mit `lifecycle`/`configVersion`), `registry`, `resolve`
   (availability-Matrix + Config-Migration), `guard` (`requireAvailable`/`isAvailable`),
   `index`, Startup-Selbstvalidierung.
3. Franz-Manifest (`lifecycle: "active"`) + `config.ts` (Defaults = heutiges Verhalten).
4. Franz-Code unter `coworkers/franz/{server,ui}` einsortieren (verhaltensneutral, Imports anpassen).
5. Routing nach `/c/franz/*` + Guard-Layout; Dashboard auf `getResolvedCoworkers` umstellen
   (available/comingSoon/sonst).
6. **Guards in alle Franz-API-Routen, Server Actions und `api/files/[...key]`** (Finding #1).
7. Franz Config-Konsum (Prompts/Branding/Labels aus `effectiveConfig`).
8. Inngest: Snapshot beim Enqueue, `isAvailable`-Guard + `cancelled`-Übergang im Job
   (Findings #3, #4); Retry-Politik in den `retry`-Routen.
9. Mira/Theo Stub-Manifeste (`lifecycle: "comingSoon"`).
10. dependency-cruiser-Grenzregel + CI.

## Offene Punkte für spätere Specs

- Super-Admin-UI zur Verwaltung von Entitlements/Config.
- Tiefere Anpassung (Felder/Workflow, eigene Logik/Integrationen) via Adapter-Layer.
- Mira/Theo als echte Mitarbeiter.
