# Bodo — Datenquellen-Registry (Bayern, MVP)

Verifizierte, kostenlose, programmatisch abrufbare Quellen (Stand 2026-06, live geprüft
per GetCapabilities/HTTP). Endpoints vor Produktivnutzung erneut gegen
`GetCapabilities` prüfen — Layer-Namen/Pfade können sich ändern.

Legende Verdikt: ✅ Gratis-API · 🟡 Gratis, nur Viewer/Bulk · 💶 kostenpflichtig ·
🏛️ nur Behördenauskunft · ❔ noch zu verifizieren.

## MVP-Quellen (✅ verifiziert)

| Adapter | Datenpunkt | Quelle | Zugriff | Endpoint / Beispiel | Lizenz | Verdikt |
|---|---|---|---|---|---|---|
| `nominatim` | Adresse→Lat/Lon, Stadtteil, PLZ | Nominatim (OSM) | REST | `https://nominatim.openstreetmap.org/search?q=...&format=jsonv2` / `/reverse` | ODbL | ✅ (1 req/s Policy) |
| `dgm1-elevation` | Höhe ü. NHN | LDBV opengeodata DGM1 | WMS/Bulk | `https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=dgm1` | CC BY 4.0 | ✅ |
| `overpass` | POIs (Supermarkt/Arzt/Apotheke/Schule/Kita/Park/Spielplatz) | Overpass (OSM) | Overpass QL | `node["amenity"="pharmacy"](around:500,LAT,LON);out;` · `shop=supermarket` · `leisure=park\|playground` · `amenity=school\|kindergarten\|doctors\|restaurant` | ODbL | ✅ |
| `gtfs-stops` | nächste ÖPNV-Haltestelle, Linien | MVV + MVG GTFS | Bulk-ZIP | `https://www.mvv-muenchen.de/fileadmin/mediapool/developer/opendata/gesamt_gtfs.zip` · `https://www.mvg.de/static/gtfs/google_transit.zip` | CC BY 4.0 | ✅ (vorab laden, nicht zur Laufzeit) |
| `lfu-hochwasser` | HQhäufig/HQ100/HQextrem (+Wassertiefen) | LfU Bayern | WMS | `https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete?SERVICE=WMS&REQUEST=GetCapabilities` — Layer `hwgf_hq100` u.a.; Tiefen `.../wassertiefen` `wt_hq100` | CC BY-SA 4.0 | ✅ (GetFeatureInfo am Punkt) |
| `lfu-natur` | NSG/LSG/FFH/Vogelschutz + Biotop | LfU Bayern | WFS/WMS | `https://www.lfu.bayern.de/gdi/wfs/natur/schutzgebiete?service=WFS&request=GetCapabilities`; Biotop `.../gdi/wms/natur/biotopkartierung` | CC BY 4.0 | ✅ (WFS BBOX/Intersects) |
| `lfu-geologie` | hohe Grundwasserstände, Baugrundtypen | LfU Bayern | WMS | `https://www.lfu.bayern.de/gdi/wms/wasser/hohegrundwasserstaende?...GetCapabilities`; `https://www.lfu.bayern.de/gdi/wms/geologie/digk25?...` | CC BY 4.0 / dIGK25 CC BY-ND 4.0 | ✅ |
| `pvgis` | Solarpotenzial/Ertrag/CO₂, Sonnenstunden | PVGIS (EU JRC) | REST | `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=..&lon=..&peakpower=1&loss=14&outputformat=json` | EU/frei | ✅ (kein Key) |
| `luftqualitaet` | PM2.5 / AQI | UBA bzw. Open-Meteo | REST | `https://luftqualitaet.api.bund.dev/` (UBA) · Fallback `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=..&longitude=..&hourly=pm2_5` | frei | ✅ |
| `lod2-geschosse` | Geschossigkeit / §34-Referenz | LDBV LoD2 + OSM `building:levels` | Bulk/Overpass | `https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=lod2` + Overpass | CC BY 4.0 / ODbL | ✅ |
| `opendata-muenchen` | Einwohner/Sozialstruktur je Stadtbezirk | Open Data Portal München | REST/Bulk | `https://opendata.muenchen.de/` · Indikatorenatlas `https://opendata.muenchen.de/pages/indikatorenatlas` | DL-DE/BY-2.0 | ✅ (nur München; Bayern-weit = Lücke) |
| `blfd-denkmal` | Denkmalschutz (Einzel/Ensemble/Boden) | BLfD via GDI-BY | WMS | `https://geoservices.bayern.de/od/wms/gdi/v1/denkmal` — Layer `einzeldenkmalO`, `bauensembleO`, `bodendenkmalO` | siehe Dienst | ✅ (GetFeatureInfo) |

## Bewusst MVP-extern (als „manuell prüfen" ausgeben)

| Datenpunkt | Grund | Verdikt |
|---|---|---|
| Flurstück-Geometrie (Vektor) | ALKIS-WFS nur Rahmenvertrag LDBV; frei nur Raster/Bulk | 💶 / 🟡 |
| Bodenrichtwert am Punkt | WMS-Viewing, Bayern-Abdeckung 06/2026 unvollständig; Detail gebührenpflichtig | 🟡 |
| Altlasten | Kataster nicht offen, nur Antrag LHM/WWA | 🏛️ |
| Baulasten | LBK München, nur Antrag | 🏛️ |
| B-Plan-Details/§34/Sanierung | GeoPortal München nur Viewer (Ausnahme: `erhalt_umgriff` ❔ prüfen) | 🏛️/❔ |
| Mietspiegel-Feinwerte, Kaufkraft (GfK) | kommerziell / nicht maschinenlesbar | 💶 |
| Lärm dB, Fernwärme, Breitband, Bauvorhaben | Quell-Pointer vorhanden, nicht final verifiziert | ❔ |
| Street View / Mapillary | Abdeckung/Recht ungeklärt | ❔ |

## Skalierung (dokumentiert, nicht MVP)
- Nominatim 1 req/s, öffentliche Overpass-Instanzen gedrosselt → bei Last Self-Host
  (Geofabrik-Extrakt Bayern/Oberbayern).
- Routing (echte Geh-/Fahrzeiten) via OSRM/Valhalla/GraphHopper/OpenRouteService.
- DACH-Erweiterung: AT `data.gv.at`/`basemap.at`, CH `geo.admin.ch`/swisstopo — je
  als eigener `RegionProvider`.
