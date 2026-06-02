# Baudoku MVP – Plan 2: Erfassung (Sprachnotizen + STT, Fotos)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf einer Projekt-Detailseite kann man Sprachnotizen (Audio) und Fotos sammeln. Audio wird gespeichert und per **lokalem faster-whisper** (Hintergrund-Job) transkribiert; der Text ist vor dem Export korrigierbar. Fotos werden mit Zeitstempel gespeichert. Alles org-scoped.

**Architecture:** Aufbauend auf Plan 1 (Next.js 16, Prisma 6, Auth.js, `requireSession`). Neue Module unter `src/server/storage`, `src/server/notes`, `src/server/photos`, `src/server/transcription`, `src/inngest`. **Storage = lokales Dateisystem** hinter einer `ObjectStorage`-Abstraktion (Prod-Swap auf S3 später möglich). **STT = faster-whisper** hinter einer `Transcriber`-Abstraktion (Tests nutzen einen Fake → Milestones bauen/testen ohne laufendes whisper). **Background-Jobs = Inngest** (in Plan 1 entschieden). Datei-Auslieferung über eine **authentifizierte, org-geprüfte** Route.

**Tech Stack:** Next.js 16, TypeScript, Prisma 6, Inngest, faster-whisper (Python-CLI via child_process), `exifr` (EXIF), Vitest. Audio im Browser via `MediaRecorder`.

**Externe Voraussetzung (nur für ECHTES STT, nicht für Tests):** `python3` + `ffmpeg` lokal (vorhanden: 3.14 / 8.0). Ein Python-venv mit `faster-whisper`. `OPENAI_API_KEY` wird NICHT benötigt (lokales Modell).

**Referenz-Spec:** `docs/superpowers/specs/2026-06-01-baudoku-mvp-design.md`

---

## Dateistruktur (in diesem Plan angelegt/berührt)

- `src/server/storage/object-storage.ts` — `ObjectStorage`-Interface
- `src/server/storage/local-storage.ts` (+ `.test.ts`) — lokale FS-Implementierung
- `src/server/storage/index.ts` — Singleton (wählt Implementierung)
- `src/app/api/files/[...key]/route.ts` — authentifizierte, org-geprüfte Datei-Auslieferung
- `src/inngest/client.ts` — Inngest-Client
- `src/inngest/functions.ts` — registrierte Functions (inkl. `transcribeNote`)
- `src/app/api/inngest/route.ts` — Inngest-Serve-Endpoint
- `src/server/transcription/transcriber.ts` — `Transcriber`-Interface + `FakeTranscriber`
- `src/server/transcription/local-whisper.ts` — faster-whisper-Implementierung (child_process)
- `scripts/transcribe.py` — Python-CLI (faster-whisper) + `scripts/whisper-setup.sh`
- `src/server/notes/notes.service.ts` (+ `.test.ts`) — Notiz-Domänenlogik
- `src/server/notes/transcribe-note.ts` (+ `.test.ts`) — Job-Logik (Transcriber-agnostisch)
- `src/app/api/projects/[id]/notes/route.ts` — Audio-Upload (multipart)
- `src/server/photos/photos.service.ts` (+ `.test.ts`) — Foto-Domänenlogik
- `src/server/photos/exif.ts` (+ `.test.ts`) — EXIF-Zeitstempel-Extraktion
- `src/app/api/projects/[id]/photos/route.ts` — Foto-Upload (multipart)
- `src/app/(app)/projects/[id]/` — Detailseite erweitert: Recorder, Notizenliste, Foto-Galerie (mehrere Client-Komponenten)
- `.env.example` / `.env` / `.env.test` — neue Vars (`STORAGE_DIR`, `WHISPER_*`)
- `.gitignore` — `storage/` ignorieren

---

## Task 0: Storage-Abstraktion + lokale FS-Implementierung — TDD

**Files:** create `src/server/storage/object-storage.ts`, `src/server/storage/local-storage.ts`, `src/server/storage/local-storage.test.ts`, `src/server/storage/index.ts`. Modify `.env.example`/`.env`/`.env.test` (+ `STORAGE_DIR`), `.gitignore` (+ `storage/`).

- [ ] **Step 1: Env + gitignore**

In `.env.example`, `.env`, `.env.test` ergänzen (Tests nutzen ein eigenes Verzeichnis):
```bash
# .env / .env.example
STORAGE_DIR="./storage"
```
```bash
# .env.test
STORAGE_DIR="./storage-test"
```
In `.gitignore` ergänzen:
```
/storage
/storage-test
```

- [ ] **Step 2: Interface `object-storage.ts`**

```ts
export interface ObjectStorage {
  /** Speichert ein Objekt unter `key` (relativer, slash-separierter Pfad ohne führenden Slash). */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Liest ein Objekt als Buffer. Wirft, wenn nicht vorhanden. */
  read(key: string): Promise<Buffer>;
  /** Existiert das Objekt? */
  exists(key: string): Promise<boolean>;
  /** Content-Type, der bei put hinterlegt wurde (oder application/octet-stream). */
  contentType(key: string): Promise<string>;
}

/** Wirft bei unsicheren Keys (Path-Traversal, absolute Pfade). */
export function assertSafeKey(key: string): void {
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    key.includes("..") ||
    key.includes("\\") ||
    key.includes("\0")
  ) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}
```

