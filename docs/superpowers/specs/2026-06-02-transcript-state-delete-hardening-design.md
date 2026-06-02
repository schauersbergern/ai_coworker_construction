# Transkriptions-State-Fix, Löschfunktionen & Security-Hardening

**Datum:** 2026-06-02
**Branch:** `fix/transcript-state-and-delete` → PR gegen `main`

## Kontext

Projekt-Detailseite (`src/app/(app)/projects/[id]/`) zeigt Sprachnotizen (mit
Whisper-Transkription via Inngest-Hintergrundjob) und Fotos. Die Seite ist eine
Server-Component, die einmalig lädt; Client-Komponenten lösen nach Mutationen
`router.refresh()` aus.

## Problem 1 — UI bleibt auf „Transkription läuft"

Nach dem Upload einer Notiz macht `note-recorder.tsx` ein einmaliges
`router.refresh()`. Die Notiz ist zu diesem Zeitpunkt `pending`. Der
Whisper-Job läuft danach asynchron weiter (Inngest). Wird er fertig, erfährt der
Client nichts davon — es fehlt jegliches Polling. Die Notiz bleibt sichtbar auf
„läuft", bis der Nutzer manuell neu lädt.

### Lösung

Client-seitiges Polling in `NotesList`:

- `useEffect`, das ein `setInterval` (~3 s) startet, **solange**
  `notes.some((n) => n.transcriptStatus === "pending")`.
- Jeder Tick ruft `router.refresh()` (re-rendert die Server-Component mit
  aktuellem Status).
- Intervall wird gestoppt, sobald keine Notiz mehr `pending` ist, sowie bei
  Unmount.
- Die bestehende Render-Time-Sync in `NoteRow` (übernimmt `note.transcript` bei
  Prop-Wechsel, sofern nicht `dirty`) zeigt das Transkript dann automatisch an.

Keine neue Server-Infrastruktur nötig.

## Problem 2 — Notiz löschen (ganze Notiz: Audio + Transkript)

### Storage

`ObjectStorage`-Interface um `delete(key: string): Promise<void>` erweitern.
`LocalStorage.delete` entfernt Datei + `.meta` (ENOENT ignorieren), via `abs()`
→ `assertSafeKey` gegen Path-Traversal abgesichert.

### Service

`deleteNote(noteId)` in `notes.service.ts`:
1. Notiz laden (für `audioUrl`).
2. Best-effort `storage.delete(audioUrl)` (Fehler loggen, nicht abbrechen — DB
   bleibt sonst inkonsistent mit verwaister UI).
3. `prisma.note.delete`.

### API

`DELETE` zur bestehenden Route `api/projects/[id]/notes/[noteId]/route.ts`.
Gleiche Autorisierung wie `PATCH`: `requireSession` → `getNoteForOrg(orgId, ...)`
→ Prüfung `note.projectId === id`, sonst 404.

### UI

3-Punkte-Menü (⋮) oben rechts in jeder `NoteRow`:
- Klick öffnet kleines Dropdown mit „Löschen".
- „Löschen" öffnet den gemeinsamen `ConfirmDialog` (Guard-Popup).
- Bei Bestätigung: `DELETE`-Fetch → `router.refresh()`.

## Problem 3 — Foto löschen

### Service

`getPhotoForOrg(orgId, photoId)` + `deletePhoto(photoId)` in `photos.service.ts`
(analog zu Notiz: Storage-Delete der `fileUrl`, dann DB-Delete).

### API

Neue Route `api/projects/[id]/photos/[photoId]/route.ts`, `DELETE`:
`requireSession` → `getPhotoForOrg(orgId, photoId)` → Prüfung
`photo.projectId === id`, sonst 404.

### UI

In `PhotoGallery` ✕-Button oben rechts auf jedem Thumbnail:
- Klick (stoppt Propagation, öffnet nicht die Lightbox) → `ConfirmDialog`.
- Bei Bestätigung: `DELETE` → `router.refresh()`.

## Gemeinsame Komponente — `ConfirmDialog`

Wiederverwendbares Client-Modal als Guard, genutzt von Notiz- und Foto-Löschung:
Titel/Text, „Löschen" (destruktiv) + „Abbrechen", Schließen via Backdrop/Escape,
Body-Scroll-Lock (analog Lightbox).

## Problem 4 — Security-Hardening & Clean-Code-Review

### Security-Header (`next.config.ts` `headers()`)

Global für alle Routen:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`
  (Mikrofon/Kamera bleiben für Aufnahme/Foto nutzbar)

### File-Serving härten

In `api/files/[...key]/route.ts` zusätzlich zum bestehenden `nosniff`:
`Content-Security-Policy: default-src 'none'; sandbox` auf der Antwort —
verhindert, dass je hochgeladener Inhalt als aktiver Content ausgeführt wird.

### Ownership

Alle neuen DELETE-Routen org-scoped (konsistent mit bestehendem Muster). Keine
ID wird ohne `requireSession` + Org-Prüfung akzeptiert.

### Clean-Code-Review

Nach Implementierung Review des Diffs (Konsistenz, tote Pfade, Naming).
High-Confidence-Fixes direkt im selben PR; Unsicheres/Größeres wird aufgelistet.

## Verifikation

- `pnpm build` (bzw. typecheck) + `pnpm test` (Vitest) müssen grün sein.
- Manuelle Smoke-Prüfung der Lösch- und Polling-Flows soweit möglich.

## Out of Scope

- Soft-Delete / Papierkorb (hartes Löschen ist gewünscht).
- Strikte CSP für die gesamte App (Risiko mit Next-Inline-Scripts) — nur die
  oben genannten Header.
