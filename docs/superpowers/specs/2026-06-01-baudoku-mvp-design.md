# Baudokumentation MVP – Design-Spec

**Datum:** 2026-06-01
**Produkt:** KI-Coworker für die Baubranche – erster Mitarbeiter: **Baudokumentation**
**Zielgruppe:** Architektur- & Planungsbüros (bis ~25 Mitarbeitende)
**Quelle:** Zoom-Meeting Matthias & Nikolaus, 01.06.2026

## 1. Kontext & Ziel

Das Unternehmen positioniert sich als Anbieter von „KI-Mitarbeitern" für die Baubranche, mit Fokus auf Architektur- und Planungsbüros (statt Handwerksbetriebe). Der erste KI-Mitarbeiter übernimmt die **Baudokumentation**.

**Geschäftlicher Rahmen:**
- Umsätze müssen **bis Anfang September 2026** fließen (Finanzierung läuft Ende August aus).
- → Umsatzgetriebenes Vorgehen: schlanker Scope, schnell vorzeigbar, schnell einsetzbar.
- Pilotgespräch mit 3 Architekt:innen am Mittwoch (03.06.2026).

**Primärziel des MVP:** Schlankes **Verkaufs-/Pilot-Tool**, das den Happy Path beherrscht — überzeugend im Pilotgespräch und danach von einem echten Pilotkunden im Alltag nutzbar.

## 2. Scope

### In Scope (MVP)
- **Projekte:** anlegen, auswählen, auflisten.
- **Erfassung (PWA, auch vor Ort am Handy):**
  - **Sprachnotizen** einsprechen → automatische Transkription.
  - **Fotos** hochladen.
  - Notizen und Fotos sind **getrennte Pools je Projekt** (kein zwingendes Verknüpfen vor Ort → schnellstes Erfassen).
- **KI-PDF-Export:** Button erzeugt aus allen Transkripten + Fotos eine strukturierte PDF-Dokumentation. Die **wertschöpfende Dokumentations-KI (Claude)** kommt ausschließlich hier zum Einsatz.
- **Transkription:** Sprachnotizen werden **unmittelbar nach dem Upload** transkribiert (STT als technische Begleitfunktion, nicht die wertschöpfende KI), damit Nutzer:innen den Text **vor dem Export prüfen und korrigieren** können. Entscheidung getroffen (vgl. Abschnitt 6) — kein Transkribieren erst beim Export.
- **Auth & Team-Modell (für Pilot bewusst einfach):** E-Mail-Magic-Link-Login. Pilot-Organisationen und ihre Nutzer:innen werden **manuell von uns provisioniert** (kein Self-Service-Signup, keine In-App-Einladungen im ersten Wurf). Eine Organisation hat mehrere Nutzer:innen; **alle Nutzer:innen einer Organisation sehen alle Projekte dieser Organisation** (kein Pro-Projekt-Rechtesystem). Self-Service-Onboarding und Einladungen sind ein Folgepaket.

### Explizit NICHT in Scope (später, wenn ein Kunde es braucht)
- Mängel-Kategorien, Gewerke, Schweregrade, strukturierte Pro-Mangel-Erfassung vor Ort.
- Status-Lebenszyklus (offen/in Arbeit/erledigt).
- Freigabe-/Genehmigungsworkflow.
- Echtzeit-KI bei der Erfassung (z. B. Foto → Mangelerkennung).
- Native Mobile-App (PWA deckt die Baustelle vorerst ab).
- Rollen-/Rechtesystem, Last-/Sicherheits-Audits, Offline-Sync-Edge-Cases, breite Browser-Matrix.

### Designprinzip
Intern **modular** bauen (Domänen-Module), damit Komponenten später einzeln vertreibbar sind — aber **ohne** vorab eine Plugin-/Plattform-Maschinerie zu bauen.

## 3. Kern-Userflow

