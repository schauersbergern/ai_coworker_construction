/**
 * GTFS stop refresh script — MVV + MVG
 *
 * Downloads the MVV and MVG GTFS ZIPs, extracts stops.txt, dedupes by name, and writes
 * the result to src/coworkers/bodo/server/sources/data/mvv-stops.json.
 *
 * REQUIRES NETWORK ACCESS — run this periodically as a pre-prod step when GTFS data changes.
 * The committed mvv-stops.json is a small hand-authored sample used as a fallback until a
 * real refresh has been performed.
 *
 * ABDECKUNG: MVV + MVG decken nur den Großraum München ab — NICHT ganz Bayern. Der
 * transit-Adapter meldet außerhalb dieses Raums daher "außerhalb der Datenabdeckung" (kein
 * ÖPNV-Mangel). Für bayernweite Abdeckung hier weitere GTFS-Feeds ergänzen (DB-Fernverkehr,
 * regionale Verkehrsverbünde) und SOURCES entsprechend erweitern.
 *
 * Usage: pnpm refresh:gtfs
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

const SOURCES = [
  "https://www.mvv-muenchen.de/fileadmin/mediapool/developer/opendata/gesamt_gtfs.zip",
  "https://www.mvg.de/static/gtfs/google_transit.zip",
];

const OUT = resolve(__dirname, "../src/coworkers/bodo/server/sources/data/mvv-stops.json");

function parseStops(csv: string): { name: string; lat: number; lon: number }[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  const iName = header.indexOf("stop_name");
  const iLat = header.indexOf("stop_lat");
  const iLon = header.indexOf("stop_lon");

  if (iName === -1 || iLat === -1 || iLon === -1) {
    console.warn("stops.txt missing expected columns; skipping source");
    return [];
  }

  return lines
    .slice(1)
    .map((l) => {
      // Simple split — GTFS stop_name may be quoted; strip surrounding quotes if present
      const cols = l.split(",");
      const name = cols[iName]?.replace(/^"|"$/g, "").trim() ?? "";
      const lat = Number(cols[iLat]);
      const lon = Number(cols[iLon]);
      return { name, lat, lon };
    })
    .filter((s) => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

async function main() {
  const byName = new Map<string, { name: string; lat: number; lon: number }>();

  for (const url of SOURCES) {
    console.log(`Fetching ${url} …`);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  HTTP ${res.status} — skipping`);
      continue;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(buf);
    const stopsTxt = files["stops.txt"];
    if (!stopsTxt) {
      console.warn("  stops.txt not found in ZIP — skipping");
      continue;
    }
    const stops = parseStops(strFromU8(stopsTxt));
    console.log(`  parsed ${stops.length} stops`);
    for (const s of stops) byName.set(s.name, s);
  }

  const stops = [...byName.values()];
  writeFileSync(OUT, JSON.stringify(stops, null, 2));
  console.log(`Wrote ${stops.length} stops to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
