# Modulare KI-Mitarbeiter-Architektur — Design

**Datum:** 2026-06-14
**Status:** Genehmigt (Design)
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
  /** Wird ein Mitarbeiter bei neu angelegten Orgs automatisch freigeschaltet? */
  enabledByDefault: boolean;
  /** Form der pro-Tenant-Anpassung (Inhalte & Texte). */
  configSchema: ZodType<C>;
  /** Basiswerte, die per Tenant-Override teil-überschrieben werden. */
  defaultConfig: C;
  /** "Öffnen"-Ziel auf dem Dashboard, z.B. "/c/franz". */
  entryPath: string;
  /** Hintergrundjobs/Events, die dieses Modul besitzt. Optional. */
  inngestFunctions?: InngestFunction.Any[];
}
```

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
  id         String   @id @default(cuid())
  orgId      String
  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  coworkerId String              // entspricht CoworkerManifest.id, z.B. "franz"
  enabled    Boolean  @default(true)
  config     Json?               // Tenant-Overrides, validiert gegen configSchema
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([orgId, coworkerId])
  @@index([orgId])
}
```

`Organization` erhält die Gegenrelation `modules OrgModule[]`.

### Auflösung zur Laufzeit (`resolve.ts`)

```ts
type ResolvedCoworker<C> = {
  manifest: CoworkerManifest<C>;
  enabled: boolean;
  config: C;            // deepMerge(defaultConfig, OrgModule.config), per Zod validiert
};

getResolvedCoworkers(orgId): Promise<ResolvedCoworker[]>   // alle, mit enabled-Flag
getEnabledCoworkers(orgId): Promise<ResolvedCoworker[]>    // nur enabled === true
getResolvedCoworker(orgId, id): Promise<ResolvedCoworker | null>
```

Regeln:
- **enabled** = `OrgModule.enabled`, falls Row existiert; sonst Fallback auf `manifest.enabledByDefault`.
- **config** = `deepMerge(manifest.defaultConfig, OrgModule.config ?? {})`, anschließend
  `manifest.configSchema.parse(...)`. Schlägt die Validierung fehl → Log + Fallback auf
  `defaultConfig` (kein harter Crash für andere Mitarbeiter).
- **Release/Kill-Switch-Schicht** (separat von Entitlements): eine Env-Konstante
  `DISABLED_COWORKERS` (kommagetrennte IDs) blendet Mitarbeiter global aus —
  für unfertige Module oder Provider-Störungen. Wird VOR dem Entitlement-Check angewandt.

**Exklusiver Mitarbeiter für einen Kunden:** Manifest mit `enabledByDefault: false` +
genau eine `OrgModule`-Row mit `enabled: true` für diese eine Org. Kein Sondermechanismus.

### Durchsetzung (Defense in Depth)

Das Entitlement-Gate greift an drei Stellen, damit deaktivierte Module unerreichbar sind,
nicht nur unsichtbar:

1. **Dashboard** (`src/app/(app)/page.tsx`) — rendert die Karten aus
   `getEnabledCoworkers(orgId)` statt aus dem hartcodierten `EMPLOYEES`-Array.
   Deaktivierte/„bald"-Mitarbeiter werden über Manifest-Metadaten dargestellt.
2. **Routes / Server-Actions** — `requireCoworker(orgId, "franz")` (in `guard.ts`) ruft
   `notFound()`/wirft, wenn nicht freigeschaltet. Im Layout des Coworker-Routesegments verankert.
3. **Inngest-Funktionen** — verarbeiten nur Events von Orgs, für die der Mitarbeiter
   freigeschaltet ist (Guard am Funktionsanfang).

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

## Datenfluss (Beispiel: Dashboard-Aufruf)

```
Request (User → Org-Kontext aus Session)
  → getEnabledCoworkers(orgId)
      → getAllCoworkers() (Registry)
      → OrgModule-Rows der Org laden
      → je Mitarbeiter: enabled auflösen, DISABLED_COWORKERS anwenden, config mergen+validieren
  → Dashboard rendert Karten der enabled-Mitarbeiter (entryPath als Link)
```

```
Request (User → /c/franz/projects/123)
  → layout.tsx: requireCoworker(orgId, "franz") → 404 falls nicht freigeschaltet
  → Franz-UI lädt effectiveConfig + Domänendaten
```

## Fehlerbehandlung

- **Ungültige Tenant-Config** → loggen, auf `defaultConfig` zurückfallen; andere Mitarbeiter
  bleiben unberührt. Kein App-weiter Crash.
- **Unbekannte `coworkerId`** in Route → `notFound()`.
- **Duplikat-ID** bei Registrierung → harter Fehler beim Start (Programmierfehler, früh sichtbar).
- **Inngest-Event für nicht-freigeschaltete Org** → Funktion bricht früh und idempotent ab.

## Teststrategie

- **Registry:** Registrierung, Duplikat-Erkennung, `getAll/get`.
- **resolve.ts:** enabled-Auflösung (Row vorhanden/abwesend → Fallback auf `enabledByDefault`);
  Config-Merge (default + partieller Override); Validierungs-Fallback bei kaputter Config;
  `DISABLED_COWORKERS`-Vorrang.
- **guard.ts:** freigeschaltet → ok; nicht freigeschaltet → `notFound()`/throw.
- **Migration verhaltensneutral:** bestehende Franz-Tests (notes/photos/reports/docgen/pdf)
  laufen nach dem Verschieben unverändert grün; Default-Config reproduziert heutiges Verhalten.
- **Grenzregel:** dependency-cruiser-Check schlägt bei modulübergreifendem Interna-Import an.

## Migrationsschritte (grobe Reihenfolge, Detail folgt im Plan)

1. Prisma: `OrgModule` + Relation, Migration, Seed (Franz für bestehende Orgs `enabled: true`).
2. `coworkers/`-Fundament: `types`, `registry`, `resolve`, `guard`, `index`.
3. Franz-Manifest + `config.ts` (Defaults = heutiges Verhalten).
4. Franz-Code unter `coworkers/franz/{server,ui}` einsortieren (verhaltensneutral, Imports anpassen).
5. Routing nach `/c/franz/*` + Guard-Layout; Dashboard auf Registry umstellen.
6. Franz Config-Konsum (Prompts/Branding/Labels aus `effectiveConfig`).
7. Inngest-Guard.
8. Mira/Theo Stub-Manifeste (`enabledByDefault: false`).
9. dependency-cruiser-Grenzregel + CI.

## Offene Punkte für spätere Specs

- Super-Admin-UI zur Verwaltung von Entitlements/Config.
- Tiefere Anpassung (Felder/Workflow, eigene Logik/Integrationen) via Adapter-Layer.
- Mira/Theo als echte Mitarbeiter.