1. **Projekt wählen oder anlegen.**
2. **Sammeln:** beliebig viele Sprachnotizen einsprechen (→ transkribiert) + Fotos hochladen, dem Projekt zugeordnet. Roh, ohne KI, ohne Kategorien.
3. **Export anstoßen** → KI generiert die strukturierte Dokumentation.
4. **PDF herunterladen / teilen.** (Mehrere Exporte pro Projekt möglich.)

## 4. Architektur

Eine **Next.js-Codebasis** (TypeScript, App Router).

- **Frontend:** Next.js + React, als **PWA** (Service Worker, installierbar). Foto via `<input capture>`, Audio via `MediaRecorder`. Seiten: Projektliste, Projekt-Detail (sammeln), Export.
- **Backend:** Next.js API Routes / Server Actions, getrennt in **Domänen-Module**: `auth`, `projects`, `notes`, `photos`, `report`.
- **Asynchrone Jobs:** Transkription (STT) und PDF-Generierung können das Request-/Function-Timeout überschreiten, laufen daher **nicht** inline im Request, sondern als Hintergrund-Jobs. Mechanismus für den Pilot: **Inngest** (sauberer Next.js-Fit, Retries, Beobachtbarkeit, großzügiges Free-Tier) — der Client stößt den Job an und **pollt den Status** (`transcriptStatus` bzw. `Report.status`). Minimaler Fallback ohne Drittanbieter: eine DB-Job-Tabelle mit einem separaten Worker-Prozess. Entscheidung im Implementierungsplan fixieren.
- **DB:** Postgres via Prisma.
- **Storage:** S3-kompatibler Object Storage für Audio, Fotos, generierte PDFs.
- **KI-Dienste:** Whisper/STT (Transkription), Claude/Anthropic (Doku-Generierung), PDF-Renderer (deterministisch aus strukturiertem JSON).

**Open Web UI** wird bewusst **nicht** als Basis genutzt — eine Chat-Oberfläche passt nicht zu strukturierter Erfassung, Foto-Workflow und PWA.

## 5. Datenmodell

```
Organization
  └─ User            { id, orgId, email }
  └─ Project         { id, orgId, name, address?, projectNo?, createdAt }
       ├─ Note       { id, projectId, audioUrl, transcript, transcriptStatus, recordedAt, createdAt }
       └─ Photo      { id, projectId, fileUrl, exifTakenAt?, clientCapturedAt, uploadedAt }
  └─ Report          { id, projectId, label, status, pdfUrl, reportJson, createdBy, generatedAt }
```

