# Bodo Plan 2 — Datenquellen & Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Stubs aus Plan 1 (`geocode`, `buildProfile`) durch echte, fehlertolerante Datenquellen-Adapter ersetzen, sodass ein `Assessment` ein vollständiges `LocationProfile` aus den verifizierten Gratis-Quellen erhält.

**Architecture:** Ein Adapter pro Quelle, normalisiert auf `DataPoint`. Geteilte HTTP-/WMS-Helfer. Pipeline ruft alle vom `RegionProvider` gelisteten und in der Config aktivierten Adapter **parallel mit per-Source-Timeout** ab; eine fehlschlagende Quelle setzt nur ihr Feld auf `error`/`unavailable` und bricht den Job nie ab.

**Tech Stack:** TypeScript, eingebautes `fetch`, Vitest (fetch gemockt, keine Live-Netzzugriffe in CI), `fflate` (nur GTFS-Refresh-Skript).

**Voraussetzung:** Plan 1 abgeschlossen. Endpoints/Lizenzen: `docs/bodo-datenquellen.md`.

> **Konvention für ALLE Adapter-Tasks:** Jeder Adapter exportiert `async function fetchX(ctx: SourceContext, opts?) : Promise<DataPoint<…>>` — **einheitlich `SourceContext`** (aus `pipeline/profile`, enthält `coord`, `district`, `plz`), NICHT nur `Coordinate`. Koordinatenbasierte Adapter nutzen `ctx.coord`; `sozio` braucht `ctx.district`. Adapter fangen Fehler selbst NICHT (das macht die Pipeline via `runSource`), nutzen die Helfer aus Task 1/6, und geben bei leerem Ergebnis `unavailable(...)` zurück. Tests mocken `globalThis.fetch` und prüfen drei Fälle: Treffer → `ok`, leere Antwort → `unavailable`, HTTP-Fehler → wirft (Pipeline fängt). Die WMS/WFS-Helfer in `wms.ts` bleiben `Coordinate`-basiert (kein Adapter); Adapter reichen ihnen `ctx.coord`.

---

## Task 0: Quellen-Verifizierung & Fixtures (BLOCKER vor allen Adaptern)

**Files:** Create `src/coworkers/bodo/server/sources/endpoints.ts`, `src/coworkers/bodo/server/sources/__fixtures__/*.json`

Ziel: Keine geratenen Endpoints/Layer im Code. Vor der Implementierung der Adapter werden
die echten Dienste **einmal live** geprüft, die exakten Werte in `endpoints.ts` festgehalten
und je Adapter eine **aufgezeichnete Antwort** als Fixture committet (CI mockt `fetch` gegen
diese Fixtures — kein Live-Netz in Tests).

- [ ] **Step 1: GetCapabilities prüfen** (manuell, Werte notieren) — je Dienst die Capabilities
  abrufen und exakten Layer-/typeName-/Property-Namen + unterstütztes `INFO_FORMAT` bestätigen:
  - DGM1-Höhe: LDBV/GDI-BY-WMS — **Base/Layer/Property offen → hier final klären** (das in
    Plan 1/2 genutzte `…/gdi/wms/dgm` war ein Platzhalter).
  - Hochwasser: `https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete?SERVICE=WMS&REQUEST=GetCapabilities` → `hwgf_hqhaeufig|hwgf_hq100|hwgf_hqextrem`.
  - Natur (WFS): `https://www.lfu.bayern.de/gdi/wfs/natur/schutzgebiete?service=WFS&request=GetCapabilities` → `typeNames`; Biotop-WMS `…/gdi/wms/natur/biotopkartierung`.
  - Geologie: `…/gdi/wms/wasser/hohegrundwasserstaende`, `…/gdi/wms/geologie/digk25` → Property für Baugrundtyp.
  - Denkmal: `https://geoservices.bayern.de/od/wms/gdi/v1/denkmal?…GetCapabilities` → `einzeldenkmalO|bauensembleO|bodendenkmalO`.
  - PVGIS / Open-Meteo: REST, keyfrei — eine echte Antwort pro Endpoint speichern.
  - Sozio (München OpenData): konkreten Datensatz + `district→Stadtbezirk`-Mapping klären (siehe Task 13).

- [ ] **Step 2: `endpoints.ts` schreiben** — verifizierte Konstanten an EINER Stelle, z.B.:

