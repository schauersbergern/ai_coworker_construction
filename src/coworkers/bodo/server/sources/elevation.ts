import { fetchJson } from "./http";
import { ok, unavailable, type DataPoint } from "./types";
import { DGM1 } from "./endpoints";
import type { SourceContext } from "../pipeline/profile";

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
