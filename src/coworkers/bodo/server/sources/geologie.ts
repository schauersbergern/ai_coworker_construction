import { ok, type DataPoint } from "./types";
import { wmsHasFeatureAtPoint, wmsFeatureProps } from "./wms";
import { GEOLOGIE } from "./endpoints";
import type { SourceContext } from "../pipeline/profile";

export interface GeologieInfo {
  grundwasserHoch: boolean;
  baugrundtyp: string | null;
}

export async function fetchGeologie(ctx: SourceContext): Promise<DataPoint<GeologieInfo>> {
  const c = ctx.coord;
  const [grundwasserHoch, props] = await Promise.all([
    wmsHasFeatureAtPoint(GEOLOGIE.grundwasserBase, GEOLOGIE.grundwasserLayer, c),
    wmsFeatureProps(GEOLOGIE.digk25Base, GEOLOGIE.digk25Layer, c),
  ]);
  const bt = props?.[GEOLOGIE.baugrundProp];
  return ok(
    { grundwasserHoch, baugrundtyp: typeof bt === "string" ? bt : null },
    { source: "LfU Bayern WMS Geologie", license: "CC BY-ND 4.0", confidence: "medium" },
  );
}
