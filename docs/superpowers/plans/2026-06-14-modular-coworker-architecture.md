# Modulare KI-Mitarbeiter-Architektur — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeden KI-Mitarbeiter als gekapseltes Modul (Manifest + Registry + Config) bauen, pro Organization per DB-Config freischalt- und anpassbar, und Franz (Baudoku) als Referenz darauf migrieren.

**Architecture:** Modular Monolith. Eine zentrale Registry hält Coworker-Manifeste. Pro Org entscheidet eine `OrgModule`-Tabelle über Verfügbarkeit (`availability` aus lifecycle + Entitlement + Kill-Switch) und liefert gemergte, versionierte Config-as-Data. Gegated wird in der Service-/Route-Schicht (Defense in Depth), nicht nur im UI. Hintergrundjobs arbeiten mit einem Config-Snapshot und brechen kontrolliert auf `cancelled` ab, wenn der Coworker zwischen Enqueue und Ausführung deaktiviert wird.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / PostgreSQL, Inngest 4, Zod 4, Vitest 4, TypeScript 5, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-14-modular-coworker-architecture-design.md`

**Testkommando (Einzeldatei):** `pnpm exec vitest run <pfad>` — Erwartung jeweils unten angegeben.

---

## Datei-Übersicht (was wird angefasst)

**Neu — Fundament (`src/coworkers/`):**
- `types.ts` — `CoworkerManifest`-Port, `Availability`, `ResolvedCoworker`
- `merge.ts` — `deepMerge` / `isPlainObject`
- `registry.ts` — `registerCoworker` / `getCoworker` / `getAllCoworkers` / `clearRegistry`
- `env.ts` — `disabledCoworkers()` (Kill-Switch aus `DISABLED_COWORKERS`)
- `resolve.ts` — pure `resolveAvailability` / `resolveConfig` + DB-Wrapper `getResolvedCoworker(s)` / `isAvailable`
- `guard.ts` — `requireAvailable` (notFound) / `isAvailable`-Reexport für Routen
- `validate.ts` — `validateRegisteredManifests()` (Startup-Selbstvalidierung)
- `index.ts` — registriert alle Module + ruft Selbstvalidierung
- `franz/manifest.ts`, `franz/config.ts` — Franz als erstes Modul
- `mira/manifest.ts`, `theo/manifest.ts` — `comingSoon`-Stubs
- Tests: je `*.test.ts` neben der Datei.

**Modifiziert — Verdrahtung & Findings:**
- `prisma/schema.prisma` — `OrgModule`, `cancelled`-Enums, `Report.configSnapshot/configVersion`
- `scripts/seed-coworkers.ts` (neu) — Backfill Franz für bestehende Orgs
- `src/app/(app)/page.tsx` — Dashboard aus Registry statt `EMPLOYEES`
- `src/app/(app)/c/franz/layout.tsx` (neu) — Guard-Layout
- `src/app/(app)/projects/**` → `src/app/(app)/c/franz/projects/**` (Move)
- `next.config.ts` — Redirect `/projects` → `/c/franz/projects`
- Alle Franz-API-Routen + `projects/new/action.ts` + `api/files/[...key]/route.ts` — Guards
- `src/server/reports/{reports.service,generate-report}.ts`, `src/server/notes/transcribe-note.ts` — Snapshot + `cancelled`
- Retry-Routen (notes/reports) — `cancelled` retrybar + Verfügbarkeitsprüfung
- `src/server/docgen/{doc-generator,claude-doc-generator}.ts` — System-Prompt aus Config
- `.dependency-cruiser.cjs` (neu) — Grenzregel

---

## Task 1: Prisma — OrgModule, cancelled-Status, Report-Snapshot

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `scripts/seed-coworkers.ts`

- [ ] **Step 1: `OrgModule`-Modell + Relation ergänzen**

In `prisma/schema.prisma` an `Organization` die Gegenrelation ergänzen (innerhalb des bestehenden `model Organization`-Blocks, nach `projects  Project[]`):

```prisma
  modules   OrgModule[]
```

Am Dateiende neues Modell anhängen:

```prisma
model OrgModule {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  coworkerId    String
  enabled       Boolean  @default(true)
  config        Json?
  configVersion Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([orgId, coworkerId])
  @@index([orgId])
}
```

- [ ] **Step 2: `cancelled` zu beiden Status-Enums + Snapshot-Felder an Report**

`TranscriptStatus` und `ReportStatus` je um `cancelled` erweitern:

```prisma
enum TranscriptStatus {
  pending
  done
  failed
  cancelled
}

enum ReportStatus {
  pending
  done
  failed
  cancelled
}
```

Im `model Report` nach `reportJson  Json?` ergänzen:

```prisma
  configSnapshot Json?
  configVersion  Int?
```

> Hinweis (bewusste Abweichung von der Spec, mit dem User abgestimmt): `Note` bekommt **keinen** `configSnapshot`, da die Transkription aktuell keine konfigurierbare Verhaltensabhängigkeit hat (YAGNI). `Note` erhält nur `cancelled`. Sobald Transkription config-abhängig wird, wird das Feld nachgezogen.

- [ ] **Step 3: Migration erzeugen**

Run: `pnpm prisma migrate dev --name org-module-and-cancelled`
Expected: Migration wird erstellt und angewendet; `prisma generate` läuft automatisch; keine Fehler.

- [ ] **Step 4: Seed-Skript für bestehende Orgs schreiben**

Create `scripts/seed-coworkers.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Backfill: schaltet Franz für alle bestehenden Organisationen frei.
 * Idempotent über die @@unique([orgId, coworkerId])-Constraint (skipDuplicates).
 */
async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const result = await prisma.orgModule.createMany({
    data: orgs.map((o) => ({ orgId: o.id, coworkerId: "franz", enabled: true, configVersion: 0 })),
    skipDuplicates: true,
  });
  console.log(`seeded franz for ${result.count}/${orgs.length} orgs`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 5: Seed ausführen**

Run: `pnpm tsx scripts/seed-coworkers.ts`
Expected: `seeded franz for N/N orgs` (N = Anzahl Orgs), keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations scripts/seed-coworkers.ts
git commit -m "feat(coworkers): OrgModule table, cancelled status, report config snapshot"
```

---

## Task 2: Manifest-Port & Typen

**Files:**
- Create: `src/coworkers/types.ts`

- [ ] **Step 1: Typen schreiben**

Create `src/coworkers/types.ts`:

```ts
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
```

- [ ] **Step 2: Typprüfung**

Run: `pnpm exec tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/coworkers/types.ts
git commit -m "feat(coworkers): manifest port and resolved types"
```

---

## Task 3: deepMerge-Utility

**Files:**
- Create: `src/coworkers/merge.ts`
- Test: `src/coworkers/merge.test.ts`

- [ ] **Step 1: Failing Test schreiben**

Create `src/coworkers/merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deepMerge } from "./merge";

