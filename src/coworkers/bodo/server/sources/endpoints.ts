/**
 * Zentrale Quellen-Endpoint-Registry (Bayern). Abgeleitet aus docs/bodo-datenquellen.md.
 *
 * ⚠️ = noch NICHT gegen Live-GetCapabilities verifiziert (Plan 2 Task 0, Pre-Prod-Schritt).
 * Aufgezeichnete Fixtures für CI-Tests werden je Adapter inline gemockt; echte Antworten
 * sollten vor Produktivnutzung als __fixtures__ gespeichert werden.
 */
export const HOCHWASSER = {
  base: "https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete",
  layers: { hqHaeufig: "hwgf_hqhaeufig", hq100: "hwgf_hq100", hqExtrem: "hwgf_hqextrem" },
} as const;

export const NATUR = {
  wfsBase: "https://www.lfu.bayern.de/gdi/wfs/natur/schutzgebiete",
  typeNames: {
    nsg: "naturschutzgebiet",
    lsg: "landschaftsschutzgebiet",
    ffh: "fauna_flora_habitat_gebiet",
    vogel: "vogelschutzgebiet",
  },
  biotopWmsBase: "https://www.lfu.bayern.de/gdi/wms/natur/biotopkartierung",
  biotopLayer: "biotopkartierung", // ⚠️ Layer-Name verifizieren
} as const;

export const GEOLOGIE = {
  grundwasserBase: "https://www.lfu.bayern.de/gdi/wms/wasser/hohegrundwasserstaende",
  grundwasserLayer: "hohegrundwasserstaende", // ⚠️ verifizieren
  digk25Base: "https://www.lfu.bayern.de/gdi/wms/geologie/digk25",
  digk25Layer: "digk25", // ⚠️ verifizieren
  baugrundProp: "baugrundtyp", // ⚠️ Property-Name verifizieren
} as const;

export const DENKMAL = {
  base: "https://geoservices.bayern.de/od/wms/gdi/v1/denkmal",
  layers: { einzeldenkmal: "einzeldenkmalO", ensemble: "bauensembleO", bodendenkmal: "bodendenkmalO" },
} as const;

export const DGM1 = {
  // ⚠️ ZU VERIFIZIEREN: DGM1 stammt laut Registry vom LDBV (geodaten.bayern.de/opengeodata),
  // NICHT vom LfU. Die Base unten ist ein Platzhalter auf der FALSCHEN Autorität — beim
  // Verifizieren den echten LDBV-Höhen-/WMS-Endpoint (geodaten.bayern.de) samt Layer/Property
  // ermitteln und hier eintragen. Bis dahin liefert der elevation-Adapter ggf. unavailable.
  base: "https://geodaten.bayern.de/dgm1-PLATZHALTER",
  layer: "dgm1",
  valueProp: "GRAY_INDEX",
} as const;

export const PVGIS = { base: "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc" } as const;

// Primärquelle laut Registry ist UBA (https://luftqualitaet.api.bund.dev/); Open-Meteo ist
// der Fallback. MVP wired zunächst nur Open-Meteo (keyfrei, stabil); UBA später ergänzen.
export const LUFT = { base: "https://air-quality-api.open-meteo.com/v1/air-quality" } as const;

export const SOZIO = {
  // ⚠️ Konkreter Datensatz/Endpoint des Open Data Portal München + district→Stadtbezirk-
  // Mapping in Klärung (Plan 2 Task 13). Bis dahin liefert der sozio-Adapter `unavailable`.
  portalBase: "https://opendata.muenchen.de",
} as const;
