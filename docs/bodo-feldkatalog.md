# Datenpunkte-Checkliste — Standort-/Lagebewertungs-App (München/Bayern)

**Für:** Architekt / technische Recherche
**Anleitung:** Bitte pro Datenpunkt ankreuzen:
- Spalte **Verwenden** = wird in der Recherche/Architektur berücksichtigt
- Spalte **Unwichtig** = für MVP nicht relevant
- Spalte **Notiz** = Ergänzung, bessere Quelle, Bedenken
- Fehlt ein Datenpunkt? In die Leerzeilen am Ende des jeweiligen Blocks eintragen.

Legende Verdikt (Stand 06/2026): ✅ Gratis-API · 🟡 Gratis, nur Viewer/Bulk · 💶 kostenpflichtig · 🏛️ nur Behördenauskunft · ❔ noch offen/zu prüfen

---

## 0 · Eingabe & Basis

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| A1 | Adresse → Koordinaten (Lat/Lon) | Nominatim (OSM) | REST | ✅ | ☐ | ☐ | |
| A2 | Stadtteil / PLZ | Nominatim Reverse | REST | ✅ | ☐ | ☐ | |
| A3 | Höhe ü. NHN | LDBV DGM1 (opengeodata) | WMS/Bulk | ✅ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

## 1 · Gesamtbewertung & Scores (berechnet, keine Quelle)

| # | Datenpunkt | Berechnungsbasis | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|
| B1 | Ampel-Gesamtbewertung | aggregiert aus allen Blöcken | ✅ | ☐ | ☐ | |
| B2 | Vermarktungs-Score (0–100) | gewichtete Teilscores | ✅ | ☐ | ☐ | |
| B3 | Investitions-Signal | preishemmende Faktoren im Umkreis | ✅ | ☐ | ☐ | |
| B4 | Zielgruppen-Profil (Familien/YP/Studenten/Kapitalanleger/Senioren) | Regelwerk auf Teildaten | ✅ | ☐ | ☐ | |
| B5 | Mikrolage-Freitext | LLM (Claude API) auf Rohdaten | 💶 gering | ☐ | ☐ | |
| | _________________________ | | | ☐ | ☐ | |

## 2 · Infrastruktur & POIs

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| C1 | Supermärkte/Nahversorgung (200/500/1000m) | OSM `shop=supermarket` | Overpass | ✅ | ☐ | ☐ | |
| C2 | Ärzte/Apotheken | OSM `amenity=pharmacy/doctors` | Overpass | ✅ | ☐ | ☐ | |
| C3 | Gastronomie | OSM `amenity=restaurant/cafe` | Overpass | ✅ | ☐ | ☐ | |
| C4 | Schulen | OSM `amenity=school` | Overpass | ✅ | ☐ | ☐ | |
| C5 | Kitas | OSM `amenity=kindergarten` | Overpass | ✅ | ☐ | ☐ | |
| C6 | Grünflächen / Parks | OSM `leisure=park` | Overpass | ✅ | ☐ | ☐ | |
| C7 | Spielplätze | OSM `leisure=playground` | Overpass | ✅ | ☐ | ☐ | |
| C8 | POI-Bewertungen (Sterne) | Google Places | REST | 💶 | ☐ | ☐ | OSM hat keine Ratings |
| | _________________________ | | | | ☐ | ☐ | |

## 3 · ÖPNV & Erreichbarkeit

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| D1 | ÖPNV-Haltestellen + Distanz | MVV/MVG GTFS | Bulk-ZIP | ✅ | ☐ | ☐ | |
| D2 | Linien/Modi (U/S/Tram/Bus) | MVV GTFS | Bulk-ZIP | ✅ | ☐ | ☐ | |
| D3 | Walkability-Score | berechnet aus POI+ÖPNV-Dichte | ✅ | ☐ | ☐ | |
| D4 | Fahrt-/Gehzeiten zu Landmarks | OSRM/Valhalla/ORS (self-host bei Last) | REST | ✅ | ☐ | ☐ | |
| D5 | Entfernung Autobahnauffahrt/Bahnhof | OSM + Routing | Overpass+REST | ✅ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