```ts
export const DGM1 = { base: "…", layer: "…", valueProp: "…" } as const;          // Task 0 Step 1
export const HOCHWASSER = { base: "https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete",
  layers: { hqHaeufig: "hwgf_hqhaeufig", hq100: "hwgf_hq100", hqExtrem: "hwgf_hqextrem" } } as const;
export const DENKMAL = { base: "https://geoservices.bayern.de/od/wms/gdi/v1/denkmal",
  layers: { einzeldenkmal: "einzeldenkmalO", ensemble: "bauensembleO", bodendenkmal: "bodendenkmalO" } } as const;
// … natur (typeNames), geologie, pvgis, luft, sozio
```
Adapter importieren ihre Endpoints ausschließlich von hier (nicht inline hartkodieren).

- [ ] **Step 3: Fixtures aufzeichnen** — je Quelle eine echte Antwort (Treffer **und** leer) als
  JSON unter `__fixtures__/` ablegen. Adapter-Tests laden diese, statt Antworten zu erfinden.

- [ ] **Step 4: Commit** `chore(bodo): verified source endpoints + recorded fixtures`.

> **Akzeptanzkriterium:** Ein Adapter-Task aus 3–14 wird erst begonnen, wenn sein Endpoint in
> `endpoints.ts` verifiziert steht und seine Fixture existiert. Bleibt eine Quelle ungeklärt
> (z.B. DGM1-Layer, Sozio-Datensatz), wird ihr Adapter zunächst als fest `unavailable(...)`
> ausgeliefert (Pipeline bleibt grün) und in einem Folge-Task nachgezogen.

---

## Task 1: HTTP-Helfer (`withTimeout`, `fetchJson`)

**Files:**
- Create: `src/coworkers/bodo/server/sources/http.ts`
- Test: `src/coworkers/bodo/server/sources/http.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { withTimeout, fetchJson } from "./http";

describe("http helpers", () => {
  it("withTimeout rejects after the limit", async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 50)), 10, "x")).rejects.toThrow(/timeout/);
  });
  it("fetchJson parses ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 })));
    expect(await fetchJson("https://x")).toEqual({ a: 1 });
  });
  it("fetchJson throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(fetchJson("https://x")).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test src/coworkers/bodo/server/sources/http.test.ts`

- [ ] **Step 3: Implement**

`src/coworkers/bodo/server/sources/http.ts`:

```ts
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": "bodo-lagebewertung/1.0", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": "bodo-lagebewertung/1.0", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
  return res.text();
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(bodo): http helpers`

---

## Task 2: Echtes Geocoding (Nominatim) ersetzt Stub

**Files:**
- Modify: `src/coworkers/bodo/server/sources/nominatim.ts`
- Test: `src/coworkers/bodo/server/sources/nominatim.test.ts`

- [ ] **Step 1: Failing test** (fetch gemockt mit Nominatim-Fixture: `[{lat, lon, address:{suburb, postcode, state}}]`). Throttle deterministisch halten mit `vi.useFakeTimers()` + `vi.runAllTimersAsync()`, damit der 1s-Abstand den Test nicht real verzögert.

```ts
import { describe, it, expect, vi } from "vitest";
import { geocode } from "./nominatim";

it("maps a nominatim hit to GeocodeResult (inkl. state)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
    { lat: "48.0865", lon: "11.5951", address: { suburb: "Fasangarten", postcode: "81549", state: "Bayern" } },
  ]), { status: 200 })));
  const g = await geocode("Kiefernstr. 25, München");
  expect(g).toEqual({ lat: 48.0865, lon: 11.5951, district: "Fasangarten", plz: "81549", state: "Bayern" });
});

it("returns null when no hit", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
  expect(await geocode("nirgendwo")).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL** (Stub gibt feste Koordinaten).

- [ ] **Step 3: Implement**

```ts
import "server-only";
import { fetchJson } from "./http";
import type { GeocodeResult } from "../../run-assessment";

interface NominatimHit {
  lat: string; lon: string;
  address?: { suburb?: string; city_district?: string; postcode?: string; state?: string };
}

// Nominatim Usage Policy: max 1 Request/s. In-Memory-Throttle serialisiert Aufrufe und hält
// ≥1s Abstand — innerhalb DIESES Prozesses (genügt fürs MVP, Spec §8; mehrere Worker umgeht
// das nicht → dafür Self-Host / Inngest-throttle, Datenquellen §Skalierung).
const MIN_INTERVAL_MS = 1000;
let lastCallAt = 0;
let gate: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  gate = run.then(() => {}, () => {}); // Kette nie mit Fehler abreißen lassen
  return run;
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=de&q=${encodeURIComponent(address)}`;
  const hits = await throttled(() => fetchJson<NominatimHit[]>(url));
  const h = hits[0];
  if (!h) return null;
  return {
    lat: Number(h.lat),
    lon: Number(h.lon),
    district: h.address?.suburb ?? h.address?.city_district ?? null,
    plz: h.address?.postcode ?? null,
    state: h.address?.state ?? null, // Bundesland → Bayern-Check im Job
  };
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(bodo): real nominatim geocoding + 1 req/s throttle`