- [ ] **Step 3: Failing test `local-storage.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorage } from "./local-storage";

let dir: string;
let storage: LocalStorage;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "baudoku-store-"));
  storage = new LocalStorage(dir);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("puts and reads back an object with content type", async () => {
    await storage.put("projects/p1/notes/n1.webm", Buffer.from("audio-bytes"), "audio/webm");
    expect(await storage.exists("projects/p1/notes/n1.webm")).toBe(true);
    expect((await storage.read("projects/p1/notes/n1.webm")).toString()).toBe("audio-bytes");
    expect(await storage.contentType("projects/p1/notes/n1.webm")).toBe("audio/webm");
  });

  it("returns false for a missing object", async () => {
    expect(await storage.exists("projects/p1/photos/missing.jpg")).toBe(false);
  });

  it("rejects path-traversal keys", async () => {
    await expect(storage.put("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow();
    await expect(storage.read("/etc/passwd")).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run → FAIL** `pnpm test src/server/storage/local-storage.test.ts` (import not resolvable).

- [ ] **Step 5: Implement `local-storage.ts`**

```ts
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertSafeKey, type ObjectStorage } from "./object-storage";

/** Lokale Dateisystem-Implementierung. Content-Type wird in einer .meta-Datei abgelegt. */
export class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private abs(key: string): string {
    assertSafeKey(key);
    return join(this.root, key);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const p = this.abs(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    await writeFile(`${p}.meta`, contentType, "utf8");
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.abs(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }

  async contentType(key: string): Promise<string> {
    try {
      return (await readFile(`${this.abs(key)}.meta`, "utf8")).trim() || "application/octet-stream";
    } catch {
      return "application/octet-stream";
    }
  }
}
```

- [ ] **Step 6: Run → PASS** (3 tests).

- [ ] **Step 7: Singleton `index.ts`**

```ts
import { LocalStorage } from "./local-storage";
import type { ObjectStorage } from "./object-storage";

const root = process.env.STORAGE_DIR ?? "./storage";

export const storage: ObjectStorage = new LocalStorage(root);
export type { ObjectStorage } from "./object-storage";
```

- [ ] **Step 8: Commit**
```bash
git add src/server/storage .env.example .gitignore
git commit -m "feat: local filesystem object-storage abstraction (TDD)"
```

---

## Task 1: Authentifizierte, org-geprüfte Datei-Auslieferung

**Files:** create `src/app/api/files/[...key]/route.ts`. (Org-Check nutzt `getProject`.)

Keys folgen dem Schema `projects/<projectId>/...`. Die Route extrahiert `projectId`, prüft via `getProject(orgId, projectId)` die Org-Zugehörigkeit und streamt nur dann.

- [ ] **Step 1: Route implementieren**

`src/app/api/files/[...key]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { storage } from "@/server/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await requireSession();
  const { key: segments } = await params;
  const key = segments.join("/");

  // Erwartetes Schema: projects/<projectId>/...
  if (segments[0] !== "projects" || segments.length < 3) {
    return new NextResponse("Not found", { status: 404 });
  }
  const projectId = segments[1];
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  if (!(await storage.exists(key))) return new NextResponse("Not found", { status: 404 });

  const data = await storage.read(key);
  const contentType = await storage.contentType(key);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
```

- [ ] **Step 2: Build-Check** `pnpm exec tsc --noEmit` (clean).

- [ ] **Step 3: Commit**
```bash
git add "src/app/api/files"
git commit -m "feat: authenticated org-scoped file serving route"
```

---

## Task 2: Inngest-Client + Serve-Route + Dev-Wiring

**Files:** create `src/inngest/client.ts`, `src/inngest/functions.ts`, `src/app/api/inngest/route.ts`. Modify `package.json` (dev:inngest script).

- [ ] **Step 1: Install** `pnpm add inngest`

- [ ] **Step 2: Client `src/inngest/client.ts`**
```ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "baudoku" });

// Event-Typen (zentrale Definition)
export type NoteCreatedEvent = { name: "note/created"; data: { noteId: string } };
```

- [ ] **Step 3: Functions-Registry `src/inngest/functions.ts`** (zunächst leer, wird in Task 6 gefüllt)
```ts
import type { InngestFunction } from "inngest";

export const functions: InngestFunction.Any[] = [];
```

- [ ] **Step 4: Serve-Route `src/app/api/inngest/route.ts`**
```ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
```

- [ ] **Step 5: Dev-Script** in `package.json` "scripts":
```json
"dev:inngest": "inngest-cli dev -u http://localhost:3000/api/inngest"
```
(Inngest Dev-Server wird bei Bedarf separat gestartet: `pnpm dev:inngest`.)

- [ ] **Step 6: Build-Check** `pnpm exec tsc --noEmit` (clean). Commit:
```bash
git add src/inngest "src/app/api/inngest" package.json
git commit -m "feat: inngest client, serve route, dev wiring"
```

---

## Task 3: Transcriber-Interface + Fake + lokale faster-whisper-Implementierung

**Files:** create `src/server/transcription/transcriber.ts`, `src/server/transcription/transcriber.test.ts`, `src/server/transcription/local-whisper.ts`, `scripts/transcribe.py`, `scripts/whisper-setup.sh`. Modify `.env.example`/`.env` (+ `WHISPER_*`).

- [ ] **Step 1: Interface + Fake `transcriber.ts`**
```ts
export interface Transcriber {
  /** Transkribiert die Audiodatei am absoluten Pfad und liefert den Text. */
  transcribe(audioAbsPath: string): Promise<string>;
}

