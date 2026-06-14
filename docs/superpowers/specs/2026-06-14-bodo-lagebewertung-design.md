# Bodo — Standort- & Lagebewertung (Coworker) · Design

**Status:** approved (Design-Review)
**Datum:** 2026-06-14
**Baut auf:** `docs/superpowers/specs/2026-06-14-modular-coworker-architecture-design.md`
**Ziel-Repo:** `ai_coworker_construction` (Baudoku-Plattform)

---

## 1. Überblick & Ziel

Ein neuer KI-Mitarbeiter **Bodo** für die Baudoku-Plattform. Der Nutzer gibt **eine
Adresse** ein; Bodo ruft automatisch ~ein Dutzend kostenlose, programmatisch
abrufbare Datenquellen ab, verdichtet sie zu einem **Standortprofil**, berechnet
**Scores** (Ampel, Vermarktungs-Score, Zielgruppen, Investitions-Signal), erzeugt
einen **Mikrolage-Text** (Claude) und exportiert ein **PDF-Dossier**. Vorbild ist der
„Standort-Bot" aus der Vorrecherche; Bodo bildet dessen nützlichen Kern mit
verifizierten Gratis-Quellen ab.

**Strukturelle Analogie zu Franz:** `Project → Report` ⇒ bei Bodo `Assessment →
Dossier`. Erfassung ist minimal (nur Adresse), die Wertschöpfung liegt im
Hintergrundjob (Fan-out-Datenabruf + Scoring + Narrative) und im PDF.

### Ziele (MVP)
- Eigenständiger Coworker nach dokumentiertem Muster (Manifest, Registry, guarded UI,
  gegatetes Backend, Inngest-Job), pro Org per `OrgModule` freischaltbar.
- Funktioniert für **ganz Bayern** (Adresse → Bewertung).
- Nur **verifizierte ✅-Gratis-Quellen** (siehe `docs/bodo-datenquellen.md`).
- Jeder Datenpunkt trägt **Quelle + Lizenz + Konfidenz + Status**; nicht abrufbare
  Felder erscheinen als „manuell prüfen", nie als erfundener Wert.
- **Adapter-Naht** für spätere Ausweitung auf weitere Bundesländer/DACH ohne
  Pipeline-Umbau.

### Nicht-Ziele (MVP, bewusst ausgeklammert)
- Kostenpflichtige/Behörden-gebundene Felder (ALKIS-Vektor, Bodenrichtwert-Detail,
  Altlasten, Baulasten, Mietspiegel-Feinwerte, Kaufkraft GfK) → nur als
  Due-Diligence-/„manuell prüfen"-Hinweise.
- Street View / Mapillary-Bilder (Abdeckung/Recht ungeklärt).
- Self-Hosting von Nominatim/Overpass/Routing (nur als Skalierungspfad dokumentiert).
- Andere Bundesländer als Bayern (Naht vorhanden, aber kein zweiter Provider).

---

## 2. Architektur

Modul `src/coworkers/bodo/` (analog `franz/`). Geteilte Primitive (`auth`, `db`, `log`,
`storage`) bleiben unter `src/server/`. Boundary-Linting verbietet Zugriff in Interna
anderer Coworker.