## 4 · Bild & Geometrie

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| E1 | Straßenbilder (4 Richtungen) | Mapillary (frei) / Google Street View (💶) | API | ❔ | ☐ | ☐ | Abdeckung München prüfen |
| E2 | Luftbild / Orthophoto (Zoomstufen) | LDBV DOP (opengeodata) | WMS/WMTS | ✅ | ☐ | ☐ | |
| E3 | Flurkarte (Darstellung) | BayernAtlas / LDBV Parzellarkarte | WMS/Bulk | 🟡 | ☐ | ☐ | |
| E4 | Flurstück-Geometrie (Vektor) | ALKIS-WFS LDBV | WFS | 💶 | ☐ | ☐ | nur Rahmenvertrag; Alt: OSM/Bulk |
| E5 | 3D-Gebäude / Geschossigkeit (§34) | LDBV LoD2 + OSM `building:levels` | Bulk/Overpass | ✅ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

## 5 · Standortrisiken

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| F1 | Hochwasser HQhäufig/HQ100/HQextrem | LfU Bayern WMS `ueberschwemmungsgebiete` | WMS | ✅ | ☐ | ☐ | |
| F2 | Wassertiefen bei Hochwasser | LfU Bayern WMS `wassertiefen` | WMS | ✅ | ☐ | ☐ | |
| F3 | Naturschutz (NSG/LSG/FFH/Vogelschutz) | LfU Bayern `schutzgebiete` | WFS | ✅ | ☐ | ☐ | |
| F4 | Biotop | LfU Bayern `biotopkartierung` | WMS | ✅ | ☐ | ☐ | |
| F5 | Grundwasser (hohe Stände <3m) | LfU Bayern `hohegrundwasserstaende` | WMS | ✅ | ☐ | ☐ | |
| F6 | Geologie / Baugrundtypen | LfU Bayern `digk25` | WMS | ✅ | ☐ | ☐ | Gutachten bleibt manuell |
| F7 | Lärmbelastung Tag/Nacht (dB) | umgebungslaerm.bayern.de | WMS | ❔ | ☐ | ☐ | Endpoint prüfen |
| F8 | Besonnung / Verschattung | aus DGM1/LoD2 berechnet o. PVGIS | Bulk/REST | ❔ | ☐ | ☐ | |
| F9 | Altlasten | Altlastenkataster Bayern | — | 🏛️ | ☐ | ☐ | nur Antrag LHM/WWA |
| F10 | Baumbestand / Baumschutz | München Open Data / OSM `natural=tree` | WFS/Overpass | ❔ | ☐ | ☐ | Abdeckung lückenhaft |
| | _________________________ | | | | ☐ | ☐ | |

## 6 · Versorgung & Leitungen

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| G1 | Glasfaser / Breitband | Breitbandatlas Bund (gigabitgrundbuch.bund.de) | WMS/REST | ❔ | ☐ | ☐ | |
| G2 | Fernwärme-Netz | SWM | — | ❔ | ☐ | ☐ | offene Daten unklar |
| G3 | Stromleitungen/Trassen (500m) | OSM `power=line/cable` | Overpass | ✅ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

## 7 · Sozialstruktur & Markt

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| H1 | Einwohner je Stadtbezirk | Open Data Portal München | REST/Bulk | ✅ | ☐ | ☐ | |
| H2 | Bevölkerungsprognose | Statistisches Amt München / Indikatorenatlas | Bulk | ❔ | ☐ | ☐ | |
| H3 | Sozialstruktur-Indikatoren | Indikatorenatlas München | REST/Bulk | ❔ | ☐ | ☐ | |
| H4 | Kaufkraft-Index | GfK/MB Research (💶) / Näherung Destatis | — | 💶 | ☐ | ☐ | freie Näherung möglich |
| H5 | Mietspiegel / Mietniveau | Mietspiegel München (PDF) | Bulk | ❔ | ☐ | ☐ | maschinenlesbar? |
| H6 | Immobilien-Preisentwicklung | Gutachterausschuss / BORIS Bayern | WMS | 🟡 | ☐ | ☐ | |
| H7 | Leerstandsquote | Wohnungsmarktbarometer München | Bulk | ❔ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