/** Test-Implementierung: deterministisch, ohne externe Abhängigkeiten. */
export class FakeTranscriber implements Transcriber {
  constructor(private readonly result: string = "Transkript (Fake)") {}
  async transcribe(_audioAbsPath: string): Promise<string> {
    return this.result;
  }
}
```

- [ ] **Step 2: Failing test `transcriber.test.ts`**
```ts
import { describe, expect, it } from "vitest";
import { FakeTranscriber } from "./transcriber";

describe("FakeTranscriber", () => {
  it("returns the configured transcript", async () => {
    const t = new FakeTranscriber("Riss in der Wand");
    expect(await t.transcribe("/tmp/whatever.webm")).toBe("Riss in der Wand");
  });
});
```

- [ ] **Step 3: Run → PASS.** Da `transcriber.ts` (inkl. `FakeTranscriber`) in Step 1 angelegt wurde, verifiziert dieser Lauf, dass Interface + Fake korrekt kompilieren und das deterministische Ergebnis liefern. Run `pnpm test src/server/transcription/transcriber.test.ts` → PASS (1 test).

- [ ] **Step 4: Python-CLI `scripts/transcribe.py`** (liest Audiopfad als arg, gibt reinen Text auf stdout aus)
```python
import sys
from faster_whisper import WhisperModel

def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audo_path>", file=sys.stderr)
        return 2
    audio_path = sys.argv[1]
    model_size = __import__("os").environ.get("WHISPER_MODEL", "small")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(audio_path, language="de")
    text = " ".join(seg.text.strip() for seg in segments).strip()
    print(text)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Setup-Script `scripts/whisper-setup.sh`** (idempotenter venv-Aufbau)
```bash
#!/usr/bin/env bash
set -euo pipefail
VENV_DIR="${WHISPER_VENV:-.venv-whisper}"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
"$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
"$VENV_DIR/bin/pip" install "faster-whisper>=1.0,<2"
echo "whisper venv ready at $VENV_DIR"
```
`chmod +x scripts/whisper-setup.sh`. Env in `.env`/`.env.example`:
```bash
WHISPER_VENV=".venv-whisper"
WHISPER_MODEL="small"
```
In `.gitignore`: `/.venv-whisper`.

- [ ] **Step 6: Lokale Implementierung `local-whisper.ts`**
```ts
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Transcriber } from "./transcriber";

/** Ruft scripts/transcribe.py im whisper-venv auf und liefert stdout als Transkript. */
export class LocalWhisperTranscriber implements Transcriber {
  constructor(
    private readonly venvDir: string = process.env.WHISPER_VENV ?? ".venv-whisper",
    private readonly scriptPath: string = join(process.cwd(), "scripts", "transcribe.py"),
  ) {}

  transcribe(audioAbsPath: string): Promise<string> {
    const python = join(this.venvDir, "bin", "python");
    return new Promise((resolve, reject) => {
      const proc = spawn(python, [this.scriptPath, audioAbsPath], {
        env: process.env,
      });
      let out = "";
      let err = "";
      proc.stdout.on("data", (d) => (out += d.toString()));
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve(out.trim());
        else reject(new Error(`whisper exited ${code}: ${err.trim()}`));
      });
    });
  }
}
```

- [ ] **Step 7: Build-Check** `pnpm exec tsc --noEmit` (clean). Commit:
```bash
chmod +x scripts/whisper-setup.sh
git add src/server/transcription scripts/transcribe.py scripts/whisper-setup.sh .env.example .gitignore
git commit -m "feat: transcriber interface, fake, and local faster-whisper impl"
```

> Hinweis: Die echte whisper-Verdrahtung + manuelle Verifikation erfolgt in Task 10. Bis dahin laufen alle Tests gegen `FakeTranscriber`.

---

## Task 4: Notiz-Domänenlogik — TDD

**Files:** create `src/server/notes/notes.service.ts`, `src/server/notes/notes.service.test.ts`.

Funktionen: `createNote` (Notiz mit `transcriptStatus=pending`), `listNotes` (org-scoped via Projekt), `getNoteForOrg`, `setTranscript` (Text + Status `done`), `setTranscriptStatus`.

- [ ] **Step 1: Failing test `notes.service.test.ts`**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createNote, listNotes, getNoteForOrg, setTranscript, setTranscriptStatus } from "./notes.service";

async function makeProject() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return { org, project };
}