```
src/coworkers/bodo/
  manifest.ts            # CoworkerManifest<BodoConfig>
  config.ts              # Zod-Schema + Defaults (systemPrompt, Gewichte, Labels, Quellen-Flags)
  config.test.ts
  server/
    region/
      region-provider.ts        # Interface: welche Quellen-Sets gelten am Punkt
      bayern-provider.ts        # v1-Implementierung
      region-provider.test.ts
    sources/                    # je 1 Adapter, normalisiert auf DataPoint
      types.ts                  # DataPoint<T>, SourceResult, SourceStatus
      nominatim.ts              # Geocoding + Reverse (Stadtteil/PLZ)
      dgm1-elevation.ts         # Höhe ü. NHN (LDBV)
      overpass.ts               # POIs (Supermarkt, Arzt, Apotheke, Schule, Kita, Park, Spielplatz)
      gtfs-stops.ts             # nächste ÖPNV-Haltestelle aus vorab-geladenem Stops-Dataset
      lfu-hochwasser.ts         # HQhäufig/HQ100/HQextrem (WMS GetFeatureInfo)
      lfu-natur.ts              # Schutzgebiete/FFH/Biotop (WFS/WMS)
      lfu-geologie.ts           # hohe Grundwasserstände + Baugrundtypen (WMS)
      pvgis.ts                  # Solarpotenzial/Ertrag (REST)
      luftqualitaet.ts          # PM2.5/AQI (UBA bzw. Open-Meteo REST)
      lod2-geschosse.ts         # Geschossigkeit/§34-Referenz (LoD2 + OSM building:levels)
      opendata-muenchen.ts      # Einwohner/Sozialstruktur je Stadtbezirk (nur München)
      blfd-denkmal.ts           # Denkmalschutz (GDI-BY WMS)
      *.test.ts                 # je Adapter mit aufgezeichneten Fixtures
    pipeline/
      build-profile.ts          # Fan-out + Timeout + graceful degradation → LocationProfile
      build-profile.test.ts
      profile.ts                # LocationProfile-Typ
    scoring/
      score.ts                  # reine Funktionen: Ampel, Vermarktungs-Score, Zielgruppen, Signal
      score.test.ts
    narrative/
      narrative.ts              # Port: erzeugt Mikrolage-Text aus LocationProfile
      claude-narrative.ts       # Anthropic-SDK-Implementierung (nutzt config.systemPrompt)
      narrative.test.ts
    pdf/
      dossier-document.tsx      # React-PDF-Komponente
      render-dossier.tsx        # Buffer-Renderer
      render-dossier.test.ts
    assessment/
      assessment.service.ts     # org-scoped CRUD (create/list/get)
      assessment.internal.ts    # interne Job-Helfer (Status-Übergänge, Snapshot)
      assessment.service.test.ts
    run-assessment.ts           # Inngest-Job-Body (run-Funktion, testbar ohne Inngest)
    run-assessment.test.ts
```

UI: `src/app/(app)/c/bodo/` mit Guard-Layout (`requireAvailable`):
```
c/bodo/layout.tsx                        # requireAvailable(orgId, "bodo")
c/bodo/standorte/page.tsx                # Liste der Assessments
c/bodo/standorte/new/action.ts           # Server Action: Adresse → Assessment + Event
c/bodo/standorte/new/new-assessment-form.tsx
c/bodo/standorte/[id]/page.tsx           # Detail: Profil, Scores, Karte, Status
c/bodo/standorte/[id]/data.ts            # org-scoped Datenladen
c/bodo/standorte/[id]/export-button.tsx  # PDF-Dossier on-demand
```

### Adapter-Naht (Region-Provider)
`RegionProvider` kapselt, **welche** Quellen-Adapter für einen Punkt gelten und mit
welchen Parametern (z. B. LfU-Bayern-WMS nur in Bayern). Die Pipeline fragt
`regionProvider.sourcesFor(coord)` und führt die zurückgegebene Adapter-Liste aus.
v1 liefert immer `BayernProvider`. Spätere Provider (NRW, AT, CH) werden additiv
registriert; Pipeline/Scoring/PDF bleiben unverändert.

---

## 3. Datenmodell (Prisma)

Neues Modell, org-scoped (Tenant-Grenze in der Service-Schicht erzwungen):

```prisma
enum AssessmentStatus {
  pending
  running
  ready
  failed
  cancelled
}

model Assessment {
  id         String           @id @default(cuid())
  orgId      String
  org        Organization     @relation(fields: [orgId], references: [id], onDelete: Cascade)
  address    String                       // Roh-Eingabe
  lat        Float?
  lon        Float?
  district   String?
  plz        String?
  elevation  Float?                        // m ü. NHN
  status     AssessmentStatus @default(pending)
  profile    Json?                         // normalisierte DataPoints
  scores     Json?                         // Ampel + Teilscores + Zielgruppen
  narrative  String?                       // Mikrolage-Text
  configSnapshot Json                      // Config zum Enqueue-Zeitpunkt
  configVersion  Int          @default(0)
  error      String?
  pdfPath    String?                       // im object storage
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  @@index([orgId])
}
```

`Organization` erhält die Gegenrelation `assessments Assessment[]`.

---

## 4. Datenfluss

1. **Erfassen:** Nutzer gibt Adresse ein → Server Action prüft `isAvailable(orgId,
   "bodo")` → `Assessment` (status `pending`) + `configSnapshot` → sendet Event
   `assessment/requested`.
2. **Job (`run-assessment`):** atomarer Übergang `pending → running` (claim, gegen
   Doppel-Jobs), Re-Check Verfügbarkeit (sonst `cancelled`).
3. **Geocoding** (Nominatim) → lat/lon/district/plz; **DGM1** → elevation. Schlägt
   Geocoding fehl → `failed` mit Grund (ohne Koordinaten kein Profil).
