import { fetchJson } from "./http";
import type { Coordinate } from "../pipeline/profile";

/** Baut die WMS 1.3.0 GetFeatureInfo-URL für eine kleine BBOX um den Punkt (3x3-Grid, Mittelpixel). */
function buildWmsGetFeatureInfoUrl(base: string, layer: string, c: Coordinate): string {
  const d = 0.0002;
  const bbox = `${c.lat - d},${c.lon - d},${c.lat + d},${c.lon + d}`;
  return `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&INFO_FORMAT=application/json` +
    `&QUERY_LAYERS=${layer}&LAYERS=${layer}&CRS=EPSG:4326&WIDTH=3&HEIGHT=3&I=1&J=1&BBOX=${bbox}`;
}

/** Generische WMS 1.3.0 GetFeatureInfo-Punktabfrage: gibt es am Punkt ein Feature? */
export async function wmsHasFeatureAtPoint(base: string, layer: string, c: Coordinate): Promise<boolean> {
  const data = await fetchJson<{ features?: unknown[] }>(buildWmsGetFeatureInfoUrl(base, layer, c));
  return (data.features?.length ?? 0) > 0;
}

export async function wmsFeatureProps(base: string, layer: string, c: Coordinate): Promise<Record<string, unknown> | null> {
  const data = await fetchJson<{ features?: { properties?: Record<string, unknown> }[] }>(
    buildWmsGetFeatureInfoUrl(base, layer, c),
  );
  return data.features?.[0]?.properties ?? null;
}

/** Generische WFS 2.0.0 GetFeature-Punktabfrage (kleine BBOX um den Punkt). */
export async function wfsHasFeatureAtPoint(base: string, typeName: string, c: Coordinate): Promise<boolean> {
  const d = 0.0002;
  const bbox = `${c.lat - d},${c.lon - d},${c.lat + d},${c.lon + d}`;
  const url = `${base}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${typeName}&COUNT=1` +
    `&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&BBOX=${bbox},EPSG:4326`;
  const data = await fetchJson<{ features?: unknown[] }>(url);
  return (data.features?.length ?? 0) > 0;
}
