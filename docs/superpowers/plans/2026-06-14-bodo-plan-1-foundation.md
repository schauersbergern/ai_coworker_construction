# Bodo Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein lauffähiger, gegateter Coworker „Bodo": Adresse eingeben → `Assessment` anlegen → Inngest-Job setzt mit einer Stub-Pipeline den Status auf `ready` → Detailseite zeigt das Ergebnis.

**Architecture:** Neues Modul `src/coworkers/bodo/` nach dem dokumentierten Coworker-Muster (Manifest → Registry → guarded UI → gegateter Inngest-Job). Diese Phase baut den vertikalen End-to-End-Slice mit einer **Stub-Pipeline** (liefert ein leeres `LocationProfile`); echte Datenquellen folgen in Plan 2.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma/PostgreSQL, Inngest, NextAuth, Zod, Vitest, pnpm.

**Voraussetzung:** Spec gelesen — `docs/superpowers/specs/2026-06-14-bodo-lagebewertung-design.md`. Franz ist die Referenz-Implementierung (`src/coworkers/franz/`).

---

## File Structure (diese Phase)

- Create: `src/coworkers/bodo/config.ts`, `config.test.ts`
- Create: `src/coworkers/bodo/manifest.ts`
- Create: `src/coworkers/bodo/server/sources/types.ts`, `types.test.ts`
- Create: `src/coworkers/bodo/server/pipeline/profile.ts`
- Create: `src/coworkers/bodo/server/region/region-provider.ts`, `bayern-provider.ts`, `bayern-provider.test.ts`
- Create: `src/coworkers/bodo/server/assessment/assessment.service.ts`, `assessment.internal.ts`, `assessment.service.test.ts`
- Create: `src/coworkers/bodo/run-assessment.ts`, `run-assessment.test.ts`
- Create: `src/app/(app)/c/bodo/layout.tsx`, `standorte/page.tsx`, `standorte/[id]/page.tsx`, `standorte/[id]/data.ts`, `standorte/new/new-assessment-form.tsx`, `standorte/new/action.ts`
- Modify: `prisma/schema.prisma` (Assessment + enum + Organization relation)
- Modify: `src/coworkers/index.ts` (register bodoManifest)
- Modify: `src/inngest/functions.ts` (register runAssessment)
- Modify: `scripts/seed-coworkers.ts` (OrgModule row für bodo)

---

## Task 1: Prisma-Modell `Assessment`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Enum + Modell + Relation ergänzen**

In `prisma/schema.prisma` am Ende anfügen:

```prisma
enum AssessmentStatus {
  pending
  running
  ready
  failed
  cancelled
}

model Assessment {
  id             String           @id @default(cuid())
  orgId          String
  org            Organization     @relation(fields: [orgId], references: [id], onDelete: Cascade)
  address        String
  lat            Float?
  lon            Float?
  district       String?
  plz            String?
  elevation      Float?
  status         AssessmentStatus @default(pending)
  profile        Json?
  scores         Json?
  narrative      String?
  configSnapshot Json
  configVersion  Int              @default(0)
  error          String?
  pdfPath        String?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@index([orgId])
}
```

Im bestehenden `model Organization { ... }` die Gegenrelation ergänzen:

```prisma
  assessments Assessment[]
```

- [ ] **Step 2: Migration erzeugen**

Run: `pnpm prisma migrate dev --name add_assessment`
Expected: neue Migration unter `prisma/migrations/*_add_assessment/`, Prisma-Client neu generiert.

- [ ] **Step 3: Test-DB migrieren**

Run: `pnpm db:test:migrate`
Expected: ohne Fehler durchlaufen.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: keine Fehler (Prisma-Client kennt `Assessment`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(bodo): add Assessment prisma model"
```

---

## Task 2: Config-Schema + Defaults

**Files:**
- Create: `src/coworkers/bodo/config.ts`
- Test: `src/coworkers/bodo/config.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/coworkers/bodo/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bodoConfigSchema, bodoDefaultConfig } from "./config";

