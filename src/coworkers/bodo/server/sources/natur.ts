import { ok, type DataPoint } from "./types";
import { wfsHasFeatureAtPoint, wmsHasFeatureAtPoint } from "./wms";
import { NATUR } from "./endpoints";
import type { SourceContext } from "../pipeline/profile";

export interface NaturStatus {
  nsg: boolean;
  lsg: boolean;
  ffh: boolean;
  vogel: boolean;
  biotop: boolean;
}

export async function fetchNatur(ctx: SourceContext): Promise<DataPoint<NaturStatus>> {
  const c = ctx.coord;
  const { wfsBase, typeNames, biotopWmsBase, biotopLayer } = NATUR;
  const [nsg, lsg, ffh, vogel, biotop] = await Promise.all([
    wfsHasFeatureAtPoint(wfsBase, typeNames.nsg, c),
    wfsHasFeatureAtPoint(wfsBase, typeNames.lsg, c),
    wfsHasFeatureAtPoint(wfsBase, typeNames.ffh, c),
    wfsHasFeatureAtPoint(wfsBase, typeNames.vogel, c),
    wmsHasFeatureAtPoint(biotopWmsBase, biotopLayer, c),
  ]);
  return ok({ nsg, lsg, ffh, vogel, biotop }, { source: "LfU Bayern WFS schutzgebiete", license: "CC BY 4.0", confidence: "high" });
}
