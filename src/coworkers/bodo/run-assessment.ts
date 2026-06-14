import type { Prisma } from "@prisma/client";
import { log } from "@/server/log";
import { claimForRun, markReady, markFailed, markCancelled, getSnapshot } from "./server/assessment/assessment.internal";
import { resolveRegionProvider } from "./server/region/bayern-provider";
import type { LocationProfile, Coordinate } from "./server/pipeline/profile";

export interface GeocodeResult {
  lat: number;
  lon: number;
  district: string | null;
  plz: string | null;
  state: string | null; // Bundesland (Nominatim address.state) — präziser Bayern-Check
}

export interface RunAssessmentDeps {
  isAvailable: (orgId: string, id: string) => Promise<boolean>;
  geocode: (address: string) => Promise<GeocodeResult | null>;
  buildProfile: (
    coord: Coordinate,
    snapshot: unknown,
    geo: { district: string | null; plz: string | null },
  ) => Promise<LocationProfile>;
}

/** attempt/maxAttempts kommen aus dem Inngest-Kontext (Step 4). Default = letzter Versuch. */
export interface RunContext {
  attempt: number;
  maxAttempts: number;
}

export async function runAssessment(
  id: string,
  deps: RunAssessmentDeps,
  ctx: RunContext = { attempt: 0, maxAttempts: 0 },
): Promise<void> {
  const snap = await getSnapshot(id);
  if (!snap) {
    // Nicht (mehr) existierendes Assessment: permanenter No-op, kein Retry (anders als
    // Franz, das wirft) — ein Retry könnte den fehlenden Datensatz nie herstellen.
    log("bodo", "run-assessment: not found", { id });
    return;
  }

  if (snap.status === "ready" || snap.status === "failed" || snap.status === "cancelled") {
    log("bodo", "run-assessment: no-op (terminal)", { id, status: snap.status });
    return;
  }

  if (!(await deps.isAvailable(snap.orgId, "bodo"))) {
    await markCancelled(id, "coworker not available");
    return;
  }

  if (snap.status === "pending") {
    if (!(await claimForRun(id))) {
      log("bodo", "run-assessment: claim lost", { id });
      return;
    }
  }

  try {
    const geo = await deps.geocode(snap.address);
    if (!geo) {
      await markFailed(id, "Adresse konnte nicht geocodiert werden");
      return;
    }

    const region = resolveRegionProvider({ lat: geo.lat, lon: geo.lon });
    // Zweistufiger Bayern-Check: die bbox (resolveRegionProvider) ist der primäre Gate; das
    // Nominatim-`state`-Feld verfeinert NUR bei positivem Widerspruch (state gesetzt UND ≠
    // "Bayern"). `state == null` (Nominatim liefert kein Bundesland) wird bewusst NICHT
    // abgelehnt — sonst würden valide Bayern-Adressen ohne state-Feld fälschlich scheitern;
    // die bbox hat in dem Fall bereits bestätigt, dass der Punkt in Bayern liegt.
    if (!region || (geo.state != null && geo.state !== "Bayern")) {
      await markFailed(
        id,
        `Adresse außerhalb Bayern (${geo.state ?? "unbekannt"}); der MVP unterstützt nur bayerische Adressen.`,
      );
      return;
    }

    const profile = await deps.buildProfile(
      { lat: geo.lat, lon: geo.lon },
      snap.configSnapshot,
      { district: geo.district, plz: geo.plz },
    );

    await markReady(id, {
      profile: profile as unknown as Prisma.InputJsonValue,
      scores: {} as Prisma.InputJsonValue, // Scoring folgt in Plan 3
      narrative: null, // Narrative folgt in Plan 3
      lat: geo.lat,
      lon: geo.lon,
    });
  } catch (e) {
    if (ctx.attempt < ctx.maxAttempts) throw e;
    await markFailed(id, e instanceof Error ? e.message : "unbekannter Fehler");
  }
}
