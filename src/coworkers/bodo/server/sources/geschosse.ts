import { fetchJson } from "./http";
import { ok, unavailable, type DataPoint } from "./types";
import { OVERPASS } from "./endpoints";
import type { SourceContext } from "../pipeline/profile";

export interface GeschosseInfo {
  medianLevels: number;
  maxLevels: number;
  count: number;
}

export async function fetchGeschosse(ctx: SourceContext): Promise<DataPoint<GeschosseInfo>> {
  const { lat, lon } = ctx.coord;
  const query = `[out:json][timeout:25];(way["building"]["building:levels"](around:120,${lat},${lon}););out tags;`;
  const data = await fetchJson<{ elements: { tags?: { "building:levels"?: string } }[] }>(
    OVERPASS.interpreter,
    { method: "POST", body: query },
  );
  const levels = data.elements
    .map((e) => Number(e.tags?.["building:levels"]))
    .filter((n) => Number.isFinite(n));
  if (levels.length === 0) {
    return unavailable<GeschosseInfo>({
      source: "OpenStreetMap building:levels",
      license: "ODbL",
      reason: "keine Geschossdaten in OSM",
    });
  }
  levels.sort((a, b) => a - b);
  return ok(
    { medianLevels: levels[Math.floor(levels.length / 2)], maxLevels: levels[levels.length - 1], count: levels.length },
    { source: "OpenStreetMap building:levels", license: "ODbL", confidence: "low" },
  );
}
