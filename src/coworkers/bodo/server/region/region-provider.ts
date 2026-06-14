import type { Coordinate } from "../pipeline/profile";

export type SourceId =
  | "elevation"
  | "pois"
  | "transit"
  | "hochwasser"
  | "natur"
  | "geologie"
  | "solar"
  | "luft"
  | "geschosse"
  | "sozio"
  | "denkmal";

export interface RegionProvider {
  id: string;
  /** Adapter, die an diesem Punkt gelten (Reihenfolge egal, Pipeline parallelisiert). */
  sourceIds: SourceId[];
}