describe("bodo config", () => {
  it("default config satisfies schema", () => {
    expect(() => bodoConfigSchema.parse(bodoDefaultConfig)).not.toThrow();
  });

  it("has a non-empty narrative system prompt", () => {
    expect(bodoDefaultConfig.narrative.systemPrompt.length).toBeGreaterThan(0);
  });

  it("enables all known sources by default", () => {
    expect(bodoDefaultConfig.sources.hochwasser).toBe(true);
    expect(bodoDefaultConfig.sources.pois).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `pnpm test src/coworkers/bodo/config.test.ts`
Expected: FAIL — `./config` existiert nicht.

- [ ] **Step 3: Implementierung**

`src/coworkers/bodo/config.ts`:

```ts
import { z } from "zod";

export const bodoConfigSchema = z.object({
  narrative: z.object({ systemPrompt: z.string().min(1) }),
  scoring: z.object({
    weights: z.record(z.string(), z.number()),
  }),
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
  labels: {
    listHeading: "📍 Standorte",
    newHeading: "Neuen Standort bewerten",
  },
};
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `pnpm test src/coworkers/bodo/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/bodo/config.ts src/coworkers/bodo/config.test.ts
git commit -m "feat(bodo): config schema and defaults"
```

---

## Task 3: Manifest + Registrierung

**Files:**
- Create: `src/coworkers/bodo/manifest.ts`
- Modify: `src/coworkers/index.ts`

- [ ] **Step 1: Manifest schreiben**

`src/coworkers/bodo/manifest.ts`:

```ts
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
  enabledByDefault: true,
  configSchema: bodoConfigSchema,
  defaultConfig: bodoDefaultConfig,
  configVersion: 0,
  entryPath: "/c/bodo/standorte",
  // inngestFunctions werden in Task 7 ergänzt.
};
```

- [ ] **Step 2: In Registry registrieren**

In `src/coworkers/index.ts` Import + Registrierung ergänzen (vor `validateRegisteredManifests()`):

```ts
import { bodoManifest } from "./bodo/manifest";
```
```ts
registerCoworker(bodoManifest);
```

- [ ] **Step 3: Typecheck + bestehende Registry-Tests**

Run: `pnpm exec tsc --noEmit && pnpm test src/coworkers/registry.test.ts src/coworkers/validate.test.ts`
Expected: PASS (Default erfüllt Schema; Startup-Validierung grün).

- [ ] **Step 4: Commit**

```bash
git add src/coworkers/bodo/manifest.ts src/coworkers/index.ts
git commit -m "feat(bodo): manifest and registry registration"
```

---

## Task 4: DataPoint- & Profile-Typen

**Files:**
- Create: `src/coworkers/bodo/server/sources/types.ts`
- Create: `src/coworkers/bodo/server/pipeline/profile.ts`
- Test: `src/coworkers/bodo/server/sources/types.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/coworkers/bodo/server/sources/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unavailable, ok } from "./types";

describe("DataPoint helpers", () => {
  it("ok() builds an ok data point", () => {
    const dp = ok(42, { source: "X", license: "CC BY 4.0", confidence: "high" });
    expect(dp.status).toBe("ok");
    expect(dp.value).toBe(42);
    expect(dp.retrievedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("unavailable() builds an unavailable data point with reason", () => {
    const dp = unavailable<number>({ source: "Y", license: "-", reason: "nicht per API abrufbar" });
    expect(dp.status).toBe("unavailable");
    expect(dp.value).toBeNull();
    expect(dp.reason).toBe("nicht per API abrufbar");
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `pnpm test src/coworkers/bodo/server/sources/types.test.ts`
Expected: FAIL — `./types` existiert nicht.

- [ ] **Step 3: Typen + Helfer implementieren**

`src/coworkers/bodo/server/sources/types.ts`:

```ts
export type SourceStatus = "ok" | "unavailable" | "error";
export type Confidence = "high" | "medium" | "low";

export interface DataPoint<T> {
  value: T | null;
  status: SourceStatus;
  reason?: string;
  source: string;
  license: string;
  retrievedAt: string;
  confidence: Confidence;
}

export function ok<T>(
  value: T,
  meta: { source: string; license: string; confidence: Confidence },
): DataPoint<T> {
  return { value, status: "ok", retrievedAt: new Date().toISOString(), ...meta };
}

export function unavailable<T>(
  meta: { source: string; license: string; reason: string; confidence?: Confidence },
): DataPoint<T> {
  return {
    value: null,
    status: "unavailable",
    reason: meta.reason,
    source: meta.source,
    license: meta.license,
    confidence: meta.confidence ?? "low",
    retrievedAt: new Date().toISOString(),
  };
}

export function errored<T>(
  meta: { source: string; license: string; reason: string },
): DataPoint<T> {
  return {
    value: null,
    status: "error",
    reason: meta.reason,
    source: meta.source,
    license: meta.license,
    confidence: "low",
    retrievedAt: new Date().toISOString(),
  };
}
```

`src/coworkers/bodo/server/pipeline/profile.ts`:

```ts
import type { DataPoint } from "../sources/types";

export interface Coordinate {
  lat: number;
  lon: number;
}

/** Normalisiertes Standortprofil. Jedes Feld trägt seinen DataPoint. */
export interface LocationProfile {
  coordinate: Coordinate;
  district: DataPoint<string>;
  plz: DataPoint<string>;
  elevation: DataPoint<number>;
  // Weitere Felder werden in Plan 2 ergänzt (pois, transit, hochwasser, ...).
  fields: Record<string, DataPoint<unknown>>;
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `pnpm test src/coworkers/bodo/server/sources/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/bodo/server/sources/types.ts src/coworkers/bodo/server/sources/types.test.ts src/coworkers/bodo/server/pipeline/profile.ts
git commit -m "feat(bodo): DataPoint and LocationProfile types"
```

---

## Task 5: Region-Provider (Naht)

**Files:**
- Create: `src/coworkers/bodo/server/region/region-provider.ts`
- Create: `src/coworkers/bodo/server/region/bayern-provider.ts`
- Test: `src/coworkers/bodo/server/region/bayern-provider.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/coworkers/bodo/server/region/bayern-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveRegionProvider } from "./bayern-provider";

describe("region provider", () => {
  it("returns the bayern provider for a Munich coordinate", () => {
    const p = resolveRegionProvider({ lat: 48.0865, lon: 11.5951 });
    expect(p.id).toBe("bayern");
    expect(p.sourceIds).toContain("hochwasser");
    expect(p.sourceIds).toContain("pois");
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `pnpm test src/coworkers/bodo/server/region/bayern-provider.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

`src/coworkers/bodo/server/region/region-provider.ts`:

```ts
import type { Coordinate } from "../pipeline/profile";

export type SourceId =
  | "elevation" | "pois" | "transit" | "hochwasser" | "natur"
  | "geologie" | "solar" | "luft" | "geschosse" | "sozio" | "denkmal";

export interface RegionProvider {
  id: string;
  /** Adapter, die an diesem Punkt gelten (Reihenfolge egal, Pipeline parallelisiert). */
  sourceIds: SourceId[];
}
```

`src/coworkers/bodo/server/region/bayern-provider.ts`:

```ts
import type { Coordinate } from "../pipeline/profile";
import type { RegionProvider, SourceId } from "./region-provider";

const BAYERN_SOURCES: SourceId[] = [
  "elevation", "pois", "transit", "hochwasser", "natur",
  "geologie", "solar", "luft", "geschosse", "sozio", "denkmal",
];

/** v1: immer Bayern. Naht für weitere Provider (NRW/AT/CH). */
export function resolveRegionProvider(_coord: Coordinate): RegionProvider {
  return { id: "bayern", sourceIds: BAYERN_SOURCES };
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `pnpm test src/coworkers/bodo/server/region/bayern-provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/bodo/server/region
git commit -m "feat(bodo): region provider seam with bayern provider"
```

---

## Task 6: Assessment-Service (org-scoped) + Status-Übergänge

**Files:**
- Create: `src/coworkers/bodo/server/assessment/assessment.service.ts`
- Create: `src/coworkers/bodo/server/assessment/assessment.internal.ts`
- Test: `src/coworkers/bodo/server/assessment/assessment.service.test.ts`

- [ ] **Step 1: Failing test schreiben** (DB-Test; braucht Test-Postgres)

`src/coworkers/bodo/server/assessment/assessment.service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { createAssessment, listAssessments, getAssessment } from "./assessment.service";
import { claimForRun } from "./assessment.internal";

async function makeOrg(id: string) {
  await db.organization.create({ data: { id, name: id } });
}

describe("assessment.service", () => {
  beforeEach(async () => {
    await db.assessment.deleteMany();
    await db.organization.deleteMany();
  });

  it("creates an org-scoped pending assessment with a config snapshot", async () => {
    await makeOrg("org1");
    const a = await createAssessment("org1", "Kiefernstr. 25, München", { snapshot: { x: 1 }, version: 0 });
    expect(a.status).toBe("pending");
    expect(a.orgId).toBe("org1");
    expect(a.configSnapshot).toEqual({ x: 1 });
  });

  it("getAssessment does not leak across orgs", async () => {
    await makeOrg("org1");
    await makeOrg("org2");
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    expect(await getAssessment("org2", a.id)).toBeNull();
  });

  it("claimForRun atomically moves pending -> running once", async () => {
    await makeOrg("org1");
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    expect(await claimForRun(a.id)).toBe(true);
    expect(await claimForRun(a.id)).toBe(false); // already running
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `pnpm test src/coworkers/bodo/server/assessment/assessment.service.test.ts`
Expected: FAIL — Service fehlt.

- [ ] **Step 3: Service + internal implementieren**

`src/coworkers/bodo/server/assessment/assessment.service.ts`:

```ts
import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";

export async function createAssessment(
  orgId: string,
  address: string,
  config: { snapshot: Prisma.InputJsonValue; version: number },
) {
  return db.assessment.create({
    data: {
      orgId,
      address,
      status: "pending",
      configSnapshot: config.snapshot,
      configVersion: config.version,
    },
  });
}

export async function listAssessments(orgId: string) {
  return db.assessment.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAssessment(orgId: string, id: string) {
  return db.assessment.findFirst({ where: { id, orgId } });
}
```

`src/coworkers/bodo/server/assessment/assessment.internal.ts`:

```ts
import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";

/** Atomar pending -> running. true, wenn dieser Aufruf den Übergang gewonnen hat. */
export async function claimForRun(id: string): Promise<boolean> {
  const res = await db.assessment.updateMany({
    where: { id, status: "pending" },
    data: { status: "running" },
  });
  return res.count === 1;
}

export async function markReady(
  id: string,
  data: { profile: Prisma.InputJsonValue; scores: Prisma.InputJsonValue; narrative: string | null;
          lat: number; lon: number; district: string | null; plz: string | null; elevation: number | null },
) {
  await db.assessment.update({ where: { id }, data: { ...data, status: "ready", error: null } });
}

export async function markFailed(id: string, error: string) {
  await db.assessment.update({ where: { id }, data: { status: "failed", error } });
}

export async function markCancelled(id: string, reason: string) {
  await db.assessment.update({ where: { id }, data: { status: "cancelled", error: reason } });
}

export async function getSnapshot(id: string) {
  return db.assessment.findUnique({ where: { id }, select: { orgId: true, address: true, status: true, configSnapshot: true } });
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `pnpm test src/coworkers/bodo/server/assessment/assessment.service.test.ts`
Expected: PASS (Test-DB läuft).

- [ ] **Step 5: Commit**

```bash
git add src/coworkers/bodo/server/assessment
git commit -m "feat(bodo): org-scoped assessment service with atomic claim"
```

---

## Task 7: Inngest-Job `run-assessment` (Stub-Pipeline)

**Files:**
- Create: `src/coworkers/bodo/run-assessment.ts`
- Test: `src/coworkers/bodo/run-assessment.test.ts`
- Modify: `src/inngest/functions.ts`
- Modify: `src/coworkers/bodo/manifest.ts` (inngestFunctions referenzieren)

- [ ] **Step 1: Failing test schreiben**

`src/coworkers/bodo/run-assessment.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/server/db";
import { createAssessment } from "./server/assessment/assessment.service";
import { runAssessment } from "./run-assessment";

const deps = {
  isAvailable: vi.fn(async () => true),
  buildProfile: vi.fn(async (coord: { lat: number; lon: number }) => ({
    coordinate: coord, district: { value: "Fasangarten", status: "ok" },
    plz: { value: "81549", status: "ok" }, elevation: { value: 550, status: "ok" }, fields: {},
  })),
  geocode: vi.fn(async () => ({ lat: 48.0865, lon: 11.5951, district: "Fasangarten", plz: "81549", elevation: 550 })),
} as any;

describe("runAssessment", () => {
  beforeEach(async () => {
    await db.assessment.deleteMany();
    await db.organization.deleteMany();
    await db.organization.create({ data: { id: "org1", name: "org1" } });
    vi.clearAllMocks();
  });

  it("happy path: pending -> ready with stub profile", async () => {
    const a = await createAssessment("org1", "Kiefernstr. 25, München", { snapshot: {}, version: 0 });
    await runAssessment(a.id, deps);
    const after = await db.assessment.findUnique({ where: { id: a.id } });
    expect(after?.status).toBe("ready");
    expect(after?.district).toBe("Fasangarten");
  });

  it("is idempotent: second run is a no-op (status stays ready)", async () => {
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    await runAssessment(a.id, deps);
    await runAssessment(a.id, deps); // claim fails second time
    expect(deps.buildProfile).toHaveBeenCalledTimes(1);
  });

  it("cancels when coworker is not available", async () => {
    const a = await createAssessment("org1", "addr", { snapshot: {}, version: 0 });
    await runAssessment(a.id, { ...deps, isAvailable: vi.fn(async () => false) });
    const after = await db.assessment.findUnique({ where: { id: a.id } });
    expect(after?.status).toBe("cancelled");
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `pnpm test src/coworkers/bodo/run-assessment.test.ts`
Expected: FAIL — `./run-assessment` fehlt.

- [ ] **Step 3: Job-Body implementieren** (Dependency-Injection für Testbarkeit)

`src/coworkers/bodo/run-assessment.ts`:

```ts
import "server-only";
import { log } from "@/server/log";
import { claimForRun, markReady, markFailed, markCancelled, getSnapshot } from "./server/assessment/assessment.internal";
import type { LocationProfile, Coordinate } from "./server/pipeline/profile";

export interface GeocodeResult {
  lat: number; lon: number; district: string | null; plz: string | null; elevation: number | null;
}

export interface RunAssessmentDeps {
  isAvailable: (orgId: string, id: string) => Promise<boolean>;
  geocode: (address: string) => Promise<GeocodeResult | null>;
  buildProfile: (coord: Coordinate, snapshot: unknown) => Promise<LocationProfile>;
}

export async function runAssessment(id: string, deps: RunAssessmentDeps): Promise<void> {
  const snap = await getSnapshot(id);
  if (!snap) { log("bodo", "run-assessment: not found", { id }); return; }
  if (snap.status !== "pending") { log("bodo", "run-assessment: no-op (terminal/running)", { id, status: snap.status }); return; }

  if (!(await deps.isAvailable(snap.orgId, "bodo"))) {
    await markCancelled(id, "coworker not available");
    return;
  }

  if (!(await claimForRun(id))) {
    log("bodo", "run-assessment: claim lost", { id });
    return;
  }

  try {
    const geo = await deps.geocode(snap.address);
    if (!geo) { await markFailed(id, "Adresse konnte nicht geocodiert werden"); return; }

    const profile = await deps.buildProfile({ lat: geo.lat, lon: geo.lon }, snap.configSnapshot);

    await markReady(id, {
      profile: profile as unknown as object,
      scores: {}, // Scoring folgt in Plan 3
      narrative: null, // Narrative folgt in Plan 3
      lat: geo.lat, lon: geo.lon, district: geo.district, plz: geo.plz, elevation: geo.elevation,
    });
  } catch (e) {
    await markFailed(id, e instanceof Error ? e.message : "unbekannter Fehler");
  }
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `pnpm test src/coworkers/bodo/run-assessment.test.ts`
Expected: PASS.

- [ ] **Step 5: Stub-Geocode + Stub-buildProfile + Inngest-Function verdrahten**

`src/coworkers/bodo/server/pipeline/build-profile.ts` (Stub für Plan 1; echte Adapter in Plan 2):

```ts
import "server-only";
import type { LocationProfile, Coordinate } from "./profile";
import { unavailable } from "../sources/types";

export async function buildProfile(coord: Coordinate, _snapshot: unknown): Promise<LocationProfile> {
  const u = (reason: string) => unavailable<never>({ source: "stub", license: "-", reason });
  return {
    coordinate: coord,
    district: u("Plan 2"),
    plz: u("Plan 2"),
    elevation: u("Plan 2"),
    fields: {},
  };
}
```

`src/coworkers/bodo/server/sources/nominatim.ts` (Stub-Geocode für Plan 1):

```ts
import "server-only";
import type { GeocodeResult } from "../../run-assessment";

// Plan 2 ersetzt diesen Stub durch einen echten Nominatim-Abruf.
export async function geocode(_address: string): Promise<GeocodeResult | null> {
  return { lat: 48.0865, lon: 11.5951, district: null, plz: null, elevation: null };
}
```

In `src/inngest/functions.ts` ergänzen (Imports oben, Funktion + `functions[]` unten):

```ts
import { isAvailable } from "@/coworkers";
import { runAssessment } from "@/coworkers/bodo/run-assessment";
import { geocode } from "@/coworkers/bodo/server/sources/nominatim";
import { buildProfile } from "@/coworkers/bodo/server/pipeline/build-profile";
```
```ts
export const runAssessmentJob = inngest.createFunction(
  { id: "run-assessment", retries: 1, triggers: [{ event: "assessment/requested" }] },
  async ({ event }: { event: { data: { assessmentId: string } } }) => {
    const { assessmentId } = event.data;
    log("inngest", "run-assessment invoked", { assessmentId });
    await runAssessment(assessmentId, { isAvailable, geocode, buildProfile });
    return { assessmentId };
  },
);
```

In `functions` aufnehmen:

```ts
export const functions: InngestFunction.Any[] = [transcribeNote, generateReport, runAssessmentJob];
```

In `src/coworkers/bodo/manifest.ts` `inngestFunctions` ergänzen:

```ts
import { runAssessmentJob } from "@/inngest/functions";
```
```ts
  inngestFunctions: [runAssessmentJob],
```

- [ ] **Step 6: Typecheck + Tests**

Run: `pnpm exec tsc --noEmit && pnpm test src/coworkers/bodo`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/coworkers/bodo src/inngest/functions.ts
git commit -m "feat(bodo): run-assessment inngest job with stub pipeline"
```

---

## Task 8: UI-Shell (guarded)

**Files:**
- Create: `src/app/(app)/c/bodo/layout.tsx`
- Create: `src/app/(app)/c/bodo/standorte/page.tsx`
- Create: `src/app/(app)/c/bodo/standorte/[id]/data.ts`
- Create: `src/app/(app)/c/bodo/standorte/[id]/page.tsx`
- Create: `src/app/(app)/c/bodo/standorte/new/new-assessment-form.tsx`
- Create: `src/app/(app)/c/bodo/standorte/new/action.ts`

- [ ] **Step 1: Guard-Layout** (Referenz: `src/app/(app)/c/franz/layout.tsx`)

`src/app/(app)/c/bodo/layout.tsx`:

```tsx
import { requireSession } from "@/server/auth/require-session";
import { requireAvailable } from "@/coworkers";

export default async function BodoLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  await requireAvailable(session.orgId, "bodo");
  return <>{children}</>;
}
```

- [ ] **Step 2: Server Action — Adresse → Assessment + Event**

`src/app/(app)/c/bodo/standorte/new/action.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable, getResolvedCoworker } from "@/coworkers";
import { createAssessment } from "@/coworkers/bodo/server/assessment/assessment.service";
import { inngest } from "@/inngest/client";

export async function createAssessmentAction(formData: FormData) {
  const session = await requireSession();
  if (!(await isAvailable(session.orgId, "bodo"))) throw new Error("not available");

  const address = String(formData.get("address") ?? "").trim();
  if (!address) throw new Error("Adresse fehlt");

  const resolved = await getResolvedCoworker(session.orgId, "bodo");
  const a = await createAssessment(session.orgId, address, {
    snapshot: (resolved.config ?? {}) as object,
    version: resolved.manifest.configVersion,
  });

  await inngest.send({ name: "assessment/requested", data: { assessmentId: a.id } });
  redirect(`/c/bodo/standorte/${a.id}`);
}
```

- [ ] **Step 3: New-Form**

`src/app/(app)/c/bodo/standorte/new/new-assessment-form.tsx`:

```tsx
import { createAssessmentAction } from "./action";

export function NewAssessmentForm() {
  return (
    <form action={createAssessmentAction} className="flex gap-2">
      <input
        name="address"
        required
        placeholder="z.B. Kiefernstr. 25, München"
        className="flex-1 rounded-lg border px-3 py-2"
      />
      <button type="submit" className="btn btn-primary">Analysieren</button>
    </form>
  );
}
```

- [ ] **Step 4: Liste**

`src/app/(app)/c/bodo/standorte/page.tsx`:

```tsx
import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";
import { listAssessments } from "@/coworkers/bodo/server/assessment/assessment.service";
import { NewAssessmentForm } from "./new/new-assessment-form";

export default async function StandortePage() {
  const session = await requireSession();
  const items = await listAssessments(session.orgId);
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-extrabold mb-6">📍 Standorte</h1>
      <div className="mb-8"><NewAssessmentForm /></div>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/c/bodo/standorte/${a.id}`} className="card p-4 block hover:shadow-md">
              <span className="font-semibold">{a.address}</span>
              <span className="text-muted ml-2 text-sm">{a.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Detail-Datenladen + Seite**

`src/app/(app)/c/bodo/standorte/[id]/data.ts`:

```ts
import { requireSession } from "@/server/auth/require-session";
import { getAssessment } from "@/coworkers/bodo/server/assessment/assessment.service";

export async function loadAssessment(id: string) {
  const session = await requireSession();
  return getAssessment(session.orgId, id);
}
```

`src/app/(app)/c/bodo/standorte/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadAssessment } from "./data";

export default async function AssessmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await loadAssessment(id);
  if (!a) notFound();
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-bold">{a.address}</h1>
      <p className="text-muted mt-1">Status: {a.status}</p>
      {a.status === "ready" && (
        <pre className="mt-6 text-xs bg-black/[0.03] rounded-lg p-4 overflow-auto">
          {JSON.stringify(a.profile, null, 2)}
        </pre>
      )}
      {a.status === "failed" && <p className="text-red-600 mt-4">Fehler: {a.error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + Lint-Boundaries**

Run: `pnpm exec tsc --noEmit && pnpm lint:boundaries`
Expected: PASS (Bodo greift nicht in Interna anderer Coworker).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/c/bodo"
git commit -m "feat(bodo): guarded UI shell (list, new, detail)"
```

---

## Task 9: Seed `OrgModule` für Bodo

**Files:**
- Modify: `scripts/seed-coworkers.ts`

- [ ] **Step 1: Seed-Logik ansehen**

Run: `cat scripts/seed-coworkers.ts`
Expected: zeigt, wie Franz pro Org als `OrgModule` freigeschaltet wird.

- [ ] **Step 2: Bodo analog ergänzen**

Im Seed-Skript für jede Org zusätzlich eine `OrgModule`-Row für `coworkerId: "bodo"` (enabled: true) per `upsert` anlegen — exakt nach dem Muster der vorhandenen Franz-Zeile (gleiche `upsert`-Struktur, nur `coworkerId` „bodo").

- [ ] **Step 3: Seed laufen lassen**

Run: `pnpm seed:coworkers`
Expected: Bodo für bestehende Orgs freigeschaltet, keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-coworkers.ts
git commit -m "feat(bodo): seed OrgModule entitlement"
```

---

## Definition of Done (Plan 1)

- [ ] `pnpm exec tsc --noEmit` grün
- [ ] `pnpm test src/coworkers/bodo` grün
- [ ] `pnpm lint && pnpm lint:boundaries` grün
- [ ] Manuell: Dashboard zeigt Bodo-Karte „aktiv" → „Öffnen" → Adresse eingeben → Detailseite zeigt nach Job-Lauf Status `ready` (Stub-Profil als JSON).
- [ ] Inngest-Worker (`pnpm dev:inngest`) verarbeitet `assessment/requested`.

**Nächste Phase:** `2026-06-14-bodo-plan-2-sources.md` ersetzt die Stubs (`geocode`, `buildProfile`) durch echte Datenquellen-Adapter.
