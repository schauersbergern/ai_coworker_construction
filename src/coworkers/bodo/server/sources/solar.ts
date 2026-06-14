import { fetchJson } from "./http";
import { ok, unavailable, type DataPoint } from "./types";
import { PVGIS } from "./endpoints";
import type { SourceContext } from "../pipeline/profile";

export interface SolarInfo {
  yieldKwhPerKwp: number;
  irradiation: number;
}

export async function fetchSolar(ctx: SourceContext): Promise<DataPoint<SolarInfo>> {
  const { lat, lon } = ctx.coord;
  const url = `${PVGIS.base}?lat=${lat}&lon=${lon}&peakpower=1&loss=14&outputformat=json`;
  const data = await fetchJson<{ outputs?: { totals?: { fixed?: { E_y?: number; "H(i)_y"?: number } } } }>(url);
  const fixed = data.outputs?.totals?.fixed;
  if (!fixed || fixed.E_y == null) {
    return unavailable<SolarInfo>({ source: "PVGIS (EU JRC)", license: "frei", reason: "kein Ertragswert" });
  }
  return ok(
    { yieldKwhPerKwp: fixed.E_y, irradiation: fixed["H(i)_y"] ?? 0 },
    { source: "PVGIS (EU JRC)", license: "frei", confidence: "high" },
  );
}