describe("deepMerge", () => {
  it("overrides scalar values", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 9 })).toEqual({ a: 1, b: 9 });
  });

  it("merges nested objects recursively", () => {
    expect(deepMerge({ x: { p: 1, q: 2 } }, { x: { q: 5 } })).toEqual({ x: { p: 1, q: 5 } });
  });

  it("keeps base when override key is absent", () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it("replaces arrays wholesale (no element merge)", () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] });
  });

  it("returns base unchanged when override is not a plain object", () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `pnpm exec vitest run src/coworkers/merge.test.ts`
Expected: FAIL — `deepMerge` ist nicht definiert.

- [ ] **Step 3: Implementierung schreiben**

Create `src/coworkers/merge.ts`:

```ts
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Tiefes Mergen von Plain-Objects: override gewinnt, verschachtelte Objekte werden
 * rekursiv gemergt, Arrays und Skalare werden ersetzt (nicht gemergt). Ist eine Seite
 * kein Plain-Object, gewinnt override (außer override ist undefined → base bleibt).
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `pnpm exec vitest run src/coworkers/merge.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/merge.ts src/coworkers/merge.test.ts
git commit -m "feat(coworkers): deepMerge utility for config overrides"
```

---

## Task 4: Registry

**Files:**
- Create: `src/coworkers/registry.ts`
- Test: `src/coworkers/registry.test.ts`

- [ ] **Step 1: Failing Test schreiben**

Create `src/coworkers/registry.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { CoworkerManifest } from "./types";
import { clearRegistry, getAllCoworkers, getCoworker, registerCoworker } from "./registry";

function fakeManifest(id: string): CoworkerManifest<{ v: string }> {
  return {
    id,
    name: id,
    role: "r",
    emoji: "🤖",
    blurb: "b",
    lifecycle: "active",
    enabledByDefault: true,
    configSchema: z.object({ v: z.string() }),
    defaultConfig: { v: "x" },
    configVersion: 0,
    entryPath: `/c/${id}`,
  };
}

afterEach(() => clearRegistry());

describe("registry", () => {
  it("registers and retrieves by id", () => {
    registerCoworker(fakeManifest("a"));
    expect(getCoworker("a")?.id).toBe("a");
  });

  it("lists all registered manifests", () => {
    registerCoworker(fakeManifest("a"));
    registerCoworker(fakeManifest("b"));
    expect(getAllCoworkers().map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("throws on duplicate id", () => {
    registerCoworker(fakeManifest("a"));
    expect(() => registerCoworker(fakeManifest("a"))).toThrow(/already registered/);
  });

  it("returns undefined for unknown id", () => {
    expect(getCoworker("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `pnpm exec vitest run src/coworkers/registry.test.ts`
Expected: FAIL — Modul/Funktionen nicht definiert.

- [ ] **Step 3: Implementierung schreiben**

Create `src/coworkers/registry.ts`:

```ts
import type { CoworkerManifest } from "./types";

const registry = new Map<string, CoworkerManifest<unknown>>();

export function registerCoworker<C>(manifest: CoworkerManifest<C>): void {
  if (registry.has(manifest.id)) {
    throw new Error(`Coworker "${manifest.id}" already registered`);
  }
  registry.set(manifest.id, manifest as CoworkerManifest<unknown>);
}

export function getCoworker(id: string): CoworkerManifest<unknown> | undefined {
  return registry.get(id);
}

export function getAllCoworkers(): CoworkerManifest<unknown>[] {
  return [...registry.values()];
}

/** Nur für Tests: leert die Registry. */
export function clearRegistry(): void {
  registry.clear();
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `pnpm exec vitest run src/coworkers/registry.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/registry.ts src/coworkers/registry.test.ts
git commit -m "feat(coworkers): central registry with duplicate-id guard"
```

---

## Task 5: Kill-Switch-Env-Helper

**Files:**
- Create: `src/coworkers/env.ts`
- Test: `src/coworkers/env.test.ts`

- [ ] **Step 1: Failing Test schreiben**

Create `src/coworkers/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { disabledCoworkers } from "./env";

const ORIG = process.env.DISABLED_COWORKERS;
afterEach(() => {
  process.env.DISABLED_COWORKERS = ORIG;
});

describe("disabledCoworkers", () => {
  it("parses a comma-separated, trimmed list", () => {
    process.env.DISABLED_COWORKERS = " franz , mira ";
    expect([...disabledCoworkers()].sort()).toEqual(["franz", "mira"]);
  });

  it("is empty when unset", () => {
    delete process.env.DISABLED_COWORKERS;
    expect(disabledCoworkers().size).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `pnpm exec vitest run src/coworkers/env.test.ts`
Expected: FAIL — `disabledCoworkers` nicht definiert.

- [ ] **Step 3: Implementierung schreiben**

Create `src/coworkers/env.ts`:

```ts
/** Global per Env abgeschaltete Coworker (Notabschaltung), getrennt vom DB-Entitlement. */
export function disabledCoworkers(): ReadonlySet<string> {
  return new Set(
    (process.env.DISABLED_COWORKERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `pnpm exec vitest run src/coworkers/env.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/env.ts src/coworkers/env.test.ts
git commit -m "feat(coworkers): kill-switch env helper"
```

---

## Task 6: Auflösung — pure Logik (availability + config)

**Files:**
- Create: `src/coworkers/resolve.ts`
- Test: `src/coworkers/resolve.test.ts`

Diese Task implementiert NUR die pure Logik (kein DB-Zugriff). DB-Wrapper folgen in Task 7.

- [ ] **Step 1: Failing Test schreiben**

Create `src/coworkers/resolve.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { CoworkerManifest } from "./types";
import { resolveAvailability, resolveConfig } from "./resolve";

type Cfg = { docgen: { systemPrompt: string }; labels: { a: string } };

function manifest(over: Partial<CoworkerManifest<Cfg>> = {}): CoworkerManifest<Cfg> {
  return {
    id: "franz",
    name: "Franz",
    role: "r",
    emoji: "👷",
    blurb: "b",
    lifecycle: "active",
    enabledByDefault: true,
    configSchema: z.object({
      docgen: z.object({ systemPrompt: z.string().min(1) }),
      labels: z.object({ a: z.string().min(1) }),
    }),
    defaultConfig: { docgen: { systemPrompt: "default" }, labels: { a: "Notizen" } },
    configVersion: 0,
    entryPath: "/c/franz",
    ...over,
  };
}

describe("resolveAvailability", () => {
  const empty = new Set<string>();

  it("comingSoon wins even if a DB row enables it", () => {
    const m = manifest({ lifecycle: "comingSoon" });
    expect(resolveAvailability(m, { enabled: true }, empty)).toBe("comingSoon");
  });

  it("kill-switch wins over entitlement", () => {
    expect(resolveAvailability(manifest(), { enabled: true }, new Set(["franz"]))).toBe("killSwitched");
  });

  it("available when entitled via row", () => {
    expect(resolveAvailability(manifest(), { enabled: true }, empty)).toBe("available");
  });

  it("notEntitled when row disables it", () => {
    expect(resolveAvailability(manifest(), { enabled: false }, empty)).toBe("notEntitled");
  });

  it("falls back to enabledByDefault when no row exists", () => {
    expect(resolveAvailability(manifest({ enabledByDefault: false }), null, empty)).toBe("notEntitled");
    expect(resolveAvailability(manifest({ enabledByDefault: true }), null, empty)).toBe("available");
  });
});

describe("resolveConfig", () => {
  it("returns defaults when no row/config", () => {
    expect(resolveConfig(manifest(), null)).toEqual(manifest().defaultConfig);
  });

  it("deep-merges a partial override over defaults", () => {
    const row = { config: { labels: { a: "Sprachnotizen" } }, configVersion: 0 };
    expect(resolveConfig(manifest(), row).labels.a).toBe("Sprachnotizen");
    expect(resolveConfig(manifest(), row).docgen.systemPrompt).toBe("default");
  });

  it("applies migrations before merge/validate", () => {
    const m = manifest({
      configVersion: 1,
      configMigrations: { 0: (old) => ({ ...(old as object), labels: { a: "migriert" } }) },
    });
    const row = { config: { docgen: { systemPrompt: "p" } }, configVersion: 0 };
    expect(resolveConfig(m, row).labels.a).toBe("migriert");
  });

  it("falls back to defaults and logs on invalid config", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const row = { config: { labels: { a: 123 } }, configVersion: 0 }; // a muss string sein
    expect(resolveConfig(manifest(), row, { orgId: "o1" })).toEqual(manifest().defaultConfig);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `pnpm exec vitest run src/coworkers/resolve.test.ts`
Expected: FAIL — Funktionen nicht definiert.

- [ ] **Step 3: Pure Logik implementieren**

Create `src/coworkers/resolve.ts`:

```ts
import { logError } from "@/server/log";
import { deepMerge } from "./merge";
import type { Availability, CoworkerManifest } from "./types";

type EntitlementRow = { enabled: boolean } | null;
type ConfigRow = { config: unknown; configVersion: number } | null;

/** Reihenfolge: lifecycle → kill-switch → entitlement (erste zutreffende Regel gewinnt). */
export function resolveAvailability(
  manifest: CoworkerManifest<unknown>,
  row: EntitlementRow,
  disabled: ReadonlySet<string>,
): Availability {
  if (manifest.lifecycle === "comingSoon") return "comingSoon";
  if (disabled.has(manifest.id)) return "killSwitched";
  const entitled = row ? row.enabled : manifest.enabledByDefault;
  return entitled ? "available" : "notEntitled";
}

/**
 * Migriert ältere Overrides, merged über Defaults und validiert. Bei ungültiger
 * Config: laut loggen und auf Defaults zurückfallen (Sicherung, kein stiller Normalzustand).
 */
export function resolveConfig<C>(
  manifest: CoworkerManifest<C>,
  row: ConfigRow,
  ctx?: { orgId: string },
): C {
  if (!row || row.config == null) return manifest.defaultConfig;

  let raw: unknown = row.config;
  for (let v = row.configVersion; v < manifest.configVersion; v++) {
    const migrate = manifest.configMigrations?.[v];
    if (migrate) raw = migrate(raw);
  }

  const merged = deepMerge(manifest.defaultConfig, raw);
  const parsed = manifest.configSchema.safeParse(merged);
  if (!parsed.success) {
    logError("coworker", "invalid tenant config, falling back to defaults", parsed.error, {
      coworker: manifest.id,
      orgId: ctx?.orgId,
    });
    return manifest.defaultConfig;
  }
  return parsed.data;
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `pnpm exec vitest run src/coworkers/resolve.test.ts`
Expected: PASS (alle Tests).

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/resolve.ts src/coworkers/resolve.test.ts
git commit -m "feat(coworkers): pure availability + config resolution"
```

---

## Task 7: Auflösung — DB-Wrapper

**Files:**
- Modify: `src/coworkers/resolve.ts`

DB-Wrapper werden integrationsnah über die echte Funktionssignatur abgesichert; reine Logik ist in Task 6 abgedeckt. Hier keine neuen Unit-Tests (würden nur Prisma mocken) — Verifikation per `tsc`.

- [ ] **Step 1: DB-Wrapper an `resolve.ts` anhängen**

Die zusätzlichen Imports an den **Anfang** von `src/coworkers/resolve.ts` zu den bestehenden Imports hinzufügen:

```ts
import { prisma } from "@/server/db";
import { getAllCoworkers, getCoworker } from "./registry";
import { disabledCoworkers } from "./env";
import type { ResolvedCoworker } from "./types";
```

Die folgenden Funktionen ans **Ende** der Datei anhängen:

```ts
export async function getResolvedCoworkers(orgId: string): Promise<ResolvedCoworker[]> {
  const rows = await prisma.orgModule.findMany({ where: { orgId } });
  const byId = new Map(rows.map((r) => [r.coworkerId, r]));
  const disabled = disabledCoworkers();

  return getAllCoworkers().map((manifest) => {
    const row = byId.get(manifest.id) ?? null;
    const availability = resolveAvailability(manifest, row, disabled);
    const config = availability === "available" ? resolveConfig(manifest, row, { orgId }) : undefined;
    return { manifest, availability, config };
  });
}

export async function getResolvedCoworker(orgId: string, id: string): Promise<ResolvedCoworker | null> {
  const manifest = getCoworker(id);
  if (!manifest) return null;
  const row = await prisma.orgModule.findUnique({
    where: { orgId_coworkerId: { orgId, coworkerId: id } },
  });
  const availability = resolveAvailability(manifest, row, disabledCoworkers());
  const config = availability === "available" ? resolveConfig(manifest, row, { orgId }) : undefined;
  return { manifest, availability, config };
}

export async function isAvailable(orgId: string, id: string): Promise<boolean> {
  const resolved = await getResolvedCoworker(orgId, id);
  return !!resolved && resolved.availability === "available";
}
```

> Hinweis: `orgId_coworkerId` ist der von Prisma generierte Name des `@@unique([orgId, coworkerId])`-Compound-Keys.

- [ ] **Step 2: Typprüfung**

Run: `pnpm exec tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Pure Tests erneut laufen lassen (Regression)**

Run: `pnpm exec vitest run src/coworkers/resolve.test.ts`
Expected: PASS (unverändert).

- [ ] **Step 4: Commit**

```bash
git add src/coworkers/resolve.ts
git commit -m "feat(coworkers): DB-backed resolution wrappers"
```

---

## Task 8: Guard

**Files:**
- Create: `src/coworkers/guard.ts`

`requireAvailable` nutzt Nexts `notFound()` (für Server Components/Layouts). API-Routen verwenden den `isAvailable`-Reexport und liefern ihre eigene `NextResponse`.

- [ ] **Step 1: Implementierung schreiben**

Create `src/coworkers/guard.ts`:

```ts
import { notFound } from "next/navigation";
import { getResolvedCoworker, isAvailable } from "./resolve";
import type { ResolvedCoworker } from "./types";

/** Für Server Components / Layouts: 404 wenn nicht "available", sonst liefert es den Resolved. */
export async function requireAvailable(orgId: string, coworkerId: string): Promise<ResolvedCoworker> {
  const resolved = await getResolvedCoworker(orgId, coworkerId);
  if (!resolved || resolved.availability !== "available") notFound();
  return resolved;
}

export { isAvailable, getResolvedCoworker };
```

- [ ] **Step 2: Typprüfung**

Run: `pnpm exec tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/coworkers/guard.ts
git commit -m "feat(coworkers): availability guard for routes and layouts"
```

---

## Task 9: Franz-Config (Schema + Defaults)

**Files:**
- Create: `src/coworkers/franz/config.ts`
- Test: `src/coworkers/franz/config.test.ts`

Defaults reproduzieren exakt das heutige Verhalten (System-Prompt + UI-Labels).

- [ ] **Step 1: Failing Test schreiben**

Create `src/coworkers/franz/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { franzConfigSchema, franzDefaultConfig } from "./config";

describe("franz config", () => {
  it("defaults satisfy the schema", () => {
    expect(franzConfigSchema.safeParse(franzDefaultConfig).success).toBe(true);
  });

  it("default system prompt is the German baudoku instruction", () => {
    expect(franzDefaultConfig.docgen.systemPrompt).toContain("Baudokumentation-Assistent");
  });

  it("rejects empty labels", () => {
    const bad = { ...franzDefaultConfig, labels: { ...franzDefaultConfig.labels, notesHeading: "" } };
    expect(franzConfigSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `pnpm exec vitest run src/coworkers/franz/config.test.ts`
Expected: FAIL — Modul nicht definiert.

- [ ] **Step 3: Implementierung schreiben**

Create `src/coworkers/franz/config.ts`. Der `systemPrompt`-Default ist exakt der heutige String aus `claude-doc-generator.ts` (Zeilen 52–65):

```ts
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
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `pnpm exec vitest run src/coworkers/franz/config.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/franz/config.ts src/coworkers/franz/config.test.ts
git commit -m "feat(franz): tenant config schema and behavior-neutral defaults"
```

---

## Task 10: Franz-Manifest + Mira/Theo-Stubs + Registrierung + Selbstvalidierung

**Files:**
- Create: `src/coworkers/franz/manifest.ts`
- Create: `src/coworkers/mira/manifest.ts`
- Create: `src/coworkers/theo/manifest.ts`
- Create: `src/coworkers/validate.ts`
- Test: `src/coworkers/validate.test.ts`
- Create: `src/coworkers/index.ts`

- [ ] **Step 1: Franz-Manifest schreiben**

Create `src/coworkers/franz/manifest.ts`:

```ts
import type { CoworkerManifest } from "../types";
import { franzConfigSchema, franzDefaultConfig, type FranzConfig } from "./config";

export const franzManifest: CoworkerManifest<FranzConfig> = {
  id: "franz",
  name: "Franz",
  role: "Baudokumentation",
  emoji: "👷",
  blurb:
    "Erfasst Mängel & Fortschritt per Sprachnotiz und Foto — und erstellt daraus auf Knopfdruck den fertigen PDF-Bericht.",
  lifecycle: "active",
  enabledByDefault: true,
  configSchema: franzConfigSchema,
  defaultConfig: franzDefaultConfig,
  configVersion: 0,
  entryPath: "/c/franz/projects",
};
```

- [ ] **Step 2: Mira- und Theo-Stubs schreiben**

Create `src/coworkers/mira/manifest.ts`:

```ts
import { z } from "zod";
import type { CoworkerManifest } from "../types";

export const miraManifest: CoworkerManifest<Record<string, never>> = {
  id: "mira",
  name: "Mira",
  role: "Angebote & Leistungen",
  emoji: "📐",
  blurb: "Erstellt Angebote und Leistungsbeschreibungen aus deinen Vorgaben.",
  lifecycle: "comingSoon",
  enabledByDefault: false,
  configSchema: z.object({}),
  defaultConfig: {},
  configVersion: 0,
  entryPath: "/c/mira",
};
```

Create `src/coworkers/theo/manifest.ts`:

```ts
import { z } from "zod";
import type { CoworkerManifest } from "../types";

export const theoManifest: CoworkerManifest<Record<string, never>> = {
  id: "theo",
  name: "Theo",
  role: "Bauzeit & Termine",
  emoji: "📅",
  blurb: "Plant Bauzeiten, behält Fristen und Wiedervorlagen im Blick.",
  lifecycle: "comingSoon",
  enabledByDefault: false,
  configSchema: z.object({}),
  defaultConfig: {},
  configVersion: 0,
  entryPath: "/c/theo",
};
```

- [ ] **Step 3: Selbstvalidierung — Failing Test**

Create `src/coworkers/validate.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { CoworkerManifest } from "./types";
import { clearRegistry, registerCoworker } from "./registry";
import { validateRegisteredManifests } from "./validate";

function m(id: string, defaultConfig: unknown): CoworkerManifest<unknown> {
  return {
    id,
    name: id,
    role: "r",
    emoji: "🤖",
    blurb: "b",
    lifecycle: "active",
    enabledByDefault: true,
    configSchema: z.object({ v: z.string() }),
    defaultConfig,
    configVersion: 0,
    entryPath: `/c/${id}`,
  };
}

afterEach(() => clearRegistry());

describe("validateRegisteredManifests", () => {
  it("passes when all defaults satisfy their schema", () => {
    registerCoworker(m("a", { v: "ok" }));
    expect(() => validateRegisteredManifests()).not.toThrow();
  });

  it("throws when a default violates its own schema", () => {
    registerCoworker(m("b", { v: 123 }));
    expect(() => validateRegisteredManifests()).toThrow(/defaultConfig/);
  });
});
```

- [ ] **Step 4: Test laufen lassen — muss fehlschlagen**

Run: `pnpm exec vitest run src/coworkers/validate.test.ts`
Expected: FAIL — `validateRegisteredManifests` nicht definiert.

- [ ] **Step 5: Selbstvalidierung implementieren**

Create `src/coworkers/validate.ts`:

```ts
import { getAllCoworkers } from "./registry";

/** Startup-Sicherung: jeder Manifest-Default MUSS sein eigenes Schema erfüllen. */
export function validateRegisteredManifests(): void {
  for (const manifest of getAllCoworkers()) {
    const result = manifest.configSchema.safeParse(manifest.defaultConfig);
    if (!result.success) {
      throw new Error(
        `Coworker "${manifest.id}" defaultConfig violates its schema: ${result.error.message}`,
      );
    }
  }
}
```

- [ ] **Step 6: Test laufen lassen — muss bestehen**

Run: `pnpm exec vitest run src/coworkers/validate.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 7: Zentrale Registrierung schreiben**

Create `src/coworkers/index.ts`:

```ts
import { registerCoworker } from "./registry";
import { validateRegisteredManifests } from "./validate";
import { franzManifest } from "./franz/manifest";
import { miraManifest } from "./mira/manifest";
import { theoManifest } from "./theo/manifest";

registerCoworker(franzManifest);
registerCoworker(miraManifest);
registerCoworker(theoManifest);

// Harter Startfehler, falls ein Default sein Schema verletzt.
validateRegisteredManifests();

export { getAllCoworkers, getCoworker } from "./registry";
export { getResolvedCoworkers, getResolvedCoworker, isAvailable } from "./resolve";
export { requireAvailable } from "./guard";
```

- [ ] **Step 8: Typprüfung + gesamte Coworker-Suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run src/coworkers`
Expected: keine TS-Fehler; alle Coworker-Tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/coworkers/franz/manifest.ts src/coworkers/mira src/coworkers/theo src/coworkers/validate.ts src/coworkers/validate.test.ts src/coworkers/index.ts
git commit -m "feat(coworkers): register franz + comingSoon stubs, startup self-validation"
```

---

## Task 11: Dashboard aus Registry speisen

**Files:**
- Modify: `src/app/(app)/page.tsx`

Ersetzt das hartcodierte `EMPLOYEES`-Array durch `getResolvedCoworkers(orgId)`. `available` → Öffnen-Link, `comingSoon` → „bald verfügbar", `notEntitled`/`killSwitched` → nicht gerendert.

- [ ] **Step 1: Seite umschreiben**

Replace the entire content of `src/app/(app)/page.tsx`:

```tsx
import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";
import { getResolvedCoworkers } from "@/coworkers";
import type { ResolvedCoworker } from "@/coworkers/types";

export default async function EmployeesPage() {
  const session = await requireSession();
  const resolved = await getResolvedCoworkers(session.orgId);
  // Nur buchbare oder als Teaser sichtbare Mitarbeiter zeigen.
  const visible = resolved.filter(
    (r) => r.availability === "available" || r.availability === "comingSoon",
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <p className="label-eyebrow">Dein Team</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">KI-Mitarbeiter</h1>
        <p className="text-muted mt-2 max-w-xl">
          Wähle einen Mitarbeiter, um loszulegen. Weitere kommen Schritt für Schritt dazu.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => (
          <EmployeeCard key={r.manifest.id} resolved={r} />
        ))}
      </div>
    </div>
  );
}

function EmployeeCard({ resolved }: { resolved: ResolvedCoworker }) {
  const { manifest, availability } = resolved;
  const active = availability === "available";

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div
          className={`grid place-items-center w-14 h-14 rounded-2xl text-2xl ${
            active ? "bg-cobalt/10" : "bg-black/[0.04]"
          }`}
        >
          <span className={active ? "" : "grayscale opacity-60"}>{manifest.emoji}</span>
        </div>
        {active ? (
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
            aktiv
          </span>
        ) : (
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted bg-black/[0.04] rounded-full px-2.5 py-1">
            bald verfügbar
          </span>
        )}
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-bold">{manifest.name}</h2>
        <p className="label-eyebrow mt-0.5 !text-muted">{manifest.role}</p>
        <p className="text-sm text-muted mt-2 leading-relaxed">{manifest.blurb}</p>
      </div>

      <div className="mt-5">
        {active ? (
          <span className="btn btn-primary w-full">Öffnen →</span>
        ) : (
          <span className="btn btn-outline w-full !cursor-default">In Vorbereitung</span>
        )}
      </div>
    </>
  );

  const base = "card p-5 flex flex-col transition-transform";
  if (active) {
    return (
      <Link href={manifest.entryPath} className={`${base} hover:-translate-y-0.5 hover:shadow-md`}>
        {inner}
      </Link>
    );
  }
  return <div className={`${base} opacity-80`}>{inner}</div>;
}
```

- [ ] **Step 2: Typprüfung + Build-Smoke**

Run: `pnpm exec tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Manuelle Verifikation**

Run: `pnpm dev` und `/` öffnen (eingeloggt, Org mit Franz freigeschaltet).
Expected: Franz-Karte „aktiv" mit Link auf `/c/franz/projects`; Mira/Theo „bald verfügbar". (Der Franz-Link zeigt erst nach Task 13 auf eine existierende Seite — bis dahin 404 erwartet.)

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/page.tsx
git commit -m "feat(dashboard): render coworkers from registry instead of hardcoded list"
```

---

## Task 12: Entitlement-Guards auf allen Franz-Endpunkten (Finding #1)

**Files:**
- Modify: `src/app/api/projects/[id]/notes/route.ts`
- Modify: `src/app/api/projects/[id]/notes/[noteId]/route.ts`
- Modify: `src/app/api/projects/[id]/photos/route.ts`
- Modify: `src/app/api/projects/[id]/photos/[photoId]/route.ts`
- Modify: `src/app/api/projects/[id]/reports/route.ts`
- Modify: `src/app/(app)/projects/new/action.ts`
- Modify: `src/app/api/files/[...key]/route.ts`

Muster für **jede API-Route**: direkt nach `const session = await requireSession();` einfügen:

```ts
import { isAvailable } from "@/coworkers";
// ...
if (!(await isAvailable(session.orgId, "franz"))) {
  return new NextResponse("Not found", { status: 404 });
}
```

(Retry-Routen werden in Task 14 zusammen mit der `cancelled`-Logik angefasst — dort wird der Guard mitgesetzt.)

- [ ] **Step 1: Guard in `notes/route.ts` (POST)**

In `src/app/api/projects/[id]/notes/route.ts` den Import ergänzen und nach der Session-Zeile einsetzen:

```ts
import { isAvailable } from "@/coworkers";
```
```ts
  const session = await requireSession();
  const { id: projectId } = await params;
  if (!(await isAvailable(session.orgId, "franz"))) {
    return new NextResponse("Not found", { status: 404 });
  }
```

- [ ] **Step 2: Guard in `notes/[noteId]/route.ts`**

Analog: Import `isAvailable`, Guard direkt nach `requireSession()` (vor dem `getNoteForOrg`).

- [ ] **Step 3: Guard in `photos/route.ts` und `photos/[photoId]/route.ts`**

Analog in beiden Photo-Routen: Import `isAvailable`, Guard direkt nach `requireSession()`.

- [ ] **Step 4: Guard in `reports/route.ts` (POST)**

In `src/app/api/projects/[id]/reports/route.ts`, Import `isAvailable`, Guard nach der Session-Zeile vor `getProject`.

- [ ] **Step 5: Guard in der Server Action `projects/new/action.ts`**

Server Actions sind eigene Endpunkte. Import `isAvailable` ergänzen und nach Ermittlung der Session/Org prüfen; bei nicht verfügbar einen Fehler werfen statt Projekt anzulegen:

```ts
if (!(await isAvailable(session.orgId, "franz"))) {
  throw new Error("Coworker nicht verfügbar");
}
```
(Exakte Platzierung: nach der `requireSession()`/Org-Ermittlung, vor dem `prisma.project.create`/Service-Aufruf.)

- [ ] **Step 6: Guard im Datei-Download `api/files/[...key]/route.ts`**

Die ausgelieferten Dateien (`projects/<id>/notes|reports|photos/...`) gehören Franz. Nach der bestehenden Org-Scope-Prüfung (`const project = await getProject(...)`) ergänzen:

```ts
import { isAvailable } from "@/coworkers";
// ... nach `if (!project) return new NextResponse("Not found", { status: 404 });`
if (!(await isAvailable(session.orgId, "franz"))) {
  return new NextResponse("Not found", { status: 404 });
}
```

- [ ] **Step 7: Bypass-Integrationstest schreiben**

Create `src/coworkers/guard.integration.test.ts` (verifiziert, dass `isAvailable` bei deaktiviertem Franz `false` liefert — die Endpunkte stützen sich darauf):

```ts
import { afterEach, describe, expect, it } from "vitest";
import "@/coworkers"; // registriert franz/mira/theo
import { resolveAvailability } from "@/coworkers/resolve";
import { getCoworker } from "@/coworkers/registry";

describe("franz endpoint gate inputs", () => {
  afterEach(() => {
    delete process.env.DISABLED_COWORKERS;
  });

  it("franz is notEntitled when the org row disables it", () => {
    const franz = getCoworker("franz")!;
    expect(resolveAvailability(franz, { enabled: false }, new Set())).toBe("notEntitled");
  });

  it("franz is killSwitched when env disables it", () => {
    const franz = getCoworker("franz")!;
    expect(resolveAvailability(franz, { enabled: true }, new Set(["franz"]))).toBe("killSwitched");
  });
});
```

> Vollwertige HTTP-Bypass-Tests (echte Route-Handler gegen Test-DB) sind optional und können ergänzt werden, sobald ein Route-Harness existiert. Der obige Test sichert die Gate-Eingabe; die Routen rufen alle dasselbe `isAvailable`.

- [ ] **Step 8: Test + Typprüfung**

Run: `pnpm exec vitest run src/coworkers/guard.integration.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; keine TS-Fehler.

- [ ] **Step 9: Commit**

```bash
git add src/app/api src/app/\(app\)/projects/new/action.ts src/coworkers/guard.integration.test.ts
git commit -m "fix(coworkers): gate all franz APIs, server action and file downloads (finding #1)"
```

---

## Task 13: Routing nach /c/franz + Redirect

**Files:**
- Create: `src/app/(app)/c/franz/layout.tsx`
- Move: `src/app/(app)/projects/**` → `src/app/(app)/c/franz/projects/**`
- Modify: interne Navigations-Links in den verschobenen Dateien
- Modify: `next.config.ts`

- [ ] **Step 1: Franz-UI verschieben**

```bash
mkdir -p "src/app/(app)/c/franz"
git mv "src/app/(app)/projects" "src/app/(app)/c/franz/projects"
```

- [ ] **Step 2: Guard-Layout anlegen**

Create `src/app/(app)/c/franz/layout.tsx`:

```tsx
import { requireSession } from "@/server/auth/require-session";
import { requireAvailable } from "@/coworkers";

export default async function FranzLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  // 404, wenn Franz für diese Org nicht verfügbar ist (UX-Gate; APIs gaten separat).
  await requireAvailable(session.orgId, "franz");
  return <>{children}</>;
}
```

- [ ] **Step 3: Interne Links umstellen**

In den verschobenen Dateien alle internen Navigationsziele von `/projects` auf `/c/franz/projects` umstellen. Betroffen sind mindestens:
- `src/app/(app)/c/franz/projects/[id]/page.tsx` — `<Link href="/projects">← Projekte</Link>` → `href="/c/franz/projects"`
- alle weiteren `href="/projects..."`/`router.push("/projects...")` in `new-project-form.tsx`, `notes-list.tsx`, `export-button.tsx`, `reports-list.tsx`, `confirm-dialog.tsx`.

Finden:

```bash
grep -rn '"/projects' "src/app/(app)/c/franz"
```
Erwartung: jede Fundstelle prüfen und auf `/c/franz/projects` umstellen. **`/api/projects/...`-Aufrufe NICHT ändern** — die API-Pfade bleiben unverändert.

- [ ] **Step 4: Redirect für Altlinks**

In `next.config.ts` eine `redirects()`-Funktion ergänzen (bzw. in bestehende einfügen):

```ts
async redirects() {
  return [
    { source: "/projects", destination: "/c/franz/projects", permanent: false },
    { source: "/projects/:path*", destination: "/c/franz/projects/:path*", permanent: false },
  ];
},
```

- [ ] **Step 5: Typprüfung + manuelle Verifikation**

Run: `pnpm exec tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm dev`, dann:
- `/` → Franz „Öffnen" führt nach `/c/franz/projects` (Liste lädt).
- Alter Link `/projects` → leitet auf `/c/franz/projects` um.
- Projektdetail, Aufnahme, Foto-Upload, Export funktionieren wie zuvor.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(franz): move UI under /c/franz with guard layout and legacy redirect"
```

---

## Task 14: Hintergrundjobs — Snapshot, cancelled, Retry (Findings #3, #4)

**Files:**
- Modify: `src/server/reports/reports.service.ts`
- Modify: `src/app/api/projects/[id]/reports/route.ts`
- Modify: `src/server/reports/generate-report.ts`
- Modify: `src/server/notes/transcribe-note.ts`
- Modify: `src/app/api/projects/[id]/reports/[reportId]/retry/route.ts`
- Modify: `src/app/api/projects/[id]/notes/[noteId]/retry/route.ts`
- Test: `src/server/reports/generate-report.test.ts` (bestehend, erweitern)

- [ ] **Step 1: `createReport` um Snapshot erweitern**

In `src/server/reports/reports.service.ts` `CreateReportInput` und `createReport` anpassen:

```ts
import type { Prisma, ReportStatus } from "@prisma/client";

export type CreateReportInput = {
  label: string;
  createdById: string | null;
  configSnapshot: Prisma.InputJsonValue;
  configVersion: number;
};

export function createReport(projectId: string, input: CreateReportInput) {
  return prisma.report.create({
    data: {
      projectId,
      label: input.label,
      createdById: input.createdById ?? undefined,
      status: "pending",
      configSnapshot: input.configSnapshot,
      configVersion: input.configVersion,
    },
  });
}
```

- [ ] **Step 2: Reports-POST-Route stempelt Snapshot**

In `src/app/api/projects/[id]/reports/route.ts` den resolved Coworker laden (liefert auch den Guard) und Config als Snapshot übergeben. Den in Task 12 Step 4 gesetzten `isAvailable`-Guard durch `getResolvedCoworker` ersetzen, um die Config wiederzuverwenden:

```ts
import { getResolvedCoworker } from "@/coworkers";
import { franzManifest } from "@/coworkers/franz/manifest";
// ...
  const session = await requireSession();
  const { id: projectId } = await params;
  const franz = await getResolvedCoworker(session.orgId, "franz");
  if (!franz || franz.availability !== "available") {
    return new NextResponse("Not found", { status: 404 });
  }
```

Und beim Anlegen:

```ts
  const report = await createReport(projectId, {
    label,
    createdById: session.userId,
    configSnapshot: franz.config as Prisma.InputJsonValue,
    configVersion: franzManifest.configVersion,
  });
```

(`import type { Prisma } from "@prisma/client";` und `NextResponse` sind bereits/zusätzlich zu importieren.)

- [ ] **Step 3: `generate-report` — cancelled-Guard + Snapshot-Config nutzen**

In `src/server/reports/generate-report.ts` am Anfang von `runGenerateReport` (nach `getReportById`) den Verfügbarkeits-Guard einfügen und den System-Prompt aus dem Snapshot an den DocGenerator geben:

```ts
import { prisma } from "@/server/db";
import { isAvailable } from "@/coworkers";
import { franzConfigSchema, franzDefaultConfig } from "@/coworkers/franz/config";
// ...
export async function runGenerateReport(reportId: string, deps: GenerateDeps) {
  const report = await getReportById(reportId);
  if (!report) throw new Error(`Report ${reportId} not found`);

  // Org des Reports ermitteln und Verfügbarkeit prüfen. Wurde Franz nach dem Enqueue
  // deaktiviert/kill-switched → kontrolliert auf "cancelled" (terminal), nicht hängen lassen.
  const owner = await prisma.report.findUnique({
    where: { id: reportId },
    select: { project: { select: { orgId: true } } },
  });
  const orgId = owner?.project.orgId;
  if (!orgId || !(await isAvailable(orgId, "franz"))) {
    await setReportStatus(reportId, "cancelled");
    log("report", "cancelled: coworker unavailable", { reportId, orgId });
    return null;
  }

  // Config aus dem Snapshot (reproduzierbar), Fallback auf Defaults bei Altbeständen.
  const snapshot = franzConfigSchema.safeParse(report.configSnapshot);
  const config = snapshot.success ? snapshot.data : franzDefaultConfig;
  // ...
```

Den `docGenerator.generate`-Aufruf um den System-Prompt erweitern:

```ts
    const content = await deps.docGenerator.generate({
      projectName: project.name,
      notes: usableNotes.map((n) => ({ id: n.id, transcript: n.transcript! })),
      systemPrompt: config.docgen.systemPrompt,
    });
```

> `getReportById` muss `configSnapshot` mitliefern. Falls dessen `select` Felder einschränkt: in `src/server/reports/reports.internal.ts` `configSnapshot: true` zum Select ergänzen (sonst ist es `undefined` und der Fallback auf Defaults greift).

- [ ] **Step 4: `DocGenerator`-Interface + Claude-Impl um systemPrompt erweitern**

In `src/server/docgen/doc-generator.ts` das `DocGenInput` um `systemPrompt: string` erweitern (Feld zur bestehenden Typdefinition hinzufügen).

In `src/server/docgen/claude-doc-generator.ts` den hartcodierten System-Block durch den Parameter ersetzen:

```ts
      system: [
        {
          type: "text",
          text: input.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
```

(Den bisherigen langen `text: [...].join("\n")` entfernen.)

- [ ] **Step 5: `transcribe-note` — cancelled-Guard**

In `src/server/notes/transcribe-note.ts` am Anfang (nach dem bestehenden `getNoteForOrgless`-Null-Check) Verfügbarkeit prüfen:

```ts
import { prisma } from "@/server/db";
import { isAvailable } from "@/coworkers";
import { setTranscriptStatus } from "./notes.internal";
// ... innerhalb runTranscribeNote, nach dem `if (!note) { ... return null; }`:
  const owner = await prisma.note.findUnique({
    where: { id: noteId },
    select: { project: { select: { orgId: true } } },
  });
  const orgId = owner?.project.orgId;
  if (!orgId || !(await isAvailable(orgId, "franz"))) {
    await setTranscriptStatus(noteId, "cancelled");
    log("transcribe", "cancelled: coworker unavailable", { noteId, orgId });
    return null;
  }
```

(`setTranscriptStatus` ggf. aus `./notes.internal` importieren, falls noch nicht vorhanden.)

- [ ] **Step 6: Retry-Routen — cancelled retrybar + Verfügbarkeitsprüfung**

In `src/app/api/projects/[id]/reports/[reportId]/retry/route.ts`:
- Import `isAvailable` ergänzen, nach `requireSession()` Guard setzen (`return new NextResponse("Not found", { status: 404 })`).
- Die Bedingung ändern von `if (report.status !== "failed")` auf:

```ts
  if (report.status !== "failed" && report.status !== "cancelled") {
    return NextResponse.json(
      { error: "Nur fehlgeschlagene oder abgebrochene Exporte können erneut versucht werden.", status: report.status },
      { status: 409 },
    );
  }
```

In `src/app/api/projects/[id]/notes/[noteId]/retry/route.ts`:
- Import `isAvailable`, Guard nach `requireSession()`.
- (Die Notiz-Retry-Route setzt unbedingt auf `pending` + enqueue; mit dem Guard davor ist sichergestellt, dass nur bei verfügbarem Franz retryt wird. `cancelled` wird damit automatisch wieder anstoßbar.)

- [ ] **Step 7: Bestehenden generate-report-Test um cancelled-Fall erweitern**

In `src/server/reports/generate-report.test.ts` einen Fall ergänzen: bei nicht verfügbarem Franz wird der Report auf `cancelled` gesetzt und `null` zurückgegeben, ohne den DocGenerator aufzurufen. Beispiel (an den vorhandenen Test-Setup-Stil anpassen — Mock-`storage`/`docGenerator` existieren dort bereits):

```ts
it("sets report to cancelled when franz is not available", async () => {
  // Arrange: Report + Project in Test-DB anlegen, Org OHNE franz-Entitlement
  //   (OrgModule { coworkerId: "franz", enabled: false }).
  // Act:
  const result = await runGenerateReport(reportId, deps);
  // Assert:
  expect(result).toBeNull();
  const after = await prisma.report.findUnique({ where: { id: reportId } });
  expect(after?.status).toBe("cancelled");
  expect(docGeneratorSpy).not.toHaveBeenCalled();
});
```

> Den genauen Arrange-Teil an das bestehende Test-Fixture in dieser Datei angleichen (gleiche Helper zum Anlegen von Org/Project/Report).

- [ ] **Step 8: Tests + Typprüfung**

Run: `pnpm db:test:migrate && pnpm exec vitest run src/server/reports src/server/notes && pnpm exec tsc --noEmit`
Expected: alle Reports-/Notes-Tests PASS (inkl. neuem cancelled-Fall); keine TS-Fehler.

- [ ] **Step 9: Commit**

```bash
git add src/server src/app/api
git commit -m "fix(jobs): config snapshot + controlled cancelled state for franz jobs (findings #3,#4)"
```

---

## Task 15: UI-Labels aus Config (Config-Konsum sichtbar)

**Files:**
- Modify: `src/app/(app)/c/franz/projects/[id]/page.tsx`

Demonstriert pro-Tenant-Anpassung im UI: die Section-Überschriften kommen aus der Franz-Config.

- [ ] **Step 1: Config-Auflösung in den Daten-Loader ziehen**

Damit die Seite keine zweite Session-Auflösung braucht, gibt `loadProjectDetail` die Franz-Config mit zurück. In `src/app/(app)/c/franz/projects/[id]/data.ts`:

```ts
import { getResolvedCoworker } from "@/coworkers";
import { franzDefaultConfig, type FranzConfig } from "@/coworkers/franz/config";
// ... in loadProjectDetail, nach `const session = await requireSession();`:
  const franz = await getResolvedCoworker(session.orgId, "franz");
  const config = (franz?.config as FranzConfig) ?? franzDefaultConfig;
// und am Ende:
  return { project, notes, photos, reports, config };
```

Dann in `page.tsx` die Überschriften aus `data.config.labels` setzen:

```tsx
  const { project, notes, photos, reports, config } = data;
// ...
  <h2 className="font-bold flex items-center gap-2">{config.labels.notesHeading}</h2>
// ...
  <h2 className="font-bold flex items-center gap-2">{config.labels.photosHeading}</h2>
// ...
  <h2 className="font-bold flex items-center gap-2">{config.labels.docsHeading}</h2>
```

- [ ] **Step 2: Typprüfung + manuelle Verifikation**

Run: `pnpm exec tsc --noEmit`
Expected: keine Fehler.

Manuell: Projektdetail zeigt die Default-Überschriften unverändert. Optional: in der DB für eine Org `OrgModule.config = { "labels": { "notesHeading": "🎤 Diktat" } }` setzen → Überschrift ändert sich nur für diese Org.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/c/franz/projects/[id]/page.tsx" "src/app/(app)/c/franz/projects/[id]/data.ts"
git commit -m "feat(franz): drive section headings from tenant config"
```

---

## Task 16: Strukturelle Kapselung — Franz-Server-Code verschieben (optional/abschließend)

> Diese Task vervollständigt die Verzeichnis-Kapselung. Sie liefert **keinen** funktionalen oder Sicherheitsmehrwert (das leisten Tasks 1–15) und ist reine Umstrukturierung mit Import-Churn. Kann separat/zuletzt ausgeführt oder vorerst zurückgestellt werden.

**Files:**
- Move: `src/server/{notes,photos,reports,docgen,pdf,transcription}` → `src/coworkers/franz/server/*`

- [ ] **Step 1: Verschieben**

```bash
mkdir -p src/coworkers/franz/server
git mv src/server/notes src/coworkers/franz/server/notes
git mv src/server/photos src/coworkers/franz/server/photos
git mv src/server/reports src/coworkers/franz/server/reports
git mv src/server/docgen src/coworkers/franz/server/docgen
git mv src/server/pdf src/coworkers/franz/server/pdf
git mv src/server/transcription src/coworkers/franz/server/transcription
```

> `src/server/{auth,db.ts,log.ts,storage,projects}` bleiben geteilt und werden NICHT verschoben.

- [ ] **Step 2: Import-Specifier umschreiben**

Globale Ersetzung der betroffenen Import-Pfade über `src` (macOS `sed -i ''`):

```bash
grep -rl '@/server/\(notes\|photos\|reports\|docgen\|pdf\|transcription\)' src | while read -r f; do
  sed -i '' -E 's#@/server/(notes|photos|reports|docgen|pdf|transcription)#@/coworkers/franz/server/\1#g' "$f"
done
```

- [ ] **Step 3: Typprüfung + volle Testsuite**

Run: `pnpm exec tsc --noEmit && pnpm db:test:migrate && pnpm test`
Expected: keine TS-Fehler; gesamte Suite grün (verhaltensneutraler Move).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(franz): relocate owned server modules under coworkers/franz/server"
```

---

## Task 17: Grenzen erzwingen (dependency-cruiser)

**Files:**
- Create: `.dependency-cruiser.cjs`
- Modify: `package.json` (Script)

> Sinnvoll erst nach Task 16 (dann existiert die Modul-Verzeichnisstruktur). Falls Task 16 zurückgestellt wird, diese Task ebenfalls zurückstellen.

- [ ] **Step 1: dependency-cruiser installieren**

Run: `pnpm add -D dependency-cruiser`
Expected: Paket in devDependencies.

- [ ] **Step 2: Regel definieren**

Create `.dependency-cruiser.cjs`:

```js
module.exports = {
  forbidden: [
    {
      name: "no-cross-coworker-internals",
      comment: "Ein Coworker-Modul darf nicht in die Interna eines anderen greifen.",
      severity: "error",
      from: { path: "^src/coworkers/([^/]+)/" },
      to: {
        path: "^src/coworkers/([^/]+)/",
        pathNot: [
          "^src/coworkers/$1/", // eigenes Modul erlaubt
          "^src/coworkers/(types|registry|resolve|guard|merge|env|validate)", // geteilter Kern
        ],
      },
    },
  ],
  options: { tsConfig: { fileName: "tsconfig.json" }, doNotFollow: { path: "node_modules" } },
};
```

- [ ] **Step 3: Script ergänzen**

In `package.json` unter `scripts` ergänzen:

```json
"lint:boundaries": "depcruise src --config .dependency-cruiser.cjs"
```

- [ ] **Step 4: Regel prüfen**

Run: `pnpm lint:boundaries`
Expected: keine Verletzungen (`no dependency violations found`).

- [ ] **Step 5: Commit**

```bash
git add .dependency-cruiser.cjs package.json pnpm-lock.yaml
git commit -m "chore(coworkers): enforce module boundaries via dependency-cruiser"
```

---

## Abschlussverifikation

- [ ] **Volle Suite + Typen + Lint**

Run: `pnpm db:test:migrate && pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: alles grün.

- [ ] **Manueller Durchlauf**

`pnpm dev` (+ `pnpm dev:inngest`, `pnpm dev:whisper`):
1. Dashboard zeigt Franz aktiv, Mira/Theo „bald".
2. Franz öffnen → Projekt anlegen → Sprachnotiz aufnehmen → Transkript wird `done`.
3. Foto hochladen → Export → PDF wird `done` und ist herunterladbar.
4. Org-Test: `OrgModule.enabled=false` für franz setzen → Dashboard zeigt Franz nicht, `/c/franz/projects` → 404, `/api/projects/.../notes` POST → 404, `/api/files/...` → 404.
5. Kill-Switch-Test: `DISABLED_COWORKERS=franz` → wie oben; ein vor dem Setzen enqueueter Job endet als `cancelled` (nicht `pending`).

---

## Self-Review-Notizen (gegen Spec geprüft)

- **Finding #1** (API-Bypass): Task 12 + 14 gaten alle Franz-APIs, Server Action, Datei-Download, Retry-Routen.
- **Finding #2** (lifecycle vs. entitlement): Task 2 (`lifecycle`), Task 6 (`resolveAvailability`-Matrix), Task 11 (Dashboard nach availability).
- **Finding #3** (hängende Jobs): Task 1 (`cancelled`-Enums), Task 14 (kontrollierter Übergang in beiden Jobs + Retry für `cancelled`).
- **Finding #4** (Snapshot): Task 1 (`Report.configSnapshot/configVersion`), Task 14 (Stempeln beim Anlegen, Lesen aus Snapshot). Bewusste Abweichung: `Note` ohne Snapshot (keine config-abhängige Transkription).
- **Finding #5** (Config-Evolution): Task 2 (`configVersion`/`configMigrations`), Task 6 (Migration vor Validierung + lauter Fehler-Log), Task 10 (`validateRegisteredManifests` als Startfehler).
- **Bekannte Vereinfachung:** Verwaltung der Entitlements/Config via Seed-Skript + direkte DB (keine Admin-UI) — entspricht „Offene Punkte" der Spec.
