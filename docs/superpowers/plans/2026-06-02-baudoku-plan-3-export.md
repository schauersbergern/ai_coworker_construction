# Baudoku MVP – Plan 3: KI-PDF-Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When implementing the Claude integration (Task 2), invoke the **claude-api** skill.

**Goal:** Auf der Projekt-Detailseite löst „Dokumentation exportieren" einen Hintergrund-Job aus, der aus den Transkripten via **Claude** strukturierte Feststellungen erzeugt, Fotos **deterministisch per Zeitstempel (±2 Min)** zuordnet und ein **PDF** (@react-pdf/renderer) rendert. Das PDF ist herunterladbar.

**Architecture:** Aufbauend auf Plan 1+2. Neue Module unter `src/server/reports` (Service + Matching + Job-Logik), `src/server/docgen` (DocGenerator-Abstraktion: Fake + Claude), `src/server/pdf` (Renderer). Der Export läuft als **Inngest**-Job (`report/requested`). LLM und PDF hinter Interfaces → Tests nutzen Fakes (kein API-Key/Netz nötig). PDFs werden im bestehenden lokalen Storage abgelegt (`projects/<projectId>/reports/<reportId>.pdf`) und über die bestehende org-geprüfte `/api/files`-Route ausgeliefert.

**Tech Stack:** Next.js 16, Prisma 6, Inngest, **@anthropic-ai/sdk** (Claude, Structured Output via Tool-Use + Prompt Caching), **@react-pdf/renderer**, Vitest.

**Externe Voraussetzung (nur für ECHTE Generierung, nicht für Tests):** `ANTHROPIC_API_KEY` in der Umgebung. Tests nutzen `FakeDocGenerator` und brauchen keinen Key.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-01-baudoku-mvp-design.md` (§6b Doku-Generierung, §7 PDF-Output, §8 Fehlerbehandlung)

---

## Datenmodell-Hinweis
Das `Report`-Modell existiert bereits (Plan 1): `{ id, projectId, label, status (pending|done|failed), pdfUrl?, reportJson (Json?), createdById?, generatedAt }`. Kein Schema-Change nötig.
- `Report.reportJson` = die strukturierte KI-Ausgabe (`ReportContent`, s. u.).
- `Report.pdfUrl` = Storage-Key des PDFs.

---

## Dateistruktur (in diesem Plan angelegt/berührt)

- `src/server/reports/report-content.ts` — Typen `ReportContent` / `Finding`
- `src/server/reports/photo-matching.ts` (+ `.test.ts`) — deterministische Foto→Notiz-Zuordnung (±2 Min)
- `src/server/reports/reports.service.ts` (+ `.test.ts`) — Report-CRUD (org-scoped) + Statushelfer
- `src/server/reports/reports.internal.ts` — org-loser Loader für den Job
- `src/server/reports/generate-report.ts` (+ `.test.ts`) — Job-Logik (DI: docgen, renderer, storage)
- `src/server/docgen/doc-generator.ts` — `DocGenerator`-Interface + `FakeDocGenerator`
- `src/server/docgen/claude-doc-generator.ts` — Claude-Implementierung (claude-api skill)
- `src/server/pdf/report-document.tsx` — @react-pdf-Dokumentkomponente (rein, nimmt fertige Daten)
- `src/server/pdf/render-report.tsx` (+ `.test.ts`) — `renderReportPdf(content) → Buffer` (JSX → `.tsx`)
- `src/inngest/functions.ts` — `generateReport`-Function ergänzen
- `src/inngest/client.ts` — Event `report/requested` ergänzen
- `src/app/api/projects/[id]/reports/route.ts` — Export-Trigger (POST) mit Leer-Guard + Enqueue-Failure-Handling
- `src/app/(app)/projects/[id]/reports-list.tsx` — Report-Liste (Status + Download)
- `src/app/(app)/projects/[id]/export-button.tsx` — „Dokumentation exportieren"
- `src/app/(app)/projects/[id]/page.tsx` + `data.ts` — Reports laden + Sektion einbinden
- `.env.example` / `.env` — `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`

---

## Task 0: Report-Content-Typen + Foto-Matching (±2 Min) — TDD

**Files:** create `src/server/reports/report-content.ts`, `src/server/reports/photo-matching.ts`, `src/server/reports/photo-matching.test.ts`.

- [ ] **Step 1: Typen `report-content.ts`**
```ts
/** Eine vom LLM erzeugte Feststellung, 1:1 zu einer Notiz. */
export type Finding = {
  noteId: string;
  title: string;
  location?: string;
  text: string;
};

/** Die strukturierte Ausgabe der Doku-Generierung (wird als Report.reportJson gespeichert). */
export type ReportContent = {
  intro?: string;
  findings: Finding[];
};
```

- [ ] **Step 2: Failing test `photo-matching.test.ts`**
```ts
import { describe, expect, it } from "vitest";
import { matchPhotosToNotes } from "./photo-matching";