4. **Fan-out:** `regionProvider.sourcesFor(coord)` → alle Adapter **parallel** mit
   per-Source-Timeout. Jeder Adapter liefert `DataPoint` (Wert **oder**
   `status: unavailable` + Grund). Eine fehlende Quelle bricht den Job nie ab.
5. **Verdichten** → `LocationProfile`.
6. **Scoring** (rein, deterministisch) → `scores`.
7. **Narrative** (Claude, `configSnapshot.narrative.systemPrompt`) → `narrative`.
   Schlägt Claude fehl → `narrative = null`, Job bleibt `ready` (Text optional).
8. **Persistieren** → `profile`, `scores`, `narrative`, status `ready`.
9. **PDF:** on-demand per Export-Button (rendert aus gespeichertem Profil/Scores,
   wie Franz-Report-Download), `pdfPath` gecacht.

---

## 5. Datenpunkt-Kontrakt

Einheitlicher Typ für jede Quelle (macht „Nicht ermittelbar" zur Normalität, nicht zur
Ausnahme):

```ts
type SourceStatus = "ok" | "unavailable" | "error";

interface DataPoint<T> {
  value: T | null;
  status: SourceStatus;        // unavailable = Quelle hat keinen Wert; error = Abruf fehlgeschlagen
  reason?: string;             // z.B. "nicht per API abrufbar", "timeout"
  source: string;              // z.B. "LfU Bayern WMS ueberschwemmungsgebiete"
  license: string;             // z.B. "CC BY 4.0"
  retrievedAt: string;         // ISO
  confidence: "high" | "medium" | "low";
}
```

`LocationProfile` ist ein Objekt benannter `DataPoint`-Felder + den Roh-Koordinaten.

---

## 6. Scoring (rein, getestet)

Reine Funktionen über `LocationProfile` → keine Seiteneffekte, voll unit-testbar.
Konfigurierbare Gewichte (`config.scoring.weights`). Output:
- **Ampel** (grün/gelb/rot) aus gewichteter Gesamtbewertung.
- **Vermarktungs-Score** 0–100 aus Teilscores (gastro/kultur, grün, ÖPNV, schulen,
  kaufkraft, walkability, nahversorgung).
- **Zielgruppen-Profil** (Familien/Young Professionals/Studenten/Kapitalanleger/
  Senioren) per Regelwerk → primäre Zielgruppe.
- **Investitions-Signal** aus preishemmenden Faktoren im Umkreis.
Fehlende Datenpunkte gehen als „neutral/unbekannt" ein (kein Absturz, transparent im
PDF markiert).

---

## 7. Konfiguration (pro Org, Zod)

```ts
bodoConfigSchema = z.object({
  narrative: z.object({ systemPrompt: z.string().min(1) }),
  scoring:   z.object({ weights: z.record(z.string(), z.number()) }),
  sources:   z.object({ /* je Quelle: enabled: boolean */ }),
  labels:    z.object({ /* UI-/PDF-Überschriften */ }),
})
```
Erfüllt den Leitsatz „Kundenanpassung = Flag + Config-Zeile": Quellen ab-/anschalten,
Gewichte/Texte anpassen — ohne Code-Branch. `configVersion` startet bei 0;
breaking Änderungen erhöhen ihn + Migration.

---

## 8. Fehlerbehandlung & Job-Robustheit

- **Graceful degradation:** jeder Adapter in `withTimeout` + try/catch; Fehler →
  `DataPoint{status:"error"}`, niemals Job-Abbruch.
- **Idempotenz:** terminale Zustände (`ready|failed|cancelled`) = No-op bei Re-Trigger.
- **Verfügbarkeits-Abbruch:** Coworker nicht verfügbar → `cancelled` (nicht hängen).
- **Config-Snapshot:** Job nutzt `configSnapshot` vom Enqueue (reproduzierbare Retries).
- **Atomarer Claim:** `pending → running` bzw. Retry `failed|cancelled → pending`
  atomar (kein Doppel-Job).
- **Rate-Limits:** MVP nutzt öffentliche Endpoints mit konservativen Timeouts +
  einfachem In-Memory-Throttle für Nominatim (1 req/s Policy). Self-Host-Pfad in §11.

---

## 9. Sicherheit / Gating (Defense-in-Depth)

Jede Bodo-Route, Server Action, Datei-Download und der Inngest-Job prüft eigenständig
`isAvailable(orgId, "bodo")` (Routen/Jobs) bzw. `requireAvailable` (Layout). Jede
DB-Abfrage org-scoped (`assessment: { orgId }`). Layout ist kein Sicherheits-Gate.
Keine personenbezogenen Daten — ausschließlich orts-/aggregatbezogene öffentliche
Daten (DSGVO-schonend by design).

