import { fetchJson } from "./http";
import type { GeocodeResult } from "../../run-assessment";

interface NominatimHit {
  lat: string; lon: string;
  address?: { suburb?: string; city_district?: string; postcode?: string; state?: string };
}

// Nominatim Usage Policy: max 1 Request/s. In-Memory-Throttle serialisiert Aufrufe und hält
// ≥1s Abstand — innerhalb DIESES Prozesses (genügt fürs MVP, Spec §8; mehrere Worker umgeht
// das nicht → dafür Self-Host / Inngest-throttle).
const MIN_INTERVAL_MS = 1000;
let lastCallAt = 0;
let gate: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  gate = run.then(() => {}, () => {}); // Kette nie mit Fehler abreißen lassen
  return run;
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=de&q=${encodeURIComponent(address)}`;
  const hits = await throttled(() => fetchJson<NominatimHit[]>(url));
  const h = hits[0];
  if (!h) return null;
  return {
    lat: Number(h.lat),
    lon: Number(h.lon),
    district: h.address?.suburb ?? h.address?.city_district ?? null,
    plz: h.address?.postcode ?? null,
    state: h.address?.state ?? null,
  };
}
