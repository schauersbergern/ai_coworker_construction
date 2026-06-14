# Bodo Plan 3 — Scoring, Narrative & PDF-Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem `LocationProfile` deterministische Scores berechnen, einen Claude-Mikrolage-Text erzeugen und ein PDF-Dossier exportierbar machen — der Job schreibt `scores` + `narrative`, die Detailseite rendert Scores und bietet PDF-Download.

**Architecture:** Reine Scoring-Funktionen (keine Seiteneffekte, voll getestet) + Narrative-Port mit Claude-Implementierung (Anthropic SDK, wie Franz docgen) + React-PDF-Dossier (wie `franz/server/pdf`). Job wird um Scoring/Narrative erweitert; PDF on-demand wie Franz-Report-Download.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, `@react-pdf/renderer`, `@/server/storage`, Vitest.

**Voraussetzung:** Plan 1 + 2 abgeschlossen. Referenzen: `franz/server/docgen/claude-doc-generator.ts`, `franz/server/pdf/*`, `franz/server/reports/generate-report.ts`.

---

## Task 1: Scoring (reine Funktionen)

**Files:** Create `src/coworkers/bodo/server/scoring/score.ts` + `score.test.ts`

- [ ] **Step 1: Failing test** (Fixtures: vollständiges, teilweises, leeres Profil)

```ts
import { describe, it, expect } from "vitest";
import { computeScores } from "./score";
import { ok, unavailable } from "../sources/types";

const weights = { nahversorgung: 1, oepnv: 1, schulen: 1, gruen: 1, walkability: 1, kaufkraft: 1, gastroKultur: 1 };

function profile(fields: Record<string, unknown>) {
  return { coordinate: { lat: 48, lon: 11 }, district: ok("X", { source: "", license: "", confidence: "high" }),
    plz: ok("1", { source: "", license: "", confidence: "high" }), elevation: ok(550, { source: "", license: "", confidence: "high" }),
    fields } as any;
}

describe("computeScores", () => {
  it("returns ampel/score/zielgruppen for a populated profile", () => {
    const p = profile({
      pois: ok({ supermarket: { count: 2, nearestM: 300 }, pharmacy: { count: 1, nearestM: 377 }, school: { count: 3, nearestM: 200 }, park: { count: 0, nearestM: null }, restaurant: { count: 1, nearestM: 48 } }, { source: "", license: "", confidence: "medium" }),
      transit: ok({ nearest: { name: "Kiefernstr.", distanceM: 341 } }, { source: "", license: "", confidence: "high" }),
      hochwasser: ok({ hqHaeufig: false, hq100: false, hqExtrem: false }, { source: "", license: "", confidence: "high" }),
    });
    const s = computeScores(p, { weights });
    expect(["gruen", "gelb", "rot"]).toContain(s.ampel);
    expect(s.vermarktungsScore).toBeGreaterThanOrEqual(0);
    expect(s.vermarktungsScore).toBeLessThanOrEqual(100);
    expect(s.zielgruppen.length).toBeGreaterThan(0);
    expect(s.primaereZielgruppe).toBeTruthy();
  });

  it("does not crash on an empty profile (all unavailable)", () => {
    const p = profile({
      pois: unavailable({ source: "", license: "", reason: "x" }),
      transit: unavailable({ source: "", license: "", reason: "x" }),
    });
    const s = computeScores(p, { weights });
    expect(s.vermarktungsScore).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** (reine Funktion; fehlende Felder = neutral)

```ts
import type { LocationProfile } from "../pipeline/profile";
import type { DataPoint } from "../sources/types";

export type Ampel = "gruen" | "gelb" | "rot";
export interface Zielgruppe { id: string; label: string; score: number; }
export interface Scores {
  ampel: Ampel;
  vermarktungsScore: number; // 0-100
  teilscores: Record<string, number>;
  zielgruppen: Zielgruppe[];
  primaereZielgruppe: string;
  investitionsSignal: { score: number; label: string };
}

function val<T>(dp: DataPoint<T> | undefined): T | null {
  return dp && dp.status === "ok" ? dp.value : null;
}
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function distScore(m: number | null, good: number, bad: number): number {
  if (m == null) return 0.5; // neutral bei fehlenden Daten
  if (m <= good) return 1;
  if (m >= bad) return 0;
  return clamp01(1 - (m - good) / (bad - good));
}