const t = (iso: string) => new Date(iso);

describe("matchPhotosToNotes", () => {
  const notes = [
    { id: "n1", recordedAt: t("2026-06-01T09:00:00Z") },
    { id: "n2", recordedAt: t("2026-06-01T09:10:00Z") },
  ];

  it("matches a photo to the nearest note within the window", () => {
    const r = matchPhotosToNotes(notes, [
      { id: "p1", effectiveTime: t("2026-06-01T09:01:00Z") }, // 1 min from n1
    ]);
    expect(r.byNote.get("n1")).toEqual(["p1"]);
    expect(r.unmatched).toEqual([]);
  });

  it("puts a photo outside the ±2min window into unmatched", () => {
    const r = matchPhotosToNotes(notes, [
      { id: "p1", effectiveTime: t("2026-06-01T09:05:00Z") }, // 5 min from n1, 5 from n2
    ]);
    expect(r.unmatched).toEqual(["p1"]);
    expect([...r.byNote.values()].flat()).toEqual([]);
  });

  it("assigns to the nearest of two candidate notes", () => {
    const r = matchPhotosToNotes(notes, [
      { id: "p1", effectiveTime: t("2026-06-01T09:09:00Z") }, // 9 from n1, 1 from n2
    ]);
    expect(r.byNote.get("n2")).toEqual(["p1"]);
  });

  it("is deterministic on ties (picks the earliest note)", () => {
    const tied = [
      { id: "a", recordedAt: t("2026-06-01T09:00:00Z") },
      { id: "b", recordedAt: t("2026-06-01T09:02:00Z") },
    ];
    const r = matchPhotosToNotes(tied, [{ id: "p", effectiveTime: t("2026-06-01T09:01:00Z") }]); // 60s to both
    expect(r.byNote.get("a")).toEqual(["p"]);
  });

  it("returns all photos unmatched when there are no notes", () => {
    const r = matchPhotosToNotes([], [{ id: "p1", effectiveTime: t("2026-06-01T09:00:00Z") }]);
    expect(r.unmatched).toEqual(["p1"]);
  });
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement `photo-matching.ts`**
```ts
export type NoteRef = { id: string; recordedAt: Date };
export type PhotoRef = { id: string; effectiveTime: Date };

export type MatchResult = {
  /** noteId → zugeordnete photoIds (in Eingabereihenfolge der Fotos) */
  byNote: Map<string, string[]>;
  /** Fotos ohne eindeutige Zuordnung im Fenster */
  unmatched: string[];
};

const WINDOW_MS = 2 * 60 * 1000; // ±2 Minuten

/**
 * Ordnet jedes Foto der zeitlich nächstgelegenen Notiz zu, sofern der Abstand
 * |effectiveTime − recordedAt| ≤ 2 Min ist. Bei Gleichstand gewinnt die früheste
 * Notiz (deterministisch). Sonst → unmatched. Rein funktional, kein I/O.
 */
export function matchPhotosToNotes(notes: NoteRef[], photos: PhotoRef[]): MatchResult {
  const byNote = new Map<string, string[]>();
  const unmatched: string[] = [];
  const sortedNotes = [...notes].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  for (const photo of photos) {
    let best: { noteId: string; dist: number } | null = null;
    for (const note of sortedNotes) {
      const dist = Math.abs(photo.effectiveTime.getTime() - note.recordedAt.getTime());
      if (dist <= WINDOW_MS && (best === null || dist < best.dist)) {
        best = { noteId: note.id, dist };
      }
    }
    if (best) {
      const list = byNote.get(best.noteId) ?? [];
      list.push(photo.id);
      byNote.set(best.noteId, list);
    } else {
      unmatched.push(photo.id);
    }
  }
  return { byNote, unmatched };
}
```
(Note: iterating `sortedNotes` with strict `dist < best.dist` means an exact tie keeps the earlier note — deterministic.)

- [ ] **Step 5: Run → PASS (5 tests). Commit:**
```bash
git add src/server/reports/report-content.ts src/server/reports/photo-matching.ts src/server/reports/photo-matching.test.ts
git commit -m "feat: report content types and deterministic photo-to-note matching (TDD)"
```

---

## Task 1: Report-Service (org-scoped) — TDD

**Files:** create `src/server/reports/reports.service.ts`, `src/server/reports/reports.service.test.ts`, `src/server/reports/reports.internal.ts`.

- [ ] **Step 1: Failing test `reports.service.test.ts`**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createReport, listReports, getReportForOrg, setReportResult, setReportStatus } from "./reports.service";

async function makeProject() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return { org, project };
}

