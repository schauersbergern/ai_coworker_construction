import { ok, type DataPoint } from "./types";
import { wmsHasFeatureAtPoint } from "./wms";
import { DENKMAL } from "./endpoints";
import type { SourceContext } from "../pipeline/profile";

export interface DenkmalStatus {
  einzeldenkmal: boolean;
  ensemble: boolean;
  bodendenkmal: boolean;
}

export async function fetchDenkmal(ctx: SourceContext): Promise<DataPoint<DenkmalStatus>> {
  const c = ctx.coord;
  const { base, layers } = DENKMAL;
  const [einzeldenkmal, ensemble, bodendenkmal] = await Promise.all([
    wmsHasFeatureAtPoint(base, layers.einzeldenkmal, c),
    wmsHasFeatureAtPoint(base, layers.ensemble, c),
    wmsHasFeatureAtPoint(base, layers.bodendenkmal, c),
  ]);
  return ok(
    { einzeldenkmal, ensemble, bodendenkmal },
    { source: "BLfD via GDI-BY", license: "siehe Dienst", confidence: "high" },
  );
}