> Hinweis: Der In-Memory-Throttle erfüllt die 1-req/s-Policy aus Spec §8 für eine Worker-Instanz. Für echten Parallelbetrieb über mehrere Prozesse: Self-Host oder Inngest-`throttle`/`concurrency` (Datenquellen §Skalierung).

---

## Task 3: DGM1 Höhen-Adapter

**Files:** Create `sources/elevation.ts` + `.test.ts`

- [ ] Test: mockt eine WMS-`GetFeatureInfo`-JSON-Antwort mit Höhenwert → `ok(550, …)`; leere Features → `unavailable`.
- [ ] Implement: baut WMS-`GetFeatureInfo`-URL gegen den LDBV-DGM1-Dienst (Layer/Endpoint aus `GetCapabilities`, siehe Registry), parst den Höhenwert, gibt `ok(value,{source:"LDBV DGM1",license:"CC BY 4.0",confidence:"high"})`.

> **Endpoint nicht raten:** Base-URL, Layer-Name und Property-Name für DGM1 sind in **Task 0**
> gegen `GetCapabilities` zu verifizieren und als Fixture festzuhalten, BEVOR dieser Adapter
> implementiert wird. Die Konstanten unten kommen aus der in Task 0 erstellten
> `sources/endpoints.ts` (verifizierte Werte) — keine hartkodierten Rate-URLs im Adapter.

```ts
import "server-only";
import { fetchJson } from "./http";
import { ok, unavailable, type DataPoint } from "./types";
import type { SourceContext } from "../pipeline/profile";
import { DGM1 } from "./endpoints"; // { base, layer, valueProp } — in Task 0 verifiziert

export async function fetchElevation(ctx: SourceContext): Promise<DataPoint<number>> {
  const { lat, lon } = ctx.coord;
  const url = `${DGM1.base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&INFO_FORMAT=application/json` +
    `&QUERY_LAYERS=${DGM1.layer}&LAYERS=${DGM1.layer}&CRS=EPSG:4326&WIDTH=1&HEIGHT=1&I=0&J=0` +
    `&BBOX=${lat},${lon},${lat + 0.0001},${lon + 0.0001}`;
  const data = await fetchJson<{ features?: { properties?: Record<string, number> }[] }>(url);
  const val = data.features?.[0]?.properties?.[DGM1.valueProp];
  if (val == null) return unavailable<number>({ source: "LDBV DGM1", license: "CC BY 4.0", reason: "kein Höhenwert" });
  return ok(Number(val), { source: "LDBV DGM1", license: "CC BY 4.0", confidence: "high" });
}
```

- [ ] Run tests → PASS. Commit `feat(bodo): DGM1 elevation adapter`.

---

## Task 4: Overpass-POI-Adapter (Template für POI-Felder)

**Files:** Create `sources/overpass.ts` + `.test.ts`

- [ ] **Step 1: Failing test** — mockt Overpass-JSON (`elements:[{lat,lon,tags}]`), prüft Zählung + nächste Distanz je Kategorie.

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchPois } from "./overpass";

it("counts POIs and finds nearest distance per category", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ elements: [
    { lat: 48.0866, lon: 11.5952, tags: { amenity: "pharmacy" } },
  ] }), { status: 200 })));
  const dp = await fetchPois({ coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null });
  expect(dp.status).toBe("ok");
  expect(dp.value!.pharmacy.count).toBe(1);
  expect(dp.value!.pharmacy.nearestM).toBeLessThan(50);
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
import "server-only";
import { fetchJson } from "./http";
import { ok, type DataPoint } from "./types";
import type { Coordinate, SourceContext } from "../pipeline/profile";

const CATEGORIES: Record<string, string> = {
  supermarket: 'node["shop"="supermarket"]',
  pharmacy: 'node["amenity"="pharmacy"]',
  doctors: 'node["amenity"="doctors"]',
  school: 'node["amenity"="school"]',
  kindergarten: 'node["amenity"="kindergarten"]',
  restaurant: 'node["amenity"="restaurant"]',
  park: 'way["leisure"="park"]',
  playground: 'node["leisure"="playground"]',
};

