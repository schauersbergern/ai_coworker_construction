import type { GeocodeResult } from "../../run-assessment";

// Plan 2 ersetzt diesen Stub durch einen echten Nominatim-Abruf.
export async function geocode(_address: string): Promise<GeocodeResult | null> {
  return { lat: 48.0865, lon: 11.5951, district: null, plz: null, state: "Bayern" };
}
