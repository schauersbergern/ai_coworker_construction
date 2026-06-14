# Bodo Plan 3 — Scoring, Narrative & PDF-Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem `LocationProfile` deterministische Scores berechnen, einen Claude-Mikrolage-Text erzeugen und ein PDF-Dossier exportierbar machen — der Job schreibt `scores` + `narrative`, die Detailseite rendert Scores und bietet PDF-Download.

**Architecture:** Reine Scoring-Funktionen (keine Seiteneffekte, voll getestet) + Narrative-Port mit Claude-Implementierung (Anthropic SDK, wie Franz docgen) + React-PDF-Dossier (Komponenten-/Renderer-Aufbau analog `franz/server/pdf`). Job wird um Scoring/Narrative erweitert. **Unterschied zu Franz:** Franz erzeugt Berichte asynchron über einen Job und legt das PDF im Storage ab; Bodo rendert das Dossier **synchron on-demand** in einer `GET`-Route aus dem bereits persistierten `profile`/`scores`/`narrative` und streamt es (kein Storage/Cache, kein `pdfPath`) — bewusst einfacher.

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

  it("forces a red Ampel and lowers the signal in a HQ100 flood zone", () => {
    const strongPois = ok(
      { supermarket: { count: 3, nearestM: 150 }, pharmacy: { count: 2, nearestM: 100 }, school: { count: 4, nearestM: 120 }, park: { count: 2, nearestM: 80 }, restaurant: { count: 5, nearestM: 40 } },
      { source: "", license: "", confidence: "medium" },
    );
    const p = profile({
      pois: strongPois,
      transit: ok({ nearest: { distanceM: 120 } }, { source: "", license: "", confidence: "high" }),
      hochwasser: ok({ hqHaeufig: false, hq100: true, hqExtrem: true }, { source: "", license: "", confidence: "high" }),
    });
    const s = computeScores(p, { weights });
    expect(s.ampel).toBe("rot"); // trotz starker Lage → durch Hochwasser gedeckelt
    expect(s.investitionsSignal.risiken).toContain("Hochwassergefahr (HQ100/häufig)");
    expect(s.investitionsSignal.score).toBeLessThan(s.vermarktungsScore);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** (reine Funktion; fehlende Felder = neutral)

```ts
import type { LocationProfile } from "../pipeline/profile";
import type { DataPoint } from "../sources/types";
import type { ScoringWeights } from "../../config";

export type Ampel = "gruen" | "gelb" | "rot";
export interface Zielgruppe { id: string; label: string; score: number; }
export interface Scores {
  ampel: Ampel;
  vermarktungsScore: number; // 0-100
  teilscores: Record<string, number>;
  zielgruppen: Zielgruppe[];
  primaereZielgruppe: string;
  investitionsSignal: { score: number; label: string; risiken: string[] };
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

export function computeScores(p: LocationProfile, cfg: { weights: ScoringWeights }): Scores {
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

  // Gewichte sind per Schema fest & nichtnegativ (config), also 0 ≤ weighted ≤ 1.
  // Clamp dennoch defensiv → vermarktungsScore garantiert in [0,100].
  const totalW = Object.values(cfg.weights).reduce((a, b) => a + b, 0) || 1;
  const weighted = Object.entries(teil).reduce((sum, [k, v]) => sum + v * (cfg.weights[k as keyof ScoringWeights] ?? 0), 0) / totalW;
  const vermarktungsScore = Math.max(0, Math.min(100, Math.round(weighted * 100)));

  // --- Standortrisiken (preishemmend) — gehen in Ampel UND Investitions-Signal ein ---
  const flood = val<{ hqHaeufig: boolean; hq100: boolean; hqExtrem: boolean }>(p.fields.hochwasser as DataPoint<any>);
  const geol = val<{ grundwasserHoch: boolean }>(p.fields.geologie as DataPoint<any>);
  const natur = val<{ nsg: boolean; lsg: boolean; ffh: boolean; vogel: boolean; biotop: boolean }>(p.fields.natur as DataPoint<any>);
  const denkmal = val<{ einzeldenkmal: boolean; ensemble: boolean; bodendenkmal: boolean }>(p.fields.denkmal as DataPoint<any>);

  const risiken: { label: string; severity: number }[] = [];
  if (flood?.hq100 || flood?.hqHaeufig) risiken.push({ label: "Hochwassergefahr (HQ100/häufig)", severity: 3 });
  else if (flood?.hqExtrem) risiken.push({ label: "Hochwasser bei Extremereignis (HQextrem)", severity: 1 });
  if (geol?.grundwasserHoch) risiken.push({ label: "Hohe Grundwasserstände", severity: 1 });
  if (natur?.nsg || natur?.ffh || natur?.vogel) risiken.push({ label: "Strenger Naturschutz (NSG/FFH/Vogelschutz)", severity: 3 });
  else if (natur?.lsg || natur?.biotop) risiken.push({ label: "Landschaftsschutz/Biotop", severity: 1 });
  if (denkmal?.einzeldenkmal || denkmal?.ensemble) risiken.push({ label: "Denkmalschutz (Einzel/Ensemble)", severity: 2 });
  else if (denkmal?.bodendenkmal) risiken.push({ label: "Bodendenkmal", severity: 1 });

  const riskPenalty = risiken.reduce((s, r) => s + r.severity, 0);
  const hardRisk = risiken.some((r) => r.severity >= 3);

  // Ampel aus Vermarktungs-Score, durch Risiken gedeckelt: harte Risiken (Hochwasser
  // HQ100/häufig, strenger Naturschutz) erzwingen rot; mittlere Risiken bremsen grün → gelb.
  let ampel: Ampel = vermarktungsScore >= 66 ? "gruen" : vermarktungsScore >= 40 ? "gelb" : "rot";
  if (hardRisk) ampel = "rot";
  else if (riskPenalty >= 2 && ampel === "gruen") ampel = "gelb";

  // Investitions-Signal = Vermarktung minus preishemmende Faktoren (nicht bloße Kopie).
  const signalScore = Math.max(0, Math.min(100, vermarktungsScore - riskPenalty * 8));
  const investitionsSignal = {
    score: signalScore,
    label: hardRisk ? "Erhöhtes Risiko" : signalScore >= 66 ? "Positives Signal" : signalScore >= 40 ? "Neutral" : "Entwicklungslage",
    risiken: risiken.map((r) => r.label),
  };

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
    investitionsSignal,
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

// Konstruktion 1:1 wie franz/server/docgen/claude-doc-generator.ts: API-Key UND Modell
// kommen aus der Umgebung (kein hartkodiertes Modell), und fehlen sie, wirft der
// Konstruktor sauber. So bleibt die Anthropic-Nutzung im Repo konsistent/konfigurierbar.
export class ClaudeNarrativeGenerator implements NarrativeGenerator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set. Please configure it in your environment.");
    }
    const model = process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new Error("ANTHROPIC_MODEL is not set. Please configure it in your environment.");
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate({ systemPrompt, userContent }: { systemPrompt: string; userContent: string }): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: `Standortdaten (JSON):\n\n${userContent}` }],
    });
    return msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  }
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(bodo): narrative port + claude generator`.

> Modell + Key kommen aus `ANTHROPIC_MODEL` / `ANTHROPIC_API_KEY` (identisch zu `franz/server/docgen/claude-doc-generator.ts`) — nicht hartkodieren. Bei Anthropic-Fehler darf der Job `ready` bleiben mit `narrative=null` (siehe Task 4).

---

## Task 3: Scoring + Narrative in den Job einhängen

**Files:** Modify `src/coworkers/bodo/run-assessment.ts`, `run-assessment.test.ts`, `src/inngest/functions.ts`

- [ ] **Step 1: Test erweitern** — nach `runAssessment` ist `scores` befüllt und (mit gefaktem Generator) `narrative` gesetzt; bei Generator-Fehler bleibt Status `ready`, `narrative=null`.

```ts
it("computes scores and narrative on the happy path", async () => {
  const a = await createAssessment("org1", "addr", { snapshot: { narrative: { systemPrompt: "SP" }, scoring: { weights: {} }, sources: {} }, version: 0 });
  await runAssessment(a.id, { ...deps, generateNarrative: vi.fn(async () => "Text") });
  const after = await prisma.assessment.findUnique({ where: { id: a.id } });
  expect(after?.status).toBe("ready");
  expect(after?.narrative).toBe("Text");
  expect(after?.scores).toBeTruthy();
});

it("stays ready with null narrative if generator throws", async () => {
  const a = await createAssessment("org1", "addr", { snapshot: { narrative: { systemPrompt: "SP" }, scoring: { weights: {} }, sources: {} }, version: 0 });
  await runAssessment(a.id, { ...deps, generateNarrative: vi.fn(async () => { throw new Error("anthropic down"); }) });
  const after = await prisma.assessment.findUnique({ where: { id: a.id } });
  expect(after?.status).toBe("ready");
  expect(after?.narrative).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** — `RunAssessmentDeps` um `computeScores`-Aufruf + `generateNarrative(input): Promise<string>` erweitern; im Job nach `buildProfile`:

```ts
// in runAssessment, nach profile:
// configSnapshot NICHT roh casten: über das Manifest-Schema migrieren (configVersion →
// aktuelle Version via configMigrations), über Defaults mergen und validieren — exakt das,
// was resolveConfig() auch für die Live-Config tut. Bei ungültigem Snapshot fällt es laut
// geloggt auf Defaults zurück (statt mit kaputten Gewichten/Prompt zu rechnen).
const cfg = resolveConfig(bodoManifest, {
  config: snap.configSnapshot,
  configVersion: snap.configVersion,
});
const scores = computeScores(profile, { weights: cfg.scoring.weights });

let narrative: string | null = null;
try {
  narrative = await deps.generateNarrative({ profile, scores, systemPrompt: cfg.narrative.systemPrompt });
} catch (e) {
  log("bodo", "narrative failed, continuing", { id, error: e instanceof Error ? e.message : String(e) });
}

await markReady(id, {
  profile: profile as unknown as Prisma.InputJsonValue,
  scores: scores as unknown as Prisma.InputJsonValue,
  narrative,
  lat: geo.lat, lon: geo.lon,
});
```

Imports oben in `run-assessment.ts`:
```ts
import { resolveConfig } from "@/coworkers";            // re-exportiert in Plan 1 Task 3
import { bodoManifest } from "./manifest";
import { computeScores } from "./server/scoring/score";
import type { NarrativeInput } from "./server/narrative/narrative";
// (Prisma-Typ ist seit Plan 1 importiert)
```
`RunAssessmentDeps` erhält `generateNarrative: (input: NarrativeInput) => Promise<string>`.

> Hinweis: `getSnapshot` liefert `configVersion` mit (Plan 1 Task 6). Da `cfg` voll typisiert
> ist (`BodoConfig`), ist `cfg.scoring.weights` bereits `ScoringWeights` — passt direkt auf
> `computeScores`.

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

**Files:** Create `src/app/(app)/c/bodo/standorte/[id]/export-button.tsx`, `src/app/(app)/c/bodo/standorte/[id]/dossier/route.ts`. Modify `[id]/page.tsx`. (UI-Muster für den Button: Franz `export-button.tsx`; der Dossier-Endpunkt selbst ist aber eine eigene synchrone Render-Route, nicht Franz' async Report-Erzeugung.)

> **Gating-Hinweis:** `layout.tsx` schützt **keine** Route-Handler (`route.ts`) — Layouts umschließen nur Pages. Die Dossier-Route MUSS daher selbst `isAvailable(orgId, "bodo")` prüfen (Defense-in-Depth, siehe Spec §9). Genau das macht Step 1.

- [ ] **Step 1: Route** — `GET` gated mit `isAvailable`, lädt org-scoped Assessment, rendert das PDF frisch (kein Cache), streamt `application/pdf`.

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