export interface PoiCategory { count: number; nearestM: number | null; }
export type PoiResult = Record<string, PoiCategory>;

function haversineM(a: Coordinate, b: Coordinate): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function fetchPois(ctx: SourceContext, radiusM = 1000): Promise<DataPoint<PoiResult>> {
  const c = ctx.coord;
  const parts = Object.values(CATEGORIES).map((q) => `${q}(around:${radiusM},${c.lat},${c.lon});`).join("");
  const query = `[out:json][timeout:25];(${parts});out center;`;
  const data = await fetchJson<{ elements: { lat?: number; lon?: number; center?: Coordinate; tags?: Record<string, string> }[] }>(
    "https://overpass-api.de/api/interpreter",
    { method: "POST", body: query },
  );
  const result: PoiResult = {};
  for (const key of Object.keys(CATEGORIES)) result[key] = { count: 0, nearestM: null };
  for (const el of data.elements) {
    const pos = el.center ?? (el.lat != null ? { lat: el.lat, lon: el.lon! } : null);
    if (!pos || !el.tags) continue;
    const key = Object.keys(CATEGORIES).find((k) =>
      (k === "supermarket" && el.tags!.shop === "supermarket") ||
      (["pharmacy","doctors","school","kindergarten","restaurant"].includes(k) && el.tags!.amenity === k) ||
      (k === "park" && el.tags!.leisure === "park") ||
      (k === "playground" && el.tags!.leisure === "playground"),
    );
    if (!key) continue;
    const d = haversineM(c, pos);
    result[key].count++;
    if (result[key].nearestM == null || d < result[key].nearestM!) result[key].nearestM = Math.round(d);
  }
  return ok(result, { source: "OpenStreetMap / Overpass", license: "ODbL", confidence: "medium" });
}
```

- [ ] Run → PASS. Commit `feat(bodo): overpass POI adapter`.

---

## Task 5: GTFS-Haltestellen (Refresh-Skript + Nearest-Stop-Adapter)

**Files:** Create `scripts/refresh-gtfs.ts`, `src/coworkers/bodo/server/sources/data/mvv-stops.json` (generiert), `sources/transit.ts` + `.test.ts`. Modify `package.json` (`fflate`, script).

- [ ] **Step 1:** `pnpm add fflate`. `package.json` Skript: `"refresh:gtfs": "tsx scripts/refresh-gtfs.ts"`.
- [ ] **Step 2:** `scripts/refresh-gtfs.ts` lädt `gesamt_gtfs.zip` (MVV) + `google_transit.zip` (MVG), entpackt mit `fflate.unzipSync`, parst `stops.txt` (CSV: `stop_id,stop_name,stop_lat,stop_lon`), schreibt deduplizierte `[{name,lat,lon}]` nach `mvv-stops.json`. Run einmalig: `pnpm refresh:gtfs`.
- [ ] **Step 3: Failing test** für `transit.ts` (lädt Test-Fixture mit 2 Stops, erwartet nächste + Distanz):

```ts
import { describe, it, expect } from "vitest";
import { fetchTransit } from "./transit";

it("finds nearest stop within radius", async () => {
  const dp = await fetchTransit({ coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null }, [
    { name: "Kiefernstraße", lat: 48.0870, lon: 11.5955 },
    { name: "Weit weg", lat: 49, lon: 12 },
  ]);
  expect(dp.value!.nearest.name).toBe("Kiefernstraße");
  expect(dp.value!.nearest.distanceM).toBeLessThan(500);
});
```

- [ ] **Step 4: Implement** `transit.ts` — Signatur `fetchTransit(ctx: SourceContext, stops = DEFAULT_STOPS)`: nutzt `ctx.coord`, lädt im Default die gebündelten `mvv-stops.json` (optionaler 2. Param zum Injizieren in Tests), berechnet die nächste Haltestelle per Haversine, `unavailable` wenn keine in 1500 m.
  > **Runtime-Pfad:** Den Datensatz per statischem ESM-Import laden (`import stops from "./data/mvv-stops.json"` — wird in den Server-Build gebündelt, funktioniert auch im Next-`standalone`-Output), NICHT per `fs.readFile(process.cwd()+…)` (relativer Pfad bricht im Standalone-/Docker-Runtime). Bei Tests den Datensatz über den optionalen 2. Param injizieren, damit die JSON nicht im Test geladen werden muss.
- [ ] Run → PASS. Commit `feat(bodo): GTFS nearest-stop adapter + refresh script`.

---

## Task 6: WMS-`GetFeatureInfo`-Helfer (gemeinsam für LfU/BLfD)

**Files:** Create `sources/wms.ts` + `.test.ts`

- [ ] **Step 1: Failing test** — mockt JSON mit `features` → `true` bei Treffer am Punkt, `false` bei leerer `features`-Liste.

```ts
import { describe, it, expect, vi } from "vitest";
import { wmsHasFeatureAtPoint } from "./wms";