export function computeScores(p: LocationProfile, cfg: { weights: Record<string, number> }): Scores {
  const pois = val<Record<string, { count: number; nearestM: number | null }>>(p.fields.pois as DataPoint<any>);
  const transit = val<{ nearest: { distanceM: number } }>(p.fields.transit as DataPoint<any>);

  const teil: Record<string, number> = {
    nahversorgung: pois ? distScore(pois.supermarket?.nearestM ?? null, 300, 1500) : 0.5,
    oepnv: transit ? distScore(transit.nearest?.distanceM ?? null, 300, 1000) : 0.5,
    schulen: pois ? clamp01((pois.school?.count ?? 0) / 5) : 0.5,
    gruen: pois ? clamp01((pois.park?.count ?? 0) / 3) : 0.5,
    walkability: pois ? clamp01(((pois.supermarket?.count ?? 0) + (pois.restaurant?.count ?? 0) + (pois.pharmacy?.count ?? 0)) / 10) : 0.5,
    kaufkraft: 0.5, // ergänzt sobald sozio-Adapter Kaufkraftnähe liefert
    gastroKultur: pois ? clamp01((pois.restaurant?.count ?? 0) / 5) : 0.5,
  };

  const totalW = Object.values(cfg.weights).reduce((a, b) => a + b, 0) || 1;
  const weighted = Object.entries(teil).reduce((sum, [k, v]) => sum + v * (cfg.weights[k] ?? 0), 0) / totalW;
  const vermarktungsScore = Math.round(weighted * 100);

  const ampel: Ampel = vermarktungsScore >= 66 ? "gruen" : vermarktungsScore >= 40 ? "gelb" : "rot";

  const zielgruppen: Zielgruppe[] = [
    { id: "familien", label: "Familien", score: Math.round((teil.schulen * 0.5 + teil.gruen * 0.3 + teil.nahversorgung * 0.2) * 100) },
    { id: "young_professionals", label: "Young Professionals", score: Math.round((teil.oepnv * 0.5 + teil.gastroKultur * 0.5) * 100) },
    { id: "studenten", label: "Studenten", score: Math.round((teil.oepnv * 0.6 + teil.nahversorgung * 0.4) * 100) },
    { id: "kapitalanleger", label: "Kapitalanleger", score: Math.round((teil.kaufkraft * 0.6 + teil.nahversorgung * 0.4) * 100) },
    { id: "senioren", label: "Senioren", score: Math.round((teil.nahversorgung * 0.5 + teil.oepnv * 0.5) * 100) },
  ].sort((a, b) => b.score - a.score);

  return {
    ampel,
    vermarktungsScore,
    teilscores: Object.fromEntries(Object.entries(teil).map(([k, v]) => [k, Math.round(v * 100)])),
    zielgruppen,
    primaereZielgruppe: zielgruppen[0].label,
    investitionsSignal: { score: vermarktungsScore, label: vermarktungsScore < 40 ? "Entwicklungslage" : "Leichtes Signal" },
  };
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(bodo): deterministic scoring`.

---

## Task 2: Narrative-Port + Claude-Implementierung

**Files:** Create `src/coworkers/bodo/server/narrative/narrative.ts`, `claude-narrative.ts`, `narrative.test.ts`

- [ ] **Step 1: Failing test** (Port mit gefaktem Generator → deterministischer Text; prüft, dass unavailable-Felder nicht als Fakt erscheinen)

```ts
import { describe, it, expect, vi } from "vitest";
import { buildNarrative } from "./narrative";

it("calls the generator with profile+scores and returns its text", async () => {
  const gen = { generate: vi.fn(async () => "Mikrolage-Text") };
  const text = await buildNarrative({ profile: { fields: {} } as any, scores: { ampel: "gelb" } as any, systemPrompt: "SP" }, gen);
  expect(text).toBe("Mikrolage-Text");
  expect(gen.generate).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement port**

`narrative.ts`:

```ts
import type { LocationProfile } from "../pipeline/profile";
import type { Scores } from "../scoring/score";

export interface NarrativeGenerator {
  generate(input: { systemPrompt: string; userContent: string }): Promise<string>;
}

export interface NarrativeInput { profile: LocationProfile; scores: Scores; systemPrompt: string; }

/** Serialisiert nur belastbare (ok) Felder + Status der übrigen, damit das LLM nichts erfindet. */
export function serializeForLlm(profile: LocationProfile, scores: Scores): string {
  const fields = Object.fromEntries(
    Object.entries(profile.fields).map(([k, dp]) => [k, dp.status === "ok" ? dp.value : { status: dp.status, reason: dp.reason }]),
  );
  return JSON.stringify({ coordinate: profile.coordinate, scores, fields }, null, 2);
}

export async function buildNarrative(input: NarrativeInput, gen: NarrativeGenerator): Promise<string> {
  return gen.generate({ systemPrompt: input.systemPrompt, userContent: serializeForLlm(input.profile, input.scores) });
}
```

`claude-narrative.ts` (Referenz: `franz/server/docgen/claude-doc-generator.ts` — gleicher SDK-Aufruf-Stil/Model):

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { NarrativeGenerator } from "./narrative";

export class ClaudeNarrativeGenerator implements NarrativeGenerator {
  private client = new Anthropic();
  async generate({ systemPrompt, userContent }: { systemPrompt: string; userContent: string }): Promise<string> {
    const msg = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: `Standortdaten (JSON):\n\n${userContent}` }],
    });
    return msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  }
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(bodo): narrative port + claude generator`.

> Modell-ID gegen `franz/server/docgen/claude-doc-generator.ts` abgleichen und dieselbe verwenden (Konsistenz mit bestehender Anthropic-Nutzung). Bei Anthropic-Fehler darf der Job `ready` bleiben mit `narrative=null` (siehe Task 4).

---

## Task 3: Scoring + Narrative in den Job einhängen

**Files:** Modify `src/coworkers/bodo/run-assessment.ts`, `run-assessment.test.ts`, `src/inngest/functions.ts`

- [ ] **Step 1: Test erweitern** — nach `runAssessment` ist `scores` befüllt und (mit gefaktem Generator) `narrative` gesetzt; bei Generator-Fehler bleibt Status `ready`, `narrative=null`.

```ts
it("computes scores and narrative on the happy path", async () => {
  const a = await createAssessment("org1", "addr", { snapshot: { narrative: { systemPrompt: "SP" }, scoring: { weights: {} }, sources: {} }, version: 0 });
  await runAssessment(a.id, { ...deps, generateNarrative: vi.fn(async () => "Text") });
  const after = await db.assessment.findUnique({ where: { id: a.id } });
  expect(after?.status).toBe("ready");
  expect(after?.narrative).toBe("Text");
  expect(after?.scores).toBeTruthy();
});