describe("reports.service", () => {
  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a pending report and lists it org-scoped", async () => {
    const { org, project } = await makeProject();
    const r = await createReport(project.id, { label: "Export 1", createdById: null });
    expect(r.status).toBe("pending");
    const list = await listReports(org.id, project.id);
    expect(list.map((x) => x.id)).toContain(r.id);
  });

  it("does not list reports from another org", async () => {
    const a = await makeProject();
    const b = await makeProject();
    await createReport(a.project.id, { label: "X", createdById: null });
    expect(await listReports(b.org.id, a.project.id)).toHaveLength(0);
  });

  it("getReportForOrg enforces org scoping", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const r = await createReport(a.project.id, { label: "X", createdById: null });
    expect(await getReportForOrg(b.org.id, r.id)).toBeNull();
    expect((await getReportForOrg(a.org.id, r.id))?.id).toBe(r.id);
  });

  it("setReportResult marks done with pdfUrl + json; setReportStatus sets failed", async () => {
    const { project } = await makeProject();
    const r = await createReport(project.id, { label: "X", createdById: null });
    const done = await setReportResult(r.id, { pdfUrl: "projects/p/reports/x.pdf", reportJson: { findings: [] } });
    expect(done.status).toBe("done");
    expect(done.pdfUrl).toBe("projects/p/reports/x.pdf");
    const failed = await setReportStatus(r.id, "failed");
    expect(failed.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `reports.service.ts`**
```ts
import { prisma } from "@/server/db";
import type { Prisma, ReportStatus } from "@prisma/client";

export type CreateReportInput = { label: string; createdById: string | null };

export function createReport(projectId: string, input: CreateReportInput) {
  return prisma.report.create({
    data: {
      projectId,
      label: input.label,
      createdById: input.createdById ?? undefined,
      status: "pending",
    },
  });
}

export function listReports(orgId: string, projectId: string) {
  return prisma.report.findMany({
    where: { projectId, project: { orgId } },
    orderBy: { generatedAt: "desc" },
  });
}

export function getReportForOrg(orgId: string, reportId: string) {
  return prisma.report.findFirst({ where: { id: reportId, project: { orgId } } });
}

export function setReportResult(reportId: string, result: { pdfUrl: string; reportJson: Prisma.InputJsonValue }) {
  return prisma.report.update({
    where: { id: reportId },
    data: { pdfUrl: result.pdfUrl, reportJson: result.reportJson, status: "done" },
  });
}

export function setReportStatus(reportId: string, status: ReportStatus) {
  return prisma.report.update({ where: { id: reportId }, data: { status } });
}
```

- [ ] **Step 4: `reports.internal.ts`** (org-loser Loader für den Job):
```ts
import { prisma } from "@/server/db";
export { setReportResult, setReportStatus } from "./reports.service";

export function getReportById(reportId: string) {
  return prisma.report.findUnique({ where: { id: reportId } });
}

/** Lädt Projekt + Notizen (mit Transkript) + Fotos für die Generierung. */
export async function loadReportInputs(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const [notes, photos] = await Promise.all([
    prisma.note.findMany({ where: { projectId }, orderBy: { recordedAt: "asc" } }),
    prisma.photo.findMany({ where: { projectId } }),
  ]);
  return { project, notes, photos };
}
```

- [ ] **Step 5: Run → PASS (4 tests). Commit:**
```bash
git add src/server/reports/reports.service.ts src/server/reports/reports.service.test.ts src/server/reports/reports.internal.ts
git commit -m "feat: reports service (create/list/get/result) org-scoped (TDD)"
```

---

## Task 2: DocGenerator-Abstraktion (Fake + Claude) — TDD für den Fake; claude-api skill für Claude

**Files:** create `src/server/docgen/doc-generator.ts`, `src/server/docgen/doc-generator.test.ts`, `src/server/docgen/claude-doc-generator.ts`. Modify `.env.example`/`.env` (+ ANTHROPIC vars).

> **Beim Implementieren der Claude-Klasse die `claude-api`-Skill aufrufen** (Structured Output via Tool-Use, Prompt Caching des System-Prompts, Modellwahl, Fehler-/Retry-Verhalten).

- [ ] **Step 1: Interface + Fake `doc-generator.ts`**
```ts
import type { ReportContent } from "@/server/reports/report-content";

export type DocGenInput = {
  projectName: string;
  notes: { id: string; transcript: string }[];
};

export interface DocGenerator {
  generate(input: DocGenInput): Promise<ReportContent>;
}

/** Deterministische Test-Implementierung: 1 Finding pro Notiz, kein LLM. */
export class FakeDocGenerator implements DocGenerator {
  async generate(input: DocGenInput): Promise<ReportContent> {
    return {
      intro: `Begehungsdokumentation ${input.projectName}`,
      findings: input.notes.map((n, i) => ({
        noteId: n.id,
        title: `Feststellung ${i + 1}`,
        text: n.transcript,
      })),
    };
  }
}
```

- [ ] **Step 2: Failing/verifying test `doc-generator.test.ts`**
```ts
import { describe, expect, it } from "vitest";
import { FakeDocGenerator } from "./doc-generator";

describe("FakeDocGenerator", () => {
  it("produces one finding per note, preserving noteId and transcript", async () => {
    const gen = new FakeDocGenerator();
    const out = await gen.generate({
      projectName: "Wohnbau",
      notes: [
        { id: "n1", transcript: "Riss in der Wand" },
        { id: "n2", transcript: "Feuchtigkeit im Keller" },
      ],
    });
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({ noteId: "n1", text: "Riss in der Wand" });
    expect(out.findings[1].noteId).toBe("n2");
  });
});
```
Run → PASS (1 test).

- [ ] **Step 3: Env** in `.env.example` und `.env`:
```bash
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-sonnet-4-5"
```
(Leer lassen, falls kein Key — die App nutzt dann nur den Fake in Tests; echte Generierung braucht den Key. Den konkreten aktuellen Modellnamen via claude-api skill verifizieren.)

- [ ] **Step 4: Claude-Implementierung `claude-doc-generator.ts`** — **mit claude-api skill umsetzen.** Anforderungen, die die Implementierung erfüllen MUSS:
  - Nutzt `@anthropic-ai/sdk` (`pnpm add @anthropic-ai/sdk`).
  - **Structured Output via Tool-Use:** ein Tool `emit_report` mit JSON-Schema, das exakt `ReportContent` abbildet (findings[].noteId/title/location?/text, intro?). `tool_choice` erzwingt das Tool. Rückgabe = validiertes `ReportContent`.
  - **Kein Erfinden:** System-Prompt erzwingt, nur zu formulieren, was im jeweiligen Transkript steht; pro Eingabe-Notiz genau EIN Finding mit derselben `noteId`; Sprache Deutsch; bei dürftigem Transkript knappe, sachliche Formulierung statt Halluzination.
  - **Prompt Caching:** System-Prompt/Instruktionsblock mit `cache_control` markieren.
  - Modell aus `process.env.ANTHROPIC_MODEL`, Key aus `process.env.ANTHROPIC_API_KEY` (wirft klar, wenn fehlt).
  - Klasse implementiert `DocGenerator`. Keine Tests gegen die echte API (die laufen via Fake); diese Klasse wird in Task 5 manuell/e2e verifiziert.

- [ ] **Step 5: `pnpm exec tsc --noEmit` (clean). Commit:**
```bash
git add src/server/docgen .env.example package.json pnpm-lock.yaml
git commit -m "feat: doc-generator interface, fake, and claude structured-output impl"
```

---

## Task 3: PDF-Renderer (@react-pdf/renderer)

**Files:** create `src/server/pdf/report-document.tsx`, `src/server/pdf/render-report.ts`, `src/server/pdf/render-report.test.ts`. 

Der Renderer ist **rein**: er bekommt fertige Daten (Findings mit bereits aufgelösten Foto-Daten-URIs + Anhang-Fotos), kein Storage/DB-Zugriff. So ist er deterministisch testbar.

- [ ] **Step 1: Install** `pnpm add @react-pdf/renderer` (use `-w` if needed).

- [ ] **Step 2: Render-Eingabetyp + Dokument `report-document.tsx`**
```tsx
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

export type RenderFinding = {
  index: number;
  title: string;
  location?: string;
  text: string;
  photos: string[]; // data-URIs
};
export type RenderInput = {
  projectName: string;
  address?: string;
  projectNo?: string;
  dateLabel: string;
  author?: string;
  intro?: string;
  findings: RenderFinding[];
  appendixPhotos: string[]; // data-URIs ohne Zuordnung
};

const COBALT = "#1b3bdb";
const ACCENT = "#f4b400";
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#2a2b2d" },
  coverBar: { borderLeftWidth: 6, borderLeftColor: COBALT, paddingLeft: 12, marginBottom: 16 },
  kicker: { fontSize: 10, letterSpacing: 2, color: ACCENT, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 22, marginTop: 6, fontFamily: "Helvetica-Bold" },
  meta: { color: "#555", fontSize: 11, marginTop: 6 },
  hint: { color: "#888", fontSize: 9, marginTop: 12 },
  findingNo: { fontSize: 10, color: COBALT, fontFamily: "Helvetica-Bold", marginTop: 14 },
  findingTitle: { fontFamily: "Helvetica-Bold", marginTop: 2 },
  findingText: { marginTop: 4, lineHeight: 1.4 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  photo: { width: 150, height: 100, objectFit: "cover" },
  sectionTitle: { fontSize: 14, color: COBALT, fontFamily: "Helvetica-Bold", marginTop: 20 },
});

export function ReportDocument(props: RenderInput) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.coverBar}>
          <Text style={styles.kicker}>BAUDOKUMENTATION</Text>
          <Text style={styles.h1}>{props.projectName}</Text>
          <Text style={styles.meta}>
            {props.address ? `${props.address}\n` : ""}
            Begehung: {props.dateLabel}
            {props.author ? `\nErstellt von: ${props.author}` : ""}
            {props.projectNo ? `\nProjekt-Nr.: ${props.projectNo}` : ""}
          </Text>
          <Text style={styles.hint}>Automatisch erzeugt – bitte vor Versand prüfen.</Text>
        </View>
        {props.intro ? <Text style={styles.findingText}>{props.intro}</Text> : null}

        {props.findings.map((f) => (
          <View key={f.index} wrap={false}>
            <Text style={styles.findingNo}>{`FESTSTELLUNG ${String(f.index).padStart(2, "0")}`}</Text>
            <Text style={styles.findingTitle}>{f.location ? `${f.title} · ${f.location}` : f.title}</Text>
            <Text style={styles.findingText}>{f.text}</Text>
            {f.photos.length > 0 && (
              <View style={styles.photoRow}>
                {f.photos.map((src, i) => (
                  <Image key={i} src={src} style={styles.photo} />
                ))}
              </View>
            )}
          </View>
        ))}

        {props.appendixPhotos.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Anhang: weitere Fotos</Text>
            <View style={styles.photoRow}>
              {props.appendixPhotos.map((src, i) => (
                <Image key={i} src={src} style={styles.photo} />
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: `render-report.tsx`** (JSX → Endung `.tsx`)
```tsx
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument, type RenderInput } from "./report-document";

/** Rendert das Report-PDF deterministisch zu einem Buffer. */
export function renderReportPdf(input: RenderInput): Promise<Buffer> {
  return renderToBuffer(<ReportDocument {...input} />);
}
```
Importe (`./render-report`) bleiben ohne Endung und lösen auf `.tsx` auf.

- [ ] **Step 4: Test `render-report.test.ts`** (PDF-Buffer entsteht und beginnt mit `%PDF`)
```ts
import { describe, expect, it } from "vitest";
import { renderReportPdf } from "./render-report";

describe("renderReportPdf", () => {
  it("produces a non-empty PDF buffer", async () => {
    const buf = await renderReportPdf({
      projectName: "Wohnbau Lindengasse",
      dateLabel: "01.06.2026",
      findings: [
        { index: 1, title: "Riss in Trockenbauwand", location: "EG", text: "Vertikaler Riss …", photos: [] },
      ],
      appendixPhotos: [],
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```
Run → PASS (1 test). (Falls Vitest JSX in `.tsx`-Tests-/Quellen Konfiguration braucht: `esbuild`/vite verarbeitet `.tsx` standardmäßig; bei Bedarf `jsx: "automatic"` in tsconfig prüfen — sollte aus Plan 1 bereits gesetzt sein.)

- [ ] **Step 5: Commit**
```bash
git add src/server/pdf package.json pnpm-lock.yaml
git commit -m "feat: react-pdf report document and deterministic renderer (TDD)"
```

---

## Task 4: Generate-Report-Job-Logik — TDD (mit Fakes)

**Files:** create `src/server/reports/generate-report.ts`, `src/server/reports/generate-report.test.ts`.

Verknüpft alles: lädt Inputs → DocGenerator → Foto-Matching → Foto-Bytes aus Storage als Data-URIs → Renderer → PDF in Storage → Report done. Bei Fehler: failed + rethrow.

- [ ] **Step 1: Failing test `generate-report.test.ts`**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/server/db";
import { LocalStorage } from "@/server/storage/local-storage";
import { FakeDocGenerator } from "@/server/docgen/doc-generator";
import { runGenerateReport } from "./generate-report";

let dir: string;
let storage: LocalStorage;

async function seed() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "Wohnbau", projectNo: "2026-014" } });
  const note = await prisma.note.create({
    data: { projectId: project.id, audioUrl: "k", transcript: "Riss in der Wand", transcriptStatus: "done", recordedAt: new Date("2026-06-01T09:00:00Z") },
  });
  const photoKey = `projects/${project.id}/photos/p1.jpg`;
  await storage.put(photoKey, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), "image/jpeg"); // jpeg-ish
  await prisma.photo.create({
    data: { projectId: project.id, fileUrl: photoKey, clientCapturedAt: new Date("2026-06-01T09:01:00Z") },
  });
  const report = await prisma.report.create({ data: { projectId: project.id, label: "Export 1", status: "pending" } });
  return { project, note, report };
}

beforeEach(async () => {
  await prisma.report.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.note.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();
  dir = mkdtempSync(join(tmpdir(), "baudoku-report-"));
  storage = new LocalStorage(dir);
});

describe("runGenerateReport", () => {
  it("generates a PDF, stores it, and marks the report done", async () => {
    const { report } = await seed();
    const result = await runGenerateReport(report.id, {
      storage,
      docGenerator: new FakeDocGenerator(),
      now: new Date("2026-06-02T00:00:00Z"),
    });
    expect(result.status).toBe("done");
    expect(result.pdfUrl).toMatch(/reports\/.*\.pdf$/);
    expect(await storage.exists(result.pdfUrl!)).toBe(true);
    const pdf = await storage.read(result.pdfUrl!);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("marks the report failed and rethrows when generation throws", async () => {
    const { report } = await seed();
    const boom = { generate: async () => { throw new Error("llm down"); } };
    await expect(
      runGenerateReport(report.id, { storage, docGenerator: boom, now: new Date() }),
    ).rejects.toThrow("llm down");
    const reloaded = await prisma.report.findUnique({ where: { id: report.id } });
    expect(reloaded?.status).toBe("failed");
  });

  it("throws (and marks failed) for an empty project (no notes)", async () => {
    const org = await prisma.organization.create({ data: { name: "B" } });
    const project = await prisma.project.create({ data: { orgId: org.id, name: "Leer" } });
    const report = await prisma.report.create({ data: { projectId: project.id, label: "E", status: "pending" } });
    await expect(
      runGenerateReport(report.id, { storage, docGenerator: new FakeDocGenerator(), now: new Date() }),
    ).rejects.toThrow();
    const reloaded = await prisma.report.findUnique({ where: { id: report.id } });
    expect(reloaded?.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `generate-report.ts`**
```ts
import { extname } from "node:path";
import { getReportById, loadReportInputs, setReportResult, setReportStatus } from "./reports.internal";
import { matchPhotosToNotes } from "./photo-matching";
import { renderReportPdf } from "@/server/pdf/render-report";
import type { RenderFinding } from "@/server/pdf/report-document";
import type { DocGenerator } from "@/server/docgen/doc-generator";
import type { ObjectStorage } from "@/server/storage/object-storage";

export type GenerateDeps = { storage: ObjectStorage; docGenerator: DocGenerator; now: Date };

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

function dataUri(buf: Buffer, key: string): string {
  const mime = MIME_BY_EXT[extname(key).toLowerCase()] ?? "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function runGenerateReport(reportId: string, deps: GenerateDeps) {
  const report = await getReportById(reportId);
  if (!report) throw new Error(`Report ${reportId} not found`);

  try {
    const inputs = await loadReportInputs(report.projectId);
    if (!inputs) throw new Error(`Project ${report.projectId} not found`);
    const { project, notes, photos } = inputs;
    if (notes.length === 0) throw new Error("Leeres Projekt: keine Notizen zum Exportieren.");

    // 1) LLM: strukturierte Findings (1 pro Notiz)
    const content = await deps.docGenerator.generate({
      projectName: project.name,
      notes: notes.map((n) => ({ id: n.id, transcript: n.transcript ?? "" })),
    });

    // 2) Foto-Zuordnung (deterministisch, ±2 Min)
    const match = matchPhotosToNotes(
      notes.map((n) => ({ id: n.id, recordedAt: n.recordedAt })),
      photos.map((p) => ({ id: p.id, effectiveTime: p.exifTakenAt ?? p.clientCapturedAt })),
    );
    const photoByKey = new Map(photos.map((p) => [p.id, p.fileUrl] as const));

    // 3) Foto-Bytes als Data-URIs auflösen
    const toDataUris = async (photoIds: string[]) =>
      Promise.all(
        photoIds.map(async (id) => {
          const key = photoByKey.get(id)!;
          return dataUri(await deps.storage.read(key), key);
        }),
      );

    const findings: RenderFinding[] = [];
    let i = 1;
    for (const f of content.findings) {
      findings.push({
        index: i++,
        title: f.title,
        location: f.location,
        text: f.text,
        photos: await toDataUris(match.byNote.get(f.noteId) ?? []),
      });
    }
    const appendixPhotos = await toDataUris(match.unmatched);

    // 4) PDF rendern + speichern
    const pdf = await renderReportPdf({
      projectName: project.name,
      address: project.address ?? undefined,
      projectNo: project.projectNo ?? undefined,
      dateLabel: deps.now.toLocaleDateString("de-AT"),
      intro: content.intro,
      findings,
      appendixPhotos,
    });
    const pdfKey = `projects/${project.id}/reports/${reportId}.pdf`;
    await deps.storage.put(pdfKey, pdf, "application/pdf");

    return await setReportResult(reportId, { pdfUrl: pdfKey, reportJson: content });
  } catch (err) {
    await setReportStatus(reportId, "failed");
    throw err;
  }
}
```

- [ ] **Step 4: Run → PASS (3 tests). Commit:**
```bash
git add src/server/reports/generate-report.ts src/server/reports/generate-report.test.ts
git commit -m "feat: generate-report job logic (docgen + matching + pdf) with failure handling (TDD)"
```

---

## Task 5: Inngest-Function + Export-Trigger-Route

**Files:** modify `src/inngest/client.ts`, `src/inngest/functions.ts`; create `src/app/api/projects/[id]/reports/route.ts`.

- [ ] **Step 1: Event-Typ** in `src/inngest/client.ts` ergänzen:
```ts
export type ReportRequestedEvent = { name: "report/requested"; data: { reportId: string } };
```

- [ ] **Step 2: Function** in `src/inngest/functions.ts` ergänzen (Claude als echter Generator):
```ts
import { runGenerateReport } from "@/server/reports/generate-report";
import { ClaudeDocGenerator } from "@/server/docgen/claude-doc-generator";

export const generateReport = inngest.createFunction(
  { id: "generate-report", retries: 1, triggers: [{ event: "report/requested" }] },
  async ({ event }: { event: { data: { reportId: string } } }) => {
    await runGenerateReport(event.data.reportId, {
      storage,
      docGenerator: new ClaudeDocGenerator(),
      now: new Date(),
    });
    return { reportId: event.data.reportId };
  },
);
```
und `generateReport` in das exportierte `functions`-Array aufnehmen (neben `transcribeNote`).

- [ ] **Step 3: Export-Trigger-Route** `src/app/api/projects/[id]/reports/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { listNotes } from "@/server/notes/notes.service";
import { createReport, setReportStatus } from "@/server/reports/reports.service";
import { inngest } from "@/inngest/client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id: projectId } = await params;
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  // Leeres Projekt blocken (Spec §8) statt leeres PDF zu erzeugen.
  const notes = await listNotes(session.orgId, projectId);
  if (notes.length === 0) {
    return NextResponse.json({ error: "Keine Sprachnotizen vorhanden – nichts zu exportieren." }, { status: 400 });
  }

  const label = `Export ${new Date().toLocaleDateString("de-AT")}`;
  const report = await createReport(projectId, { label, createdById: session.userId });

  try {
    await inngest.send({ name: "report/requested", data: { reportId: report.id } });
  } catch {
    const failed = await setReportStatus(report.id, "failed");
    return NextResponse.json(
      { id: failed.id, status: failed.status, error: "Export konnte nicht gestartet werden" },
      { status: 502 },
    );
  }
  return NextResponse.json({ id: report.id, status: report.status });
}
```

- [ ] **Step 4: `pnpm exec tsc --noEmit` (clean), `pnpm test` (alle grün). Commit:**
```bash
git add src/inngest "src/app/api/projects"
git commit -m "feat: generateReport inngest function and export trigger route (empty-project guard + enqueue recovery)"
```

---

## Task 6: UI — Export-Button + Report-Liste (Download)

**Files:** create `src/app/(app)/projects/[id]/export-button.tsx`, `src/app/(app)/projects/[id]/reports-list.tsx`; modify `data.ts` und `page.tsx`.

- [ ] **Step 1: `export-button.tsx`**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExportButton({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function exportNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reports`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export fehlgeschlagen");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={exportNow} disabled={busy} className="self-start bg-cobalt text-white rounded p-2 disabled:opacity-50">
        {busy ? "Wird erstellt…" : "📄 Dokumentation exportieren"}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: `reports-list.tsx`**
```tsx
export type ReportView = {
  id: string;
  label: string;
  status: "pending" | "done" | "failed";
  pdfKey: string | null;
  generatedAt: string;
};

export function ReportsList({ reports }: { reports: ReportView[] }) {
  if (reports.length === 0) return <p className="text-gray-500">Noch keine Exporte.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {reports.map((r) => (
        <li key={r.id} className="flex items-center gap-3 text-sm border rounded p-2">
          <span className="text-gray-500">{new Date(r.generatedAt).toLocaleString("de-AT")}</span>
          <span className="font-medium">{r.label}</span>
          <StatusBadge status={r.status} />
          {r.status === "done" && r.pdfKey && (
            <a href={`/api/files/${r.pdfKey}`} className="text-cobalt underline ml-auto" target="_blank" rel="noreferrer">
              PDF herunterladen
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: ReportView["status"] }) {
  const map = {
    pending: ["bg-yellow-100 text-yellow-800", "wird erstellt"],
    done: ["bg-green-100 text-green-800", "fertig"],
    failed: ["bg-red-100 text-red-800", "fehlgeschlagen"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
```

- [ ] **Step 3: `data.ts`** um Reports erweitern:
```ts
import { listReports } from "@/server/reports/reports.service";
// … in loadProjectDetail, neben notes/photos:
const [notes, photos, reports] = await Promise.all([
  listNotes(session.orgId, projectId),
  listPhotos(session.orgId, projectId),
  listReports(session.orgId, projectId),
]);
return { project, notes, photos, reports };
```

- [ ] **Step 4: `page.tsx`** Export-Sektion einbinden (nach den Fotos):
```tsx
import { ExportButton } from "./export-button";
import { ReportsList } from "./reports-list";
// …
<section className="flex flex-col gap-3">
  <h2 className="text-lg font-medium">Dokumentation</h2>
  <ExportButton projectId={project.id} />
  <ReportsList
    reports={reports.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      pdfKey: r.pdfUrl,
      generatedAt: r.generatedAt.toISOString(),
    }))}
  />
</section>
```

- [ ] **Step 5: `pnpm exec tsc --noEmit` + `pnpm build` (clean). Commit:**
```bash
git add "src/app/(app)/projects/[id]"
git commit -m "feat: export button and reports list (download) on project detail"
```

---

## Task 7: Echte Claude-Generierung E2E + Volltest + finaler Review

- [ ] **Step 1: Key prüfen.** Ist `ANTHROPIC_API_KEY` gesetzt? Wenn nein: melden, dass die echte Generierung einen Key von Nikolaus braucht; die Fake-basierten Tests + Build sind davon unabhängig. Wenn ja: weiter.
- [ ] **Step 2: Echter Pipeline-Test (nur mit Key).** Throwaway-Test/Skript: Projekt mit 1–2 echten Transkripten + 1 Foto anlegen, `runGenerateReport` mit `ClaudeDocGenerator` ausführen, prüfen: Findings 1:1 zu Notizen, `noteId`s korrekt, kein erfundener Inhalt, PDF beginnt mit `%PDF`. Danach Throwaway löschen (`/bin/rm`).
- [ ] **Step 3: Foto-Zuordnung stichprobenartig** im PDF/`reportJson` plausibilisieren (Foto im ±2-Min-Fenster landet bei der richtigen Feststellung, sonst Anhang).
- [ ] **Step 4: Volltest** `pnpm db:test:migrate && pnpm test` (alle Suites grün: photo-matching, reports.service, doc-generator, render-report, generate-report + bestehende). `pnpm exec tsc --noEmit && pnpm lint && pnpm build` sauber.
- [ ] **Step 5: Finaler Subagent-Review** über die gesamte Plan-3-Implementierung: Org-Scoping (reports), Fehlerpfade (failed + rethrow bei Job; 502 + failed bei Enqueue; Leer-Guard), keine stillen Fehler, „kein Erfinden" im Claude-Prompt, Renderer rein/deterministisch, keine Secrets.
- [ ] **Step 6:** `superpowers:finishing-a-development-branch` → PR.

---

## Self-Review-Notiz (für Reviewer dieses Plans)

- **Spec-Abdeckung:** §6b Doku-Generierung (Claude, Structured Output, kein Erfinden, Prompt Caching); §7 PDF (Deckblatt mit Markenfarben, durchnummerierte Feststellungen mit zugeordneten Fotos, Anhang-Galerie, Hinweis „vor Versand prüfen"); Foto-Zuordnung deterministisch ±2 Min im Code; §8 Fehlerbehandlung (Job failed+rethrow→Inngest-Retry; Enqueue-Fehler→failed+502; leeres Projekt geblockt). Mehrere Exporte pro Projekt (Report-Liste, versioniert via generatedAt + reportJson für Audit).
- **Bewusst NICHT in Plan 3:** PWA/Service-Worker + E2E-Playwright (Plan 4); Status-Lebenszyklus/Freigabe (Spec: deferred).
- **Testbarkeit:** LLM hinter `DocGenerator` (Fake), Renderer rein, Job mit DI (storage/docgen/now) → alle Kernpfade ohne Key/Netz/Browser testbar. Echte Claude-Generierung nur in Task 7 (Key nötig).
- **Typkonsistenz:** `ReportContent`/`Finding` (docgen-Ausgabe = `Report.reportJson`), `matchPhotosToNotes(notes, photos) → {byNote, unmatched}`, `RenderInput`/`RenderFinding` (Renderer-Eingabe), `runGenerateReport(reportId, {storage, docGenerator, now})`, Report-Service-Signaturen. Storage-Key `projects/<projectId>/reports/<reportId>.pdf` (von der bestehenden `/api/files`-Route org-geprüft ausgeliefert).
- **claude-api skill:** Für `ClaudeDocGenerator` (Task 2) zwingend nutzen (Tool-Use-Schema = ReportContent, tool_choice erzwungen, Prompt Caching, Modell aus Env).
