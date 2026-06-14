import type { DataPoint } from "../sources/types";

export interface Coordinate {
  lat: number;
  lon: number;
}

/**
 * Einheitlicher Eingabe-Kontext für JEDEN Quellen-Adapter: Koordinate + Geocoding-Felder.
 * Adapter haben durchgängig die Signatur `fetchX(ctx: SourceContext)`. Quellen, die den
 * Stadtteil/PLZ brauchen (z.B. `sozio`), lesen `ctx.district`/`ctx.plz`; rein
 * koordinatenbasierte Adapter nutzen nur `ctx.coord`.
 */
export interface SourceContext {
  coord: Coordinate;
  district: string | null;
  plz: string | null;
}

/** Normalisiertes Standortprofil. Jedes Feld trägt seinen DataPoint. */
export interface LocationProfile {
  coordinate: Coordinate;
  district: DataPoint<string>;
  plz: DataPoint<string>;
  elevation: DataPoint<number>;
  // Weitere Felder werden in Plan 2 ergänzt (pois, transit, hochwasser, ...).
  fields: Record<string, DataPoint<unknown>>;
}