it("stays ready with null narrative if generator throws", async () => {
  const a = await createAssessment("org1", "addr", { snapshot: { narrative: { systemPrompt: "SP" }, scoring: { weights: {} }, sources: {} }, version: 0 });
  await runAssessment(a.id, { ...deps, generateNarrative: vi.fn(async () => { throw new Error("anthropic down"); }) });
  const after = await db.assessment.findUnique({ where: { id: a.id } });
  expect(after?.status).toBe("ready");
  expect(after?.narrative).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** — `RunAssessmentDeps` um `computeScores`-Aufruf + `generateNarrative(input): Promise<string>` erweitern; im Job nach `buildProfile`:

```ts
// in runAssessment, nach profile:
const snapshot = snap.configSnapshot as { narrative?: { systemPrompt?: string }; scoring?: { weights?: Record<string, number> } };
const scores = computeScores(profile, { weights: snapshot.scoring?.weights ?? {} });

let narrative: string | null = null;
try {
  narrative = await deps.generateNarrative({ profile, scores, systemPrompt: snapshot.narrative?.systemPrompt ?? "" });
} catch (e) {
  log("bodo", "narrative failed, continuing", { id, error: e instanceof Error ? e.message : String(e) });
}

await markReady(id, {
  profile: profile as unknown as object,
  scores: scores as unknown as object,
  narrative,
  lat: geo.lat, lon: geo.lon, district: geo.district, plz: geo.plz, elevation: geo.elevation,
});
```

Imports oben in `run-assessment.ts`: `import { computeScores } from "./server/scoring/score";` und `NarrativeInput`-Typ; `RunAssessmentDeps` erhält `generateNarrative: (input: NarrativeInput) => Promise<string>`.

In `src/inngest/functions.ts` die echten Implementierungen injizieren:

```ts
import { buildNarrative } from "@/coworkers/bodo/server/narrative/narrative";
import { ClaudeNarrativeGenerator } from "@/coworkers/bodo/server/narrative/claude-narrative";
```
```ts
// im runAssessmentJob-Aufruf:
await runAssessment(assessmentId, {
  isAvailable, geocode, buildProfile,
  generateNarrative: (input) => buildNarrative(input, new ClaudeNarrativeGenerator()),
});
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(bodo): scoring + narrative in job`.

---

## Task 4: PDF-Dossier (React-PDF)

**Files:** Create `src/coworkers/bodo/server/pdf/dossier-document.tsx`, `render-dossier.tsx`, `render-dossier.test.ts` (Referenz: `franz/server/pdf/report-document.tsx`, `render-report.tsx`)

- [ ] **Step 1: Failing test** — Render erzeugt einen nicht-leeren Buffer.

```ts
import { describe, it, expect } from "vitest";
import { renderDossier } from "./render-dossier";

it("renders a non-empty PDF buffer", async () => {
  const buf = await renderDossier({
    address: "Kiefernstr. 25, München",
    scores: { ampel: "gelb", vermarktungsScore: 42, teilscores: {}, zielgruppen: [{ id: "familien", label: "Familien", score: 50 }], primaereZielgruppe: "Familien", investitionsSignal: { score: 42, label: "Entwicklungslage" } } as any,
    narrative: "Mikrolage-Text",
    profile: { coordinate: { lat: 48, lon: 11 }, fields: {} } as any,
  });
  expect(buf.length).toBeGreaterThan(1000);
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

`dossier-document.tsx` — React-PDF-Komponente mit Sektionen: Kopf (Adresse, Koordinaten, Ampel), Scores (Vermarktungs-Score + Teilscores), Zielgruppen, Mikrolage-Text, und eine „Datenpunkte"-Tabelle, die je Feld `value`/`status`+`reason`+`source`+`license` zeigt (so erscheinen `unavailable`-Felder transparent als „Nicht ermittelbar"). Aufbau analog `franz/server/pdf/report-document.tsx` (`Document/Page/View/Text`, `StyleSheet.create`).

`render-dossier.tsx`:

```ts
import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { DossierDocument, type DossierProps } from "./dossier-document";

export async function renderDossier(props: DossierProps): Promise<Buffer> {
  return renderToBuffer(<DossierDocument {...props} />);
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(bodo): PDF dossier renderer`.

---

## Task 5: PDF-Export-Route + Button (on-demand)

**Files:** Create `src/app/(app)/c/bodo/standorte/[id]/export-button.tsx`, `src/app/(app)/c/bodo/standorte/[id]/dossier/route.ts` (Referenz: Franz Export/`export-button.tsx`, Report-Download). Modify `[id]/page.tsx`.

- [ ] **Step 1: Route** — `GET` gated mit `isAvailable`, lädt org-scoped Assessment, rendert (oder liest gecachtes) PDF, streamt `application/pdf`.

```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { isAvailable } from "@/coworkers";
import { getAssessment } from "@/coworkers/bodo/server/assessment/assessment.service";
import { renderDossier } from "@/coworkers/bodo/server/pdf/render-dossier";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!(await isAvailable(session.orgId, "bodo"))) return new NextResponse("not available", { status: 403 });
  const a = await getAssessment(session.orgId, id);
  if (!a || a.status !== "ready") return new NextResponse("not ready", { status: 404 });
  const buf = await renderDossier({ address: a.address, scores: a.scores as any, narrative: a.narrative, profile: a.profile as any });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="lagebewertung-${a.id}.pdf"` },
  });
}
```

- [ ] **Step 2: Button + Scores-Anzeige** in `[id]/page.tsx` ergänzen: bei `status==="ready"` Ampel + Vermarktungs-Score + primäre Zielgruppe + Mikrolage-Text rendern und einen Link/Button `<a href={`/c/bodo/standorte/${id}/dossier`}>PDF-Dossier exportieren</a>`.
- [ ] **Step 3:** `pnpm exec tsc --noEmit && pnpm lint:boundaries` → grün.
- [ ] **Step 4: Commit** `feat(bodo): PDF export route + detail rendering`.

---

## Task 6: Konfigurierbarkeit verifizieren (Quellen-Flag-Test)

**Files:** Test `src/coworkers/bodo/server/pipeline/build-profile.test.ts` (erweitern)

- [ ] **Step 1: Test** — `config.sources.pois = false` ⇒ `profile.fields.pois.status === "unavailable"` mit Grund „per Konfiguration deaktiviert", und der POI-Adapter wird nicht aufgerufen.
- [ ] **Step 2: Run → PASS** (Logik existiert seit Plan 2 Task 15; dieser Test sichert das Leitprinzip „Flag + Config-Zeile").
- [ ] **Step 3: Commit** `test(bodo): source toggle via config`.

---

## Definition of Done (Plan 3 / Gesamt-MVP)

- [ ] `computeScores` getestet (voll/teilweise/leer), liefert Ampel + 0–100-Score + Zielgruppen.
- [ ] Job schreibt `scores` immer, `narrative` wenn Claude verfügbar (sonst `ready` + `null`).
- [ ] PDF-Dossier rendert; Export-Route gated + org-scoped; Detailseite zeigt Scores + Text + Export-Button.
- [ ] Quellen-Flags steuern die Pipeline (Leitprinzip erfüllt).
- [ ] `pnpm test src/coworkers/bodo` · `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm lint:boundaries` alle grün.
- [ ] Manueller E2E: echte Münchner Adresse → Ampel/Score/Zielgruppen/Mikrolage-Text auf der Detailseite → PDF-Download enthält dieselben Daten inkl. transparenter „Nicht ermittelbar"-Felder.

**Damit ist der Bodo-MVP funktional komplett.** Spätere Ausbaustufen (eigene Plan-Dateien): weitere Bundesländer via `RegionProvider`, Self-Hosting Nominatim/Overpass + echtes Routing, Investitions-Signal-Verfeinerung, Bodenrichtwert/`erhalt_umgriff` sobald geklärt.
