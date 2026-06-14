import { unavailable, type DataPoint } from "./types";
import type { SourceContext } from "../pipeline/profile";

export interface SozioInfo {
  einwohner: number | null;
}

// Datensatz/Endpoint des Open Data Portal München + district→Stadtbezirk-Mapping noch in
// Klärung (Plan 2 Task 0/13). Bis dahin bewusst immer unavailable; liest aber ctx.district,
// damit die spätere Implementierung nur den fetch ergänzen muss.
export async function fetchSozio(ctx: SourceContext): Promise<DataPoint<SozioInfo>> {
  if (!ctx.district) {
    return unavailable<SozioInfo>({
      source: "Open Data Portal München",
      license: "DL-DE/BY-2.0",
      reason: "kein Stadtteil aus Geocoding",
    });
  }
  return unavailable<SozioInfo>({
    source: "Open Data Portal München",
    license: "DL-DE/BY-2.0",
    reason: "Sozialdaten-Datensatz in Klärung (nur München)",
  });
}