## 8 · Umwelt & Energie

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| I1 | Luftqualität (PM2.5 / AQI) | UBA luftqualitaet.api.bund.dev / Open-Meteo | REST | ❔ | ☐ | ☐ | UBA-API frei |
| I2 | Solarpotenzial (kWh/Ertrag/CO₂) | PVGIS (EU JRC) | REST | ❔ | ☐ | ☐ | API-Doc vorhanden |
| I3 | Sonnenstunden/Jahr | PVGIS / DWD | REST | ❔ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

## 9 · Baurecht & Planungsrecht

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| J1 | Denkmalschutz (Einzel/Ensemble) | BLfD via GDI-BY `denkmal` WMS | WMS | ✅ | ☐ | ☐ | |
| J2 | Erhaltungssatzung (Umgriff) | GeoPortal München OpenData `erhalt_umgriff` | WFS | ❔ | ☐ | ☐ | evtl. besser als Original! prüfen |
| J3 | B-Plan / §34 BauGB | GeoPortal München | Viewer | 🏛️/❔ | ☐ | ☐ | |
| J4 | Sanierungsgebiet | GeoPortal München | Viewer | ❔ | ☐ | ☐ | |
| J5 | Vorkaufsrecht | Stadt München | — | 🏛️ | ☐ | ☐ | |
| J6 | Bodenrichtwert am Punkt | BORIS Bayern WMS `bodenrichtwerte_aktuell` | WMS | 🟡 | ☐ | ☐ | Abdeckung 06/2026 prüfen |
| J7 | GFZ / Wohnflächenpotenzial | berechnet (LoD2 + Regeln) | — | ✅ | ☐ | ☐ | Überschlag |
| J8 | Abstandsflächen (BayBO Art. 6) | berechnet aus Geometrie | — | ❔ | ☐ | ☐ | Vektor nötig |
| J9 | Erwerbsnebenkosten | Formel (Grunderwerbst./Notar/Makler) | — | ✅ | ☐ | ☐ | |
| J10 | Stellplatzschlüssel / Mobilitätskonzept | StSts/StPlS München (Satzung) | Regelwerk | ✅ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

## 10 · Vorhaben & Due Diligence

| # | Datenpunkt | Quelle (Vorschlag) | Zugriff | Verdikt | ☐ Verwenden | ☐ Unwichtig | Notiz |
|---|---|---|---|---|---|---|---|
| K1 | Bauvorhaben/Baustellen in der Nähe | OSM `landuse=construction` + LBK München | Overpass | ❔ | ☐ | ☐ | |
| K2 | Baulastenverzeichnis | LBK München | — | 🏛️ | ☐ | ☐ | nur Antrag |
| K3 | Kampfmittel (WWII) | Stadt München / RPV | — | 🏛️ | ☐ | ☐ | |
| K4 | Due-Diligence-Checkliste (Output) | aggregiert + Regelwerk | — | ✅ | ☐ | ☐ | |
| K5 | PDF-Dossier-Export | WeasyPrint/Puppeteer | — | ✅ | ☐ | ☐ | |
| | _________________________ | | | | ☐ | ☐ | |

---

### Fragen an den Architekten (bitte am Ende beantworten)
1. Welche der ❔-Punkte hast du als frei abrufbar bestätigt — mit welchem Endpoint?
2. Welche Punkte würdest du für ein **MVP** weglassen (als „Unwichtig" markiert)?
3. Fehlen Datenpunkte, die du für die Lagebewertung für essenziell hältst? → in Leerzeilen ergänzen.
4. Bei 🏛️-Punkten: als „manuell prüfen"-Hinweis ausgeben oder ganz weglassen?
5. Self-Hosting: Ab welcher Last brauchen wir eigenes Nominatim/Overpass/Routing?