- `Note.transcriptStatus`: `pending | done | failed` (für Fehlerbehandlung).
- `Photo`-Zeitstempel: `clientCapturedAt` wird **immer** clientseitig beim Aufnehmen/Hochladen gesetzt (verlässlich); `exifTakenAt` nur, wenn EXIF vorhanden und plausibel ist. Für die Zuordnung gilt `effectiveTime = exifTakenAt ?? clientCapturedAt`.
- `Report.status`: `pending | done | failed`. `reportJson` speichert die strukturierte KI-Ausgabe, aus der das PDF gerendert wurde (Audit/Reproduzierbarkeit); `label` ist ein Anzeigename/Version (z. B. „Export 2 – 03.06.2026"); `createdBy` = erstellende:r Nutzer:in.
- **Keine** `Defect`/`Category`/`Status`-Tabellen. Spätere Strukturierung erweitert `Note`, ohne den Rest umzubauen.

## 6. KI-Integration

**(a) Transkription – unmittelbar nach Notiz-Upload (festgelegt):**
- Audio → Whisper/STT → `transcript` gespeichert; `transcriptStatus` gesetzt.
- Läuft als Hintergrund-Job direkt nach Upload (siehe Abschnitt 4, Job-Mechanismus); Nutzer:in sieht und korrigiert den Text vor dem Export (Transkript ist die Quelle fürs PDF).

**(b) Doku-Generierung – beim Export:**
- Input: alle Transkripte + Foto-Metadaten (`effectiveTime`) des Projekts → Claude.
- **Strukturierte Ausgabe** (Tool-Use / Structured Output) als JSON: Liste von „Feststellungen" (Titel, Ort soweit ableitbar, Text) + Foto-Zuordnung. Wird als `Report.reportJson` persistiert.
- **Keine Erfindungen:** Prompt erzwingt, nur zu formulieren, was in den Notizen steht; Unsicheres bleibt offen.
- **Foto-Zuordnung:** deterministisch im Code (nicht durch die KI) per Zeitstempel-Nähe — ein Foto wird der Notiz mit nächstgelegener `recordedAt` zugeordnet, sofern `|effectiveTime − recordedAt|` innerhalb eines **Matching-Fensters von ±2 Min** liegt. Kein Treffer im Fenster oder mehrdeutig → Foto kommt in die **Anhang-Galerie** (nummeriert, mit Zeitstempel). So geht nichts verloren, auch wenn Zeitstempel ungenau sind.
- **Prompt Caching** für den System-/Instruktionsteil.
- PDF-Renderer erzeugt aus dem JSON (+ Foto-Zuordnung) deterministisch das Dokument.

## 7. PDF-Output (bezahlter Output)

- **Deckblatt:** Projektname, Adresse, Begehungsdatum, Ersteller, Projekt-Nr.; Hinweis „automatisch erzeugt, vor Versand prüfen". Markenfarben Kobaltblau + Akzentgelb.
- **Feststellungen (durchnummeriert):** je aus Notiz-Transkript formuliert (Titel + Ort soweit ableitbar) mit zugeordneten Fotos.
- **Foto-Anhang:** nicht eindeutig zuordenbare Fotos als nummerierte Galerie.
- Bewusst ohne Schweregrad-/Gewerk-Spalten.

## 8. Fehlerbehandlung (sichtbar, keine stillen Fehler)

- **Transkription fehlgeschlagen:** Notiz bleibt gespeichert (Audio bleibt), Status „fehlgeschlagen – erneut versuchen"; Nutzer kann Audio anhören und Text manuell eintippen. Export läuft mit vorhandenen Transkripten weiter.
- **KI-Export fehlgeschlagen/Timeout:** klare Meldung, `Report.status = failed`, „Erneut versuchen". Keine halben PDFs.
- **Upload-Fehler (schlechtes Netz) — bewusst minimal im Pilot:** Uploads laufen synchron; pro Notiz/Foto wird der Status sichtbar gemacht (`hochgeladen / lädt / fehlgeschlagen`) und ein fehlgeschlagener Upload kann **manuell erneut versucht** werden. **Kein** Background-Sync, **keine** persistente Offline-Warteschlange, **keine** Garantie gegen Datenverlust bei Tab-Schließung — das ist ein eigenes PWA-Subsystem und steht außerhalb des Pilot-Scopes (vgl. Abschnitt 2: „Offline-Sync-Edge-Cases" nicht in Scope). Falls der erste Feldtest zeigt, dass das Netz auf Baustellen das spürbar bricht, wird robustes Queueing als eigenes Folgepaket nachgezogen.
- **Leeres Projekt exportieren:** geblockt mit Hinweis statt leerem PDF.

## 9. Teststrategie (auf Pilot-Tempo zugeschnitten)

- **Unit:** Foto-Zuordnungslogik (Zeitstempel-Matching), PDF-Renderer (JSON → Struktur), Eingabevalidierung.
- **Integration:** Upload → Transkript-Persistenz; Export-Endpoint mit **gemocktem** Claude/Whisper (deterministisch).
- **1 E2E-Happy-Path** (Playwright): Projekt anlegen → Notiz + Foto hochladen → PDF exportieren → PDF entsteht.
- **Nicht im Pilot:** Last-/Sicherheits-Audits, Offline-Sync-Edge-Cases, breite Browser-Matrix.

## 10. Offene Punkte / Annahmen

- Konkrete Anbieterwahl (STT-Dienst, Object-Storage-Provider, Hosting) im Implementierungsplan zu fixieren.
- Branding-Assets (finale Farbwerte, Logo) kommen von Matthias.
- Genaue PDF-Vorlage kann nach erstem Pilot-Feedback verfeinert werden.
