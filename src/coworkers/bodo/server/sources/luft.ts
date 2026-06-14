import { fetchJson } from "./http";
import { ok, unavailable, type DataPoint } from "./types";
import { LUFT } from "./endpoints";
import type { SourceContext } from "../pipeline/profile";

export interface LuftInfo {
  pm25: number | null;
  aqi: number | null;
}

function lastNonNull(arr?: (number | null)[]): number | null {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]!;
  return null;
}

export async function fetchLuft(ctx: SourceContext): Promise<DataPoint<LuftInfo>> {
  const { lat, lon } = ctx.coord;
  const url = `${LUFT.base}?latitude=${lat}&longitude=${lon}&hourly=pm2_5,european_aqi&forecast_days=1`;
  const data = await fetchJson<{ hourly?: { pm2_5?: (number | null)[]; european_aqi?: (number | null)[] } }>(url);
  const pm = data.hourly?.pm2_5;
  if (!pm || pm.length === 0) {
    return unavailable<LuftInfo>({ source: "Open-Meteo Air Quality (CAMS)", license: "frei", reason: "keine Luftdaten" });
  }
  return ok(
    { pm25: lastNonNull(pm), aqi: lastNonNull(data.hourly?.european_aqi) },
    { source: "Open-Meteo Air Quality (CAMS)", license: "frei", confidence: "medium" },
  );
}