describe("notes.service", () => {
  beforeEach(async () => {
    await prisma.note.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a pending note and lists it for the org", async () => {
    const { org, project } = await makeProject();
    const note = await createNote(project.id, { audioKey: "projects/x/notes/n.webm", recordedAt: new Date("2026-06-01T09:42:00Z") });
    expect(note.transcriptStatus).toBe("pending");
    const list = await listNotes(org.id, project.id);
    expect(list.map((n) => n.id)).toContain(note.id);
  });

  it("does not list notes of a project in another org", async () => {
    const a = await makeProject();
    const b = await makeProject();
    await createNote(a.project.id, { audioKey: "k", recordedAt: new Date() });
    expect(await listNotes(b.org.id, a.project.id)).toHaveLength(0);
  });

  it("getNoteForOrg enforces org scoping", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const note = await createNote(a.project.id, { audioKey: "k", recordedAt: new Date() });
    expect(await getNoteForOrg(b.org.id, note.id)).toBeNull();
    expect((await getNoteForOrg(a.org.id, note.id))?.id).toBe(note.id);
  });

  it("setTranscript stores text and marks done; setTranscriptStatus sets failed", async () => {
    const { project } = await makeProject();
    const note = await createNote(project.id, { audioKey: "k", recordedAt: new Date() });
    const done = await setTranscript(note.id, "Riss in der Wand");
    expect(done.transcript).toBe("Riss in der Wand");
    expect(done.transcriptStatus).toBe("done");
    const failed = await setTranscriptStatus(note.id, "failed");
    expect(failed.transcriptStatus).toBe("failed");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `notes.service.ts`**
```ts
import { prisma } from "@/server/db";
import type { TranscriptStatus } from "@prisma/client";

export type CreateNoteInput = { audioKey: string; recordedAt: Date };

export function createNote(projectId: string, input: CreateNoteInput) {
  return prisma.note.create({
    data: {
      projectId,
      audioUrl: input.audioKey,
      recordedAt: input.recordedAt,
      transcriptStatus: "pending",
    },
  });
}

export function listNotes(orgId: string, projectId: string) {
  return prisma.note.findMany({
    where: { projectId, project: { orgId } },
    orderBy: { recordedAt: "asc" },
  });
}

export function getNoteForOrg(orgId: string, noteId: string) {
  return prisma.note.findFirst({ where: { id: noteId, project: { orgId } } });
}

export function setTranscript(noteId: string, transcript: string) {
  return prisma.note.update({
    where: { id: noteId },
    data: { transcript, transcriptStatus: "done" },
  });
}

export function setTranscriptStatus(noteId: string, status: TranscriptStatus) {
  return prisma.note.update({ where: { id: noteId }, data: { transcriptStatus: status } });
}
```
> Hinweis: `Note.audioUrl` speichert den Storage-**Key** (z. B. `projects/<id>/notes/<noteId>.webm`), nicht eine externe URL. Die Auslieferung erfolgt über `/api/files/<key>`.

- [ ] **Step 4: Run → PASS (4 tests). Commit:**
```bash
git add src/server/notes
git commit -m "feat: notes service (create/list/get/transcript) org-scoped (TDD)"
```

---

## Task 5: Job-Logik `transcribeNote` (Transcriber-agnostisch) — TDD

**Files:** create `src/server/notes/transcribe-note.ts`, `src/server/notes/transcribe-note.test.ts`.

Die reine Job-Logik wird vom Inngest-Wrapper getrennt, damit sie mit einem `FakeTranscriber` und temporären Dateien getestet werden kann.

- [ ] **Step 1: Failing test `transcribe-note.test.ts`**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/server/db";
import { LocalStorage } from "@/server/storage/local-storage";
import { FakeTranscriber } from "@/server/transcription/transcriber";
import { runTranscribeNote } from "./transcribe-note";

let dir: string;

async function makeNote(audioKey: string) {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return prisma.note.create({
    data: { projectId: project.id, audioUrl: audioKey, recordedAt: new Date(), transcriptStatus: "pending" },
  });
}

beforeEach(async () => {
  await prisma.note.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();
  dir = mkdtempSync(join(tmpdir(), "baudoku-job-"));
});

describe("runTranscribeNote", () => {
  it("transcribes a note and marks it done", async () => {
    const key = "projects/p/notes/n.webm";
    const storage = new LocalStorage(dir);
    await storage.put(key, Buffer.from("audio"), "audio/webm");
    const note = await makeNote(key);

    const result = await runTranscribeNote(note.id, {
      storage,
      transcriber: new FakeTranscriber("Riss in der Wand"),
    });

    expect(result.transcriptStatus).toBe("done");
    expect(result.transcript).toBe("Riss in der Wand");
  });

  it("marks the note failed if transcription throws", async () => {
    const key = "projects/p/notes/n2.webm";
    const storage = new LocalStorage(dir);
    await storage.put(key, Buffer.from("audio"), "audio/webm");
    const note = await makeNote(key);

    const throwing = { transcribe: async () => { throw new Error("whisper down"); } };
    await expect(
      runTranscribeNote(note.id, { storage, transcriber: throwing }),
    ).rejects.toThrow("whisper down");

    const reloaded = await prisma.note.findUnique({ where: { id: note.id } });
    expect(reloaded?.transcriptStatus).toBe("failed");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `transcribe-note.ts`**
```ts
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { getNoteForOrgless, setTranscript, setTranscriptStatus } from "./notes.internal";
import type { ObjectStorage } from "@/server/storage/object-storage";
import type { Transcriber } from "@/server/transcription/transcriber";

export type TranscribeDeps = { storage: ObjectStorage; transcriber: Transcriber };

/**
 * Lädt das Audio des Notes aus dem Storage in eine temporäre Datei, transkribiert
 * es und speichert das Ergebnis. Bei Fehler wird der Status auf `failed` gesetzt
 * und der Fehler weitergeworfen (Inngest retryt dann).
 */
export async function runTranscribeNote(noteId: string, deps: TranscribeDeps) {
  const note = await getNoteForOrgless(noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);

  const ext = extname(note.audioUrl) || ".webm";
  const tmp = await mkdtemp(join(tmpdir(), "whisper-"));
  const audioPath = join(tmp, `audio${ext}`);
  try {
    const buf = await deps.storage.read(note.audioUrl);
    await writeFile(audioPath, buf);
    const text = await deps.transcriber.transcribe(audioPath);
    return await setTranscript(noteId, text);
  } catch (err) {
    await setTranscriptStatus(noteId, "failed");
    throw err;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
```
Dazu ein internes Helferchen `src/server/notes/notes.internal.ts` (damit der Job ohne org-Kontext laden kann):
```ts
import { prisma } from "@/server/db";
export { setTranscript, setTranscriptStatus } from "./notes.service";
export function getNoteForOrgless(noteId: string) {
  return prisma.note.findUnique({ where: { id: noteId } });
}
```

- [ ] **Step 4: Run → PASS (2 tests). Commit:**
```bash
git add src/server/notes/transcribe-note.ts src/server/notes/transcribe-note.test.ts src/server/notes/notes.internal.ts
git commit -m "feat: transcribe-note job logic with failure handling (TDD)"
```

---

## Task 6: Inngest-Function `transcribeNote` + Audio-Upload-Route

**Files:** modify `src/inngest/functions.ts`; create `src/app/api/projects/[id]/notes/route.ts`.

- [ ] **Step 1: Inngest-Function** in `src/inngest/functions.ts`:
```ts
import type { InngestFunction } from "inngest";
import { inngest } from "./client";
import { runTranscribeNote } from "@/server/notes/transcribe-note";
import { storage } from "@/server/storage";
import { LocalWhisperTranscriber } from "@/server/transcription/local-whisper";

export const transcribeNote = inngest.createFunction(
  { id: "transcribe-note", retries: 2 },
  { event: "note/created" },
  async ({ event }) => {
    await runTranscribeNote(event.data.noteId, {
      storage,
      transcriber: new LocalWhisperTranscriber(),
    });
    return { noteId: event.data.noteId };
  },
);

export const functions: InngestFunction.Any[] = [transcribeNote];
```

- [ ] **Step 2: Audio-Upload-Route** `src/app/api/projects/[id]/notes/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { createNote } from "@/server/notes/notes.service";
import { storage } from "@/server/storage";
import { inngest } from "@/inngest/client";

const ALLOWED = new Map<string, string>([
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id: projectId } = await params;
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  const form = await req.formData();
  const file = form.get("audio");
  const recordedAtRaw = form.get("recordedAt");
  if (!(file instanceof File)) return NextResponse.json({ error: "audio fehlt" }, { status: 400 });

  const ext = ALLOWED.get(file.type);
  if (!ext) return NextResponse.json({ error: `Audiotyp ${file.type} nicht unterstützt` }, { status: 400 });

  const recordedAt = recordedAtRaw ? new Date(String(recordedAtRaw)) : new Date();
  if (Number.isNaN(recordedAt.getTime())) {
    return NextResponse.json({ error: "recordedAt ungültig" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `projects/${projectId}/notes/${crypto.randomUUID()}.${ext}`;
  await storage.put(key, buffer, file.type);
  const note = await createNote(projectId, { audioKey: key, recordedAt });

  await inngest.send({ name: "note/created", data: { noteId: note.id } });
  return NextResponse.json({ id: note.id, transcriptStatus: note.transcriptStatus });
}
```
> Anmerkung: Der Storage-Key ist UUID-basiert und stabil; `Note.audioUrl` = dieser Key. Ausgeliefert wird über `/api/files/<key>`.

- [ ] **Step 3: Build-Check** `pnpm exec tsc --noEmit` (clean). Run `pnpm test` (alle bisherigen Tests grün — die Inngest-Function selbst wird hier nicht unit-getestet, da `runTranscribeNote` bereits getestet ist).

- [ ] **Step 4: Commit**
```bash
git add src/inngest/functions.ts "src/app/api/projects"
git commit -m "feat: transcribeNote inngest function and audio upload route"
```

---

## Task 7: Foto-EXIF-Extraktion + Foto-Domänenlogik — TDD

**Files:** create `src/server/photos/exif.ts`, `src/server/photos/exif.test.ts`, `src/server/photos/photos.service.ts`, `src/server/photos/photos.service.test.ts`.

- [ ] **Step 1: Install** `pnpm add exifr`

- [ ] **Step 2: Failing test `exif.test.ts`** (robust gegen fehlende EXIF)
```ts
import { describe, expect, it } from "vitest";
import { extractTakenAt } from "./exif";

describe("extractTakenAt", () => {
  it("returns null for a buffer without EXIF", async () => {
    expect(await extractTakenAt(Buffer.from("not-an-image"))).toBeNull();
  });
});
```

- [ ] **Step 3: Run → FAIL. Implement `exif.ts`**
```ts
import exifr from "exifr";

/** Liest DateTimeOriginal aus EXIF; null, wenn nicht vorhanden/parsebar. */
export async function extractTakenAt(buffer: Buffer): Promise<Date | null> {
  try {
    const data = await exifr.parse(buffer, ["DateTimeOriginal"]);
    const v = data?.DateTimeOriginal;
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    return null;
  } catch {
    return null;
  }
}
```
Run → PASS (1 test).

- [ ] **Step 4: Failing test `photos.service.test.ts`**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createPhoto, listPhotos } from "./photos.service";

async function makeProject() {
  const org = await prisma.organization.create({ data: { name: "Büro" } });
  const project = await prisma.project.create({ data: { orgId: org.id, name: "P" } });
  return { org, project };
}

describe("photos.service", () => {
  beforeEach(async () => {
    await prisma.photo.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a photo and lists it org-scoped", async () => {
    const { org, project } = await makeProject();
    const photo = await createPhoto(project.id, {
      fileKey: "projects/p/photos/x.jpg",
      clientCapturedAt: new Date("2026-06-01T09:40:00Z"),
      exifTakenAt: null,
    });
    expect(photo.id).toBeTruthy();
    const list = await listPhotos(org.id, project.id);
    expect(list.map((p) => p.id)).toContain(photo.id);
  });

  it("does not list photos from another org", async () => {
    const a = await makeProject();
    const b = await makeProject();
    await createPhoto(a.project.id, { fileKey: "k", clientCapturedAt: new Date(), exifTakenAt: null });
    expect(await listPhotos(b.org.id, a.project.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run → FAIL. Implement `photos.service.ts`**
```ts
import { prisma } from "@/server/db";

export type CreatePhotoInput = {
  fileKey: string;
  clientCapturedAt: Date;
  exifTakenAt: Date | null;
};

export function createPhoto(projectId: string, input: CreatePhotoInput) {
  return prisma.photo.create({
    data: {
      projectId,
      fileUrl: input.fileKey,
      clientCapturedAt: input.clientCapturedAt,
      exifTakenAt: input.exifTakenAt ?? undefined,
    },
  });
}

export function listPhotos(orgId: string, projectId: string) {
  return prisma.photo.findMany({
    where: { projectId, project: { orgId } },
    orderBy: [{ exifTakenAt: "asc" }, { uploadedAt: "asc" }],
  });
}
```
Run → PASS (2 tests).

- [ ] **Step 6: Commit**
```bash
git add src/server/photos
git commit -m "feat: photo exif extraction and photos service (TDD)"
```

---

## Task 8: Foto-Upload-Route

**Files:** create `src/app/api/projects/[id]/photos/route.ts`.

- [ ] **Step 1: Route**
```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { createPhoto } from "@/server/photos/photos.service";
import { extractTakenAt } from "@/server/photos/exif";
import { storage } from "@/server/storage";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/heic", "heic"],
  ["image/webp", "webp"],
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id: projectId } = await params;
  const project = await getProject(session.orgId, projectId);
  if (!project) return new NextResponse("Not found", { status: 404 });

  const form = await req.formData();
  const file = form.get("photo");
  const capturedRaw = form.get("clientCapturedAt");
  if (!(file instanceof File)) return NextResponse.json({ error: "photo fehlt" }, { status: 400 });

  const ext = ALLOWED.get(file.type);
  if (!ext) return NextResponse.json({ error: `Bildtyp ${file.type} nicht unterstützt` }, { status: 400 });

  const clientCapturedAt = capturedRaw ? new Date(String(capturedRaw)) : new Date();
  if (Number.isNaN(clientCapturedAt.getTime())) {
    return NextResponse.json({ error: "clientCapturedAt ungültig" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const exifTakenAt = await extractTakenAt(buffer);
  const key = `projects/${projectId}/photos/${crypto.randomUUID()}.${ext}`;
  await storage.put(key, buffer, file.type);
  const photo = await createPhoto(projectId, { fileKey: key, clientCapturedAt, exifTakenAt });

  return NextResponse.json({ id: photo.id, fileKey: key });
}
```

- [ ] **Step 2: Build-Check** (clean). Commit:
```bash
git add "src/app/api/projects"
git commit -m "feat: photo upload route with exif timestamp"
```

---

## Task 9: Projekt-Detailseite — Recorder, Notizenliste, Foto-Galerie

**Files:** modify `src/app/(app)/projects/[id]/page.tsx`; create client components `note-recorder.tsx`, `notes-list.tsx`, `photo-uploader.tsx`, `photo-gallery.tsx` und Server-Helfer `data.ts` unter `src/app/(app)/projects/[id]/`.

- [ ] **Step 1: Server-Datenlader `data.ts`**
```ts
import "server-only";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";
import { listNotes } from "@/server/notes/notes.service";
import { listPhotos } from "@/server/photos/photos.service";

export async function loadProjectDetail(projectId: string) {
  const session = await requireSession();
  const project = await getProject(session.orgId, projectId);
  if (!project) return null;
  const [notes, photos] = await Promise.all([
    listNotes(session.orgId, projectId),
    listPhotos(session.orgId, projectId),
  ]);
  return { project, notes, photos };
}
```

- [ ] **Step 2: Recorder `note-recorder.tsx`** (MediaRecorder → POST an Upload-Route)
```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function NoteRecorder({ projectId }: { projectId: string }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const router = useRouter();

  async function start() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => upload(new Blob(chunksRef.current, { type: "audio/webm" }));
    rec.start();
    mediaRef.current = rec;
    setRecording(true);
  }

  function stop() {
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "note.webm");
      fd.append("recordedAt", new Date().toISOString());
      const res = await fetch(`/api/projects/${projectId}/notes`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload fehlgeschlagen");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {!recording ? (
          <button onClick={start} disabled={busy} className="bg-cobalt text-white rounded p-2 disabled:opacity-50">
            🎤 Notiz aufnehmen
          </button>
        ) : (
          <button onClick={stop} className="bg-red-600 text-white rounded p-2">■ Stopp</button>
        )}
        {busy && <span className="text-gray-500 self-center">lädt…</span>}
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Notizenliste `notes-list.tsx`** (zeigt Status, erlaubt manuelles Transkript-Editieren — Editier-/Retry-Endpunkte siehe Schritt 5)
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type NoteView = {
  id: string;
  transcript: string | null;
  transcriptStatus: "pending" | "done" | "failed";
  recordedAt: string;
  audioKey: string;
};

export function NotesList({ projectId, notes }: { projectId: string; notes: NoteView[] }) {
  if (notes.length === 0) return <p className="text-gray-500">Noch keine Notizen.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((n) => (
        <NoteRow key={n.id} projectId={projectId} note={n} />
      ))}
    </ul>
  );
}

function NoteRow({ projectId, note }: { projectId: string; note: NoteView }) {
  const [text, setText] = useState(note.transcript ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    await fetch(`/api/projects/${projectId}/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: text }),
    });
    setSaving(false);
    router.refresh();
  }

  async function retry() {
    await fetch(`/api/projects/${projectId}/notes/${note.id}/retry`, { method: "POST" });
    router.refresh();
  }

  return (
    <li className="border rounded p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">{new Date(note.recordedAt).toLocaleString("de-AT")}</span>
        <StatusBadge status={note.transcriptStatus} />
        <audio controls src={`/api/files/${note.audioKey}`} className="h-8" />
      </div>
      {note.transcriptStatus === "failed" && (
        <button onClick={retry} className="self-start text-cobalt underline text-sm">Transkription erneut versuchen</button>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={note.transcriptStatus === "pending" ? "Transkription läuft…" : "Transkript"}
        className="border rounded p-2 min-h-20"
      />
      <button onClick={save} disabled={saving} className="self-start bg-cobalt text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {saving ? "Speichern…" : "Transkript speichern"}
      </button>
    </li>
  );
}

function StatusBadge({ status }: { status: NoteView["transcriptStatus"] }) {
  const map = {
    pending: ["bg-yellow-100 text-yellow-800", "läuft"],
    done: ["bg-green-100 text-green-800", "fertig"],
    failed: ["bg-red-100 text-red-800", "fehlgeschlagen"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
```

- [ ] **Step 4: Foto-Uploader + Galerie** `photo-uploader.tsx` und `photo-gallery.tsx`
```tsx
// photo-uploader.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PhotoUploader({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("photo", file);
        fd.append("clientCapturedAt", new Date(file.lastModified).toISOString());
        const res = await fetch(`/api/projects/${projectId}/photos`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload fehlgeschlagen");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="file" accept="image/*" capture="environment" multiple onChange={onChange} disabled={busy} />
      {busy && <span className="text-gray-500 text-sm">lädt…</span>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
```
```tsx
// photo-gallery.tsx
export type PhotoView = { id: string; fileKey: string };

export function PhotoGallery({ photos }: { photos: PhotoView[] }) {
  if (photos.length === 0) return <p className="text-gray-500">Noch keine Fotos.</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.id} src={`/api/files/${p.fileKey}`} alt="" className="aspect-square object-cover rounded border" />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Transkript-Edit- und Retry-Endpunkte** (von der Notizenliste benutzt)

`src/app/api/projects/[id]/notes/[noteId]/route.ts` (PATCH Transkript):
```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getNoteForOrg, setTranscript } from "@/server/notes/notes.service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await requireSession();
  const { noteId } = await params;
  const note = await getNoteForOrg(session.orgId, noteId);
  if (!note) return new NextResponse("Not found", { status: 404 });

  const body = await req.json().catch(() => ({}));
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const updated = await setTranscript(noteId, transcript);
  return NextResponse.json({ id: updated.id, transcriptStatus: updated.transcriptStatus });
}
```
`src/app/api/projects/[id]/notes/[noteId]/retry/route.ts` (POST):
```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/require-session";
import { getNoteForOrg, setTranscriptStatus } from "@/server/notes/notes.service";
import { inngest } from "@/inngest/client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await requireSession();
  const { noteId } = await params;
  const note = await getNoteForOrg(session.orgId, noteId);
  if (!note) return new NextResponse("Not found", { status: 404 });

  await setTranscriptStatus(noteId, "pending");
  await inngest.send({ name: "note/created", data: { noteId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Detailseite zusammensetzen** `src/app/(app)/projects/[id]/page.tsx` (ersetzt die Shell aus Plan 1):
```tsx
import { notFound } from "next/navigation";
import { loadProjectDetail } from "./data";
import { NoteRecorder } from "./note-recorder";
import { NotesList } from "./notes-list";
import { PhotoUploader } from "./photo-uploader";
import { PhotoGallery } from "./photo-gallery";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadProjectDetail(id);
  if (!data) notFound();
  const { project, notes, photos } = data;

  return (
    <main className="p-6 flex flex-col gap-8 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold text-cobalt">{project.name}</h1>
        {project.address && <p className="text-gray-600">{project.address}</p>}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Sprachnotizen</h2>
        <NoteRecorder projectId={project.id} />
        <NotesList
          projectId={project.id}
          notes={notes.map((n) => ({
            id: n.id,
            transcript: n.transcript,
            transcriptStatus: n.transcriptStatus,
            recordedAt: n.recordedAt.toISOString(),
            audioKey: n.audioUrl,
          }))}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Fotos</h2>
        <PhotoUploader projectId={project.id} />
        <PhotoGallery photos={photos.map((p) => ({ id: p.id, fileKey: p.fileUrl }))} />
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Build-Check** `pnpm exec tsc --noEmit` und `pnpm build` (müssen sauber sein). Commit:
```bash
git add "src/app/(app)/projects/[id]" "src/app/api/projects"
git commit -m "feat: project detail UI — audio recorder, notes list, photo gallery"
```

---

## Task 10: Echte faster-whisper-Verdrahtung + manuelle End-to-End-Verifikation

**Files:** keine neuen Quellcodedateien (nur Setup + Verifikation + ggf. README-Notiz).

- [ ] **Step 1: Whisper-venv aufsetzen** `bash scripts/whisper-setup.sh`
  Erwartet: `.venv-whisper` mit installiertem `faster-whisper`. **Falls für Python 3.14 keine `ctranslate2`-Wheels existieren:** als Concern melden; Fallback ist ein separater Python 3.12-Interpreter (`python3.12 -m venv …` falls verfügbar) — den Pfad in `WHISPER_VENV` setzen. Nichts erfinden; den tatsächlichen Zustand berichten.

- [ ] **Step 2: Smoke-Test der CLI** mit einer kurzen Test-Audiodatei (z. B. via `ffmpeg` ein 2-Sekunden-Sample erzeugen oder eine vorhandene Sprachaufnahme nutzen):
```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -ar 16000 /tmp/test.wav -y
.venv-whisper/bin/python scripts/transcribe.py /tmp/test.wav
```
  Erwartet: Befehl endet mit Code 0 und gibt (ggf. leeren) Text aus. (Ein Sinuston liefert evtl. leeres Transkript — entscheidend ist Exit 0.)

- [ ] **Step 3: End-to-End im Dev** (zwei Terminals):
  - Terminal A: `docker compose up -d && pnpm dev`
  - Terminal B: `pnpm dev:inngest` (Inngest Dev-Server)
  - Einloggen (Mailpit), Projekt öffnen, Notiz aufnehmen → Status „läuft" → nach Job-Lauf „fertig" mit Transkript. Foto hochladen → erscheint in Galerie. Audio in der Notizenliste abspielbar.
  Erwartet: Der Inngest-Job transkribiert die echte Aufnahme und der Text erscheint nach `router.refresh()`/erneutem Laden.

- [ ] **Step 4: Robustheit der Auslieferung** stichprobenartig prüfen: `/api/files/<key>` eines fremden Org-Projekts liefert 404 (org-scoping greift). Pfad-Traversal-Key liefert 404/Fehler.

- [ ] **Step 5: Commit** (falls README/Setup-Notizen ergänzt):
```bash
git add -A
git commit -m "docs: whisper local setup notes and e2e verification" || echo "nothing to commit"
```

---

## Task 11: Volltest, Build & finaler Review

- [ ] **Step 1:** `pnpm db:test:migrate` (Schema ist unverändert seit Plan 1, aber sicherstellen) → `pnpm test` (alle Suites grün: storage, transcriber, notes.service, transcribe-note, exif, photos.service).
- [ ] **Step 2:** `pnpm exec tsc --noEmit && pnpm lint && pnpm build` — alles sauber.
- [ ] **Step 3:** Finaler Code-Review über die gesamte Plan-2-Implementierung (Subagent), mit Fokus auf: Org-Scoping bei Notizen/Fotos/Datei-Auslieferung, Path-Traversal-Schutz im Storage, Fehlerpfade (Transkription `failed` + Retry), keine stillen Fehler, Transcriber-Abstraktion sauber (keine harte whisper-Kopplung außerhalb der Inngest-Function).
- [ ] **Step 4:** `superpowers:finishing-a-development-branch` → PR.

---

## Self-Review-Notiz (für Reviewer dieses Plans)

- **Spec-Abdeckung:** Sammeln von Sprachnotizen (Audio-Upload + STT-Hintergrundjob) und Fotos (Upload + EXIF/clientCapturedAt) je Projekt (Spec §2/§3 Schritt 2; §6a Transkription unmittelbar nach Upload als Background-Job; §8 Fehlerbehandlung: Transkript-Fehler sichtbar + manueller Retry + manuelle Texteingabe). Getrennte Pools (Notizen/Fotos unabhängig). Datei-Auslieferung authentifiziert + org-scoped.
- **Bewusst NICHT in Plan 2:** KI-PDF-Export + Foto-Zuordnung (Plan 3); PWA/Service-Worker + E2E-Playwright (Plan 4). Upload-Robustheit bleibt minimal (synchron + sichtbarer Fehler, kein Offline-Queue — Spec §8).
- **Testbarkeit:** STT hinter `Transcriber` (Fake in Tests); Job-Logik `runTranscribeNote` mit Dependency-Injection getestet; Storage gegen Temp-Verzeichnisse; alle Domänentests org-scoped gegen Test-Postgres.
- **Externe Abhängigkeit:** Echtes STT braucht `.venv-whisper` (faster-whisper) + ffmpeg; Risiko ctranslate2-Wheels auf Python 3.14 (in Task 10 behandelt). Kein API-Key/Account nötig.
- **Typkonsistenz:** `ObjectStorage` (put/read/exists/contentType), `Transcriber.transcribe(absPath)`, `createNote/listNotes/getNoteForOrg/setTranscript/setTranscriptStatus`, `createPhoto/listPhotos`, Storage-Key-Schema `projects/<projectId>/...` durchgängig.