it("true when features present", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [{ properties: {} }] }), { status: 200 })));
  expect(await wmsHasFeatureAtPoint("https://wms", "layerA", { lat: 48, lon: 11 })).toBe(true);
});
it("false when no features", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 })));
  expect(await wmsHasFeatureAtPoint("https://wms", "layerA", { lat: 48, lon: 11 })).toBe(false);
});
```

- [ ] **Step 2/3: Implement**

```ts
import "server-only";
import { fetchJson } from "./http";
import type { Coordinate } from "../pipeline/profile";

/** Generische WMS 1.3.0 GetFeatureInfo-Punktabfrage (1x1-BBOX um den Punkt). */
export async function wmsHasFeatureAtPoint(base: string, layer: string, c: Coordinate): Promise<boolean> {
  const d = 0.0002;
  const bbox = `${c.lat - d},${c.lon - d},${c.lat + d},${c.lon + d}`;
  const url = `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&INFO_FORMAT=application/json` +
    `&QUERY_LAYERS=${layer}&LAYERS=${layer}&CRS=EPSG:4326&WIDTH=3&HEIGHT=3&I=1&J=1&BBOX=${bbox}`;
  const data = await fetchJson<{ features?: unknown[] }>(url);
  return (data.features?.length ?? 0) > 0;
}

export async function wmsFeatureProps(base: string, layer: string, c: Coordinate): Promise<Record<string, unknown> | null> {
  const d = 0.0002;
  const bbox = `${c.lat - d},${c.lon - d},${c.lat + d},${c.lon + d}`;
  const url = `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&INFO_FORMAT=application/json` +
    `&QUERY_LAYERS=${layer}&LAYERS=${layer}&CRS=EPSG:4326&WIDTH=3&HEIGHT=3&I=1&J=1&BBOX=${bbox}`;
  const data = await fetchJson<{ features?: { properties?: Record<string, unknown> }[] }>(url);
  return data.features?.[0]?.properties ?? null;
}
```

- [ ] Run → PASS. Commit `feat(bodo): WMS GetFeatureInfo helper`.

---

## Task 7: LfU Hochwasser-Adapter

**Files:** Create `sources/hochwasser.ts` + `.test.ts`

- [ ] Test: mockt `wmsHasFeatureAtPoint` (per `vi.mock("./wms")`) → bei HQ100-Treffer `value.hq100===true`.
- [ ] Implement: ruft `wmsHasFeatureAtPoint(base, layer, c)` für `hwgf_hqhaeufig|hwgf_hq100|hwgf_hqextrem` (Base = LfU `ueberschwemmungsgebiete`-WMS), gibt `ok({hqHaeufig,hq100,hqExtrem},{source:"LfU Bayern WMS ueberschwemmungsgebiete",license:"CC BY-SA 4.0",confidence:"high"})`.

```ts
import "server-only";
import { ok, type DataPoint } from "./types";
import { wmsHasFeatureAtPoint } from "./wms";
import { HOCHWASSER } from "./endpoints"; // in Task 0 verifiziert
import type { SourceContext } from "../pipeline/profile";

export interface FloodRisk { hqHaeufig: boolean; hq100: boolean; hqExtrem: boolean; }

