import { ok, type DataPoint } from "./types";
import { wmsHasFeatureAtPoint } from "./wms";
import { HOCHWASSER } from "./endpoints";
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