---

## 10. Tests (TDD, neben dem Code)

- **Scoring:** reine Funktionen, Fixtures (vollständiges/teilweises/leeres Profil).
- **Adapter:** je Quelle mit **aufgezeichneten Fixtures**, `fetch` gemockt — kein
  Live-Netz in CI. Test deckt: Erfolg, leere Antwort (`unavailable`), Fehler (`error`).
- **Pipeline:** eine Quelle fällt aus → ihr Feld `error`, übrige Felder intakt,
  Job-Ergebnis `ready`.
- **Region-Provider:** Punkt in Bayern → erwartete Adapter-Liste.
- **Guard/Availability:** Integrationstest wie `franz/guard.integration.test.ts`.
- **Job:** Idempotenz, Verfügbarkeits-Abbruch, Snapshot-Nutzung.
- **PDF:** Render-Smoke-Test (Buffer entsteht, enthält Kernfelder).

---

## 11. Abhängigkeiten & Skripte

- **Keine schweren neuen Libs:** `fetch` eingebaut; WMS-Punktabfragen via
  `GetFeatureInfo`-URL (kein GIS-Lib). WFS-Punktabfrage via BBOX/Intersects-Filter.
- **`fflate`** (leichtgewichtig) nur für `scripts/refresh-gtfs.ts`: lädt MVV/MVG-GTFS,
  extrahiert `stops.txt` → statisches Stops-Dataset (committet/seed), damit der
  Pipeline-Abruf keine ZIPs zur Laufzeit ziehen muss. Periodisch erneuerbar.
- **Skalierungspfad (dokumentiert, nicht gebaut):** eigenes Nominatim/Overpass
  (Geofabrik-Extrakt Bayern/Oberbayern), Routing-Engine (OSRM/Valhalla) für echte
  Geh-/Fahrzeiten statt Luftlinie.

---

## 12. Integration in bestehenden Code (Touch-Points)

1. `prisma/schema.prisma` — `Assessment` + `AssessmentStatus` + `Organization.assessments`; Migration.
2. `src/coworkers/index.ts` — `registerCoworker(bodoManifest)`.
3. `src/inngest/functions.ts` — `runAssessment` als Inngest-Function registrieren;
   in `functions[]` aufnehmen; in `bodoManifest.inngestFunctions` referenzieren.
4. `scripts/seed-coworkers.ts` — `OrgModule`-Row für „bodo" (analog Franz).
5. Dashboard (`src/app/(app)/page.tsx`) — keine Änderung nötig (rendert Registry).
6. `package.json` — `fflate` + `scripts.refresh:gtfs`.

---

## 13. Zu übernehmende Ressourcen (aus diesem Projekt ins Repo)

Es existiert noch **kein Code**, nur Wissens-Artefakte:

| Quelle (dieses Projekt) | Ziel im Repo | Zweck |
|---|---|---|
| `docs/superpowers/specs/2026-06-14-bodo-lagebewertung-design.md` | gleiches Verzeichnis | diese Spec |
| `docs/superpowers/plans/2026-06-14-bodo-lagebewertung.md` | gleiches Verzeichnis | Implementierungsplan |
| `docs/bodo-datenquellen.md` | `docs/` | verifizierte Endpoint-/Lizenz-Registry |
| `Datenpunkte-Checkliste.md` | `docs/bodo-feldkatalog.md` | Feldkatalog |
| Screenshots (optional) | `docs/reference/bodo-vorbild/` | visuelle Referenz |

`Lagebewertung-Analyse.md`, die `.docx`-Checkliste und `tmp/deep-research-report.md`
sind Arbeitsstände; ihr verwertbarer Inhalt steckt in Spec + Datenquellen-Registry und
muss nicht zusätzlich übernommen werden.

---

## 14. Offene Punkte (vor/while Implementierung klären)

- Bodenrichtwert-Viewing-Abdeckung für München zum Implementierungszeitpunkt
  (LfU: Bayern-Vollabdeckung Ende Juni 2026 erwartet) — bleibt MVP-extern, ggf. später.
- `erhalt_umgriff` (Erhaltungssatzung als OpenData-WFS, GeoPortal München): verifizieren
  — potenziell ein Feld, das das Vorbild nicht hat (Bonus, nicht MVP-blockierend).
- Genaue LfU-Layer-Namen/`GetFeatureInfo`-Parameter pro Adapter beim Bau gegen Live-
  `GetCapabilities` final prüfen (siehe Datenquellen-Registry).
