import { fetchJson } from "./http";
import { ok, type DataPoint } from "./types";
import { OVERPASS } from "./endpoints";
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
    OVERPASS.interpreter,
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