export async function fetchHochwasser(ctx: SourceContext): Promise<DataPoint<FloodRisk>> {
  const c = ctx.coord;
  const { base, layers } = HOCHWASSER;
  const [hqHaeufig, hq100, hqExtrem] = await Promise.all([
    wmsHasFeatureAtPoint(base, layers.hqHaeufig, c),
    wmsHasFeatureAtPoint(base, layers.hq100, c),
    wmsHasFeatureAtPoint(base, layers.hqExtrem, c),
  ]);
  return ok({ hqHaeufig, hq100, hqExtrem },
    { source: "LfU Bayern WMS ueberschwemmungsgebiete", license: "CC BY-SA 4.0", confidence: "high" });
}
```

- [ ] Run → PASS. Commit `feat(bodo): LfU flood adapter`.

---

## Task 8–14: Übrige Adapter (gleiche Struktur, je eigener Endpoint)

Jeder Task: Failing test (fetch/wms gemockt mit **aufgezeichneter Fixture**, 3 Fälle) → Implement → PASS → Commit. **Voraussetzung pro Adapter:** base/layer/typeName/property-Namen stammen aus der in **Task 0** verifizierten `sources/endpoints.ts` (nicht raten). Alle Adapter haben die Signatur `fetchX(ctx: SourceContext)` und nutzen `ctx.coord` (bzw. `ctx.district` bei `sozio`). Die unten genannten Layer-/Property-Namen sind die aus `docs/bodo-datenquellen.md` abgeleiteten **Erwartungen** — in Task 0 gegen Live-`GetCapabilities` bestätigen und die Fixture daraus ableiten.

- [ ] **Task 8 — `sources/natur.ts`:** LfU `schutzgebiete`-WFS Punktabfrage (BBOX/`INTERSECTS`) für `naturschutzgebiet|landschaftsschutzgebiet|fauna_flora_habitat_gebiet|vogelschutzgebiet`; Biotop separat via `biotopkartierung`-WMS. Return `ok({nsg,lsg,ffh,vogel,biotop:boolean},{source:"LfU Bayern WFS schutzgebiete",license:"CC BY 4.0",confidence:"high"})`. Nutzt `wmsHasFeatureAtPoint(base,layer,ctx.coord)` (Biotop) + analogen WFS-`GetFeature`-Aufruf (eigener kleiner Helfer `wfsHasFeatureAtPoint` in `wms.ts`, gleiche BBOX-Logik, `typeNames`-Param). **Kontrakt/Fixture:** WFS-`GetFeature`-JSON mit `features:[]` (kein Treffer → alle false) bzw. `features:[{…}]` je Kategorie. typeNames in Task 0 bestätigen.
- [ ] **Task 9 — `sources/geologie.ts`:** `wmsHasFeatureAtPoint`/`wmsFeatureProps(base,layer,ctx.coord)` gegen LfU `hohegrundwasserstaende` (→ `grundwasserHoch:boolean`) und `digk25` (→ `baugrundtyp:string` aus der Property; Property-Name in Task 0 bestätigen). Return `ok({grundwasserHoch,baugrundtyp},{source:"LfU Bayern WMS Geologie",license:"CC BY-ND 4.0",confidence:"medium"})`.
- [ ] **Task 10 — `sources/solar.ts`:** PVGIS REST `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${ctx.coord.lat}&lon=${ctx.coord.lon}&peakpower=1&loss=14&outputformat=json`, parst `outputs.totals.fixed.E_y` (kWh/kWp/Jahr) + `H(i)_y`. Return `ok({yieldKwhPerKwp, irradiation},{source:"PVGIS (EU JRC)",license:"frei",confidence:"high"})`. **Fixture:** echte PVGIS-Antwort (REST, stabil/keyfrei) einmalig speichern.
- [ ] **Task 11 — `sources/luft.ts`:** Open-Meteo Air-Quality `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${ctx.coord.lat}&longitude=${ctx.coord.lon}&hourly=pm2_5,european_aqi&forecast_days=1`, nimmt letzten/aktuellen Stundenwert. Return `ok({pm25, aqi},{source:"Open-Meteo Air Quality (CAMS)",license:"frei",confidence:"medium"})`. **Fixture:** echte Antwort speichern.
- [ ] **Task 12 — `sources/geschosse.ts`:** Overpass `way["building"]["building:levels"](around:120,${ctx.coord.lat},${ctx.coord.lon})`; Median/Max `building:levels` im Nahbereich als §34-Referenz. Return `ok({medianLevels, maxLevels, count},{source:"OpenStreetMap building:levels",license:"ODbL",confidence:"low"})`; `count===0` → `unavailable("keine Geschossdaten in OSM")` (deckt sich mit Vorbild). *(LoD2-Bulk-Verfeinerung optional, später.)*
- [ ] **Task 13 — `sources/sozio.ts`:** Open Data Portal München — Einwohner/Sozialindikatoren je Stadtbezirk; Adapter liest **`ctx.district`** (aus dem Geocoding) und mappt es auf den Datensatz. `ctx.district == null` oder außerhalb Münchens → `unavailable("nur München")`. Return `ok({einwohner, …},{source:"Open Data Portal München",license:"DL-DE/BY-2.0",confidence:"medium"})`. **Task 0 muss klären:** konkreter Datensatz/Endpoint (Indikatorenatlas vs. CSV-Bulk), Mapping `district→Stadtbezirk`, Fixture. *(Erst implementieren, wenn der Datensatz in Task 0 bestätigt ist — sonst dieser eine Adapter zunächst als fest `unavailable("Datensatz in Klärung")`.)*
- [ ] **Task 14 — `sources/denkmal.ts`:** `wmsHasFeatureAtPoint(base,layer,ctx.coord)` gegen BLfD `https://geoservices.bayern.de/od/wms/gdi/v1/denkmal` für `einzeldenkmalO|bauensembleO|bodendenkmalO`. Return `ok({einzeldenkmal,ensemble,bodendenkmal:boolean},{source:"BLfD via GDI-BY",license:"siehe Dienst",confidence:"high"})`.

---

## Task 15: Echte Pipeline `buildProfile` (Fan-out + graceful degradation)

**Files:** Modify `src/coworkers/bodo/server/pipeline/build-profile.ts`; Modify `pipeline/profile.ts` (Felder ergänzen); Test `build-profile.test.ts`

- [ ] **Step 1: Profile-Typ erweitern** — `LocationProfile.fields` konkretisieren mit benannten optionalen DataPoints: `pois, transit, hochwasser, natur, geologie, solar, luft, geschosse, sozio, denkmal, elevation`.

- [ ] **Step 2: Failing test** — graceful degradation:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildProfile } from "./build-profile";

it("a failing source becomes an error field; others stay ok", async () => {
  const deps = {
    elevation: vi.fn(async () => ({ value: 550, status: "ok" })),
    pois: vi.fn(async () => { throw new Error("overpass down"); }),
    hochwasser: vi.fn(async () => ({ value: { hq100: false }, status: "ok" })),
    // übrige Adapter als ok-Stubs …
  } as any;
  const sourceIds = ["elevation", "pois", "hochwasser"] as any;
  const geo = { district: "Fasangarten", plz: "81549" };
  const profile = await buildProfile({ lat: 48.0865, lon: 11.5951 }, { sources: { elevation: true, pois: true, hochwasser: true } }, geo, { sourceIds, adapters: deps });
  expect(profile.district.status).toBe("ok");
  expect(profile.fields.elevation.status).toBe("ok");
  expect(profile.fields.pois.status).toBe("error");
  expect(profile.fields.hochwasser.status).toBe("ok");
});
```

- [ ] **Step 3: Implement** — `runSource` kapselt Timeout + try/catch → nie werfen; Adapter werden nur ausgeführt, wenn `regionProvider` sie listet UND `config.sources[id] === true`; deaktivierte → `unavailable("per Konfiguration deaktiviert")`.

```ts
import "server-only";
import type { LocationProfile, Coordinate, SourceContext } from "./profile";
import { ok, errored, unavailable, type DataPoint } from "../sources/types";
import { withTimeout } from "../sources/http";
import { resolveRegionProvider } from "../region/bayern-provider";
import type { SourceId } from "../region/region-provider";
// echte Adapter
import { fetchElevation } from "../sources/elevation";
import { fetchPois } from "../sources/overpass";
import { fetchTransit } from "../sources/transit";
import { fetchHochwasser } from "../sources/hochwasser";
import { fetchNatur } from "../sources/natur";
import { fetchGeologie } from "../sources/geologie";
import { fetchSolar } from "../sources/solar";
import { fetchLuft } from "../sources/luft";
import { fetchGeschosse } from "../sources/geschosse";
import { fetchSozio } from "../sources/sozio";
import { fetchDenkmal } from "../sources/denkmal";

// Alle Adapter teilen die Signatur fetchX(ctx: SourceContext).
type AdapterMap = Record<SourceId, (ctx: SourceContext) => Promise<DataPoint<unknown>>>;

const DEFAULT_ADAPTERS: AdapterMap = {
  elevation: fetchElevation, pois: fetchPois, transit: fetchTransit,
  hochwasser: fetchHochwasser, natur: fetchNatur, geologie: fetchGeologie,
  solar: fetchSolar, luft: fetchLuft, geschosse: fetchGeschosse,
  sozio: fetchSozio, denkmal: fetchDenkmal,
} as AdapterMap;

const TIMEOUT_MS = 12000;

async function runSource(id: SourceId, ctx: SourceContext, fn: (ctx: SourceContext) => Promise<DataPoint<unknown>>): Promise<DataPoint<unknown>> {
  try {
    return await withTimeout(fn(ctx), TIMEOUT_MS, id);
  } catch (e) {
    return errored({ source: id, license: "-", reason: e instanceof Error ? e.message : "Fehler" });
  }
}

export async function buildProfile(
  coord: Coordinate,
  snapshot: { sources?: Partial<Record<SourceId, boolean>> },
  geo: { district: string | null; plz: string | null },
  opts?: { sourceIds?: SourceId[]; adapters?: AdapterMap },
): Promise<LocationProfile> {
  // resolveRegionProvider liefert null außerhalb Bayerns; der Job bricht solche Fälle schon
  // vor buildProfile ab (Plan 1 Task 7). Defensiv hier: keine Quellen → leeres fields.
  const provider = resolveRegionProvider(coord);
  const sourceIds = opts?.sourceIds ?? provider?.sourceIds ?? [];
  const adapters = opts?.adapters ?? DEFAULT_ADAPTERS;
  const enabled = (id: SourceId) => snapshot.sources?.[id] !== false;
  const ctx: SourceContext = { coord, district: geo.district, plz: geo.plz };

  const entries = await Promise.all(
    sourceIds.map(async (id): Promise<[SourceId, DataPoint<unknown>]> => {
      if (!enabled(id)) return [id, unavailable({ source: id, license: "-", reason: "per Konfiguration deaktiviert" })];
      return [id, await runSource(id, ctx, adapters[id])];
    }),
  );

  const fields = Object.fromEntries(entries) as Record<string, DataPoint<unknown>>;

  // district/plz aus dem Geocoding als DataPoints (Single Source of Truth: keine DB-Spalten).
  const fromGeo = (v: string | null) =>
    v == null
      ? unavailable<string>({ source: "Nominatim (OSM)", license: "ODbL", reason: "nicht ermittelt" })
      : ok(v, { source: "Nominatim (OSM)", license: "ODbL", confidence: "high" });

  return {
    coordinate: coord,
    district: fromGeo(geo.district),
    plz: fromGeo(geo.plz),
    elevation: (fields.elevation as DataPoint<number>) ?? unavailable<number>({ source: "LDBV DGM1", license: "CC BY 4.0", reason: "n/a" }),
    fields,
  };
}
```

- [ ] **Step 4: Run → PASS.** **Step 5:** `pnpm exec tsc --noEmit && pnpm lint:boundaries` → grün. **Step 6: Commit** `feat(bodo): real fan-out pipeline with graceful degradation`.

---

## Task 16: Pipeline an den Job hängen (Stub entfernen)

**Files:** Modify `src/inngest/functions.ts` (nutzt bereits `geocode` + `buildProfile`; jetzt echte Module). `run-assessment.ts` ruft `buildProfile(coord, snapshot, geo)` bereits mit dem geo-Argument (district/plz) auf — die echte Pipeline (Task 15) hat dieselbe Signatur (`opts` ist optional, default = `provider.sourceIds`), also keine Job-Änderung nötig.

- [ ] **Step 1:** Sicherstellen, dass `src/coworkers/bodo/server/pipeline/build-profile.ts` (echt) importiert wird — der Stub aus Plan 1 ist dieselbe Datei und wurde in Task 15 ersetzt. `nominatim.geocode` ist seit Task 2 echt.
- [ ] **Step 2:** Job-Test aus Plan 1 erneut grün (`buildProfile`-Mock weiterhin injiziert).

Run: `pnpm test src/coworkers/bodo && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit** `feat(bodo): wire real geocode + pipeline into job`.

---

## Definition of Done (Plan 2)

- [ ] Alle Adapter-Tests grün (Erfolg/leer/Fehler je Adapter).
- [ ] Pipeline-Test beweist: eine fehlerhafte Quelle ⇒ nur ihr Feld `error`, Rest intakt, Job `ready`.
- [ ] `pnpm refresh:gtfs` erzeugt `mvv-stops.json`.
- [ ] Manuell (mit `pnpm dev` + `pnpm dev:inngest`): echte Adresse → Detailseite zeigt befülltes `profile` (mit einigen `unavailable`/`error`-Feldern — erwartbar).
- [ ] `pnpm lint:boundaries` grün.

**Nächste Phase:** `2026-06-14-bodo-plan-3-scoring-pdf.md` — Scoring, Claude-Mikrolage-Text und PDF-Dossier-Export.
