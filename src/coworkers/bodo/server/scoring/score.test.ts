import { describe, it, expect } from "vitest";
import { computeScores } from "./score";
import { ok, unavailable } from "../sources/types";
import type { LocationProfile } from "../pipeline/profile";

const weights = { nahversorgung: 1, oepnv: 1, schulen: 1, gruen: 1, walkability: 1, kaufkraft: 1, gastroKultur: 1 };

function profile(fields: Record<string, unknown>) {
  return { coordinate: { lat: 48, lon: 11 }, district: ok("X", { source: "", license: "", confidence: "high" }),
    plz: ok("1", { source: "", license: "", confidence: "high" }), elevation: ok(550, { source: "", license: "", confidence: "high" }),
    fields } as LocationProfile;
}

describe("computeScores", () => {
  it("returns ampel/score/zielgruppen for a populated profile", () => {
    const p = profile({
      pois: ok({ supermarket: { count: 2, nearestM: 300 }, pharmacy: { count: 1, nearestM: 377 }, school: { count: 3, nearestM: 200 }, park: { count: 0, nearestM: null }, restaurant: { count: 1, nearestM: 48 } }, { source: "", license: "", confidence: "medium" }),
      transit: ok({ nearest: { name: "Kiefernstr.", distanceM: 341 } }, { source: "", license: "", confidence: "high" }),
      hochwasser: ok({ hqHaeufig: false, hq100: false, hqExtrem: false }, { source: "", license: "", confidence: "high" }),
    });
    const s = computeScores(p, { weights });
    expect(["gruen", "gelb", "rot"]).toContain(s.ampel);
    expect(s.vermarktungsScore).toBeGreaterThanOrEqual(0);
    expect(s.vermarktungsScore).toBeLessThanOrEqual(100);
    expect(s.zielgruppen.length).toBeGreaterThan(0);
    expect(s.primaereZielgruppe).toBeTruthy();
    expect(s.dataSufficient).toBe(true);
  });

  it("flags insufficient data (ampel 'unbekannt') when the core inputs are all unavailable", () => {
    const p = profile({
      pois: unavailable({ source: "", license: "", reason: "x" }),
      transit: unavailable({ source: "", license: "", reason: "x" }),
    });
    const s = computeScores(p, { weights });
    expect(s.vermarktungsScore).toBeGreaterThanOrEqual(0); // läuft nicht in einen Crash
    expect(s.dataSufficient).toBe(false);
    expect(s.ampel).toBe("unbekannt"); // KEIN scheinbar belastbares Gelb
    expect(s.investitionsSignal.label).toBe("Unzureichende Datenlage");
    expect(s.dataCoverage.available).toBe(0);
  });

  it("treats data as sufficient when at least POIs are present (transit may be out of coverage)", () => {
    const p = profile({
      pois: ok({ supermarket: { count: 1, nearestM: 400 } }, { source: "", license: "", confidence: "medium" }),
      transit: unavailable({ source: "", license: "", reason: "außerhalb Abdeckung" }),
    });
    const s = computeScores(p, { weights });
    expect(s.dataSufficient).toBe(true);
    expect(s.ampel).not.toBe("unbekannt");
  });

  it("forces a red Ampel and lowers the signal in a HQ100 flood zone", () => {
    const strongPois = ok(
      { supermarket: { count: 3, nearestM: 150 }, pharmacy: { count: 2, nearestM: 100 }, school: { count: 4, nearestM: 120 }, park: { count: 2, nearestM: 80 }, restaurant: { count: 5, nearestM: 40 } },
      { source: "", license: "", confidence: "medium" },
    );
    const p = profile({
      pois: strongPois,
      transit: ok({ nearest: { distanceM: 120 } }, { source: "", license: "", confidence: "high" }),
      hochwasser: ok({ hqHaeufig: false, hq100: true, hqExtrem: true }, { source: "", license: "", confidence: "high" }),
    });
    const s = computeScores(p, { weights });
    expect(s.ampel).toBe("rot");
    expect(s.investitionsSignal.risiken).toContain("Hochwassergefahr (HQ100/häufig)");
    expect(s.investitionsSignal.score).toBeLessThan(s.vermarktungsScore);
  });

  it("demotes a green Ampel to gelb on a medium risk (no hard risk)", () => {
    const strongPois = ok(
      { supermarket: { count: 3, nearestM: 150 }, pharmacy: { count: 2, nearestM: 100 }, school: { count: 4, nearestM: 120 }, park: { count: 2, nearestM: 80 }, restaurant: { count: 5, nearestM: 40 } },
      { source: "", license: "", confidence: "medium" },
    );
    const p = profile({
      pois: strongPois,
      transit: ok({ nearest: { distanceM: 120 } }, { source: "", license: "", confidence: "high" }),
      // Denkmalschutz = severity 2 (kein hartes Risiko) → bremst grün auf gelb.
      denkmal: ok({ einzeldenkmal: true, ensemble: false, bodendenkmal: false }, { source: "", license: "", confidence: "high" }),
    });
    const s = computeScores(p, { weights });
    expect(s.vermarktungsScore).toBeGreaterThanOrEqual(66); // Basis wäre grün
    expect(s.ampel).toBe("gelb");
    expect(s.investitionsSignal.risiken).toContain("Denkmalschutz (Einzel/Ensemble)");
  });

  it("never goes green/positive when the hard-risk sources (flood+nature) are unknown", () => {
    const strongPois = ok(
      { supermarket: { count: 3, nearestM: 150 }, pharmacy: { count: 2, nearestM: 100 }, school: { count: 4, nearestM: 120 }, park: { count: 2, nearestM: 80 }, restaurant: { count: 5, nearestM: 40 } },
      { source: "", license: "", confidence: "medium" },
    );
    const p = profile({
      pois: strongPois,
      transit: ok({ nearest: { distanceM: 120 } }, { source: "", license: "", confidence: "high" }),
      // alle Risikoquellen (hochwasser/natur/geologie/denkmal) fehlen
    });
    const s = computeScores(p, { weights });
    expect(s.vermarktungsScore).toBeGreaterThanOrEqual(66); // Basis wäre grün
    expect(s.dataSufficient).toBe(true);
    expect(s.ampel).not.toBe("gruen"); // ohne harte Risikodaten kein Grün
    expect(s.investitionsSignal.label).not.toBe("Positives Signal");
    expect(s.investitionsSignal.risiken).toContain("Risikolage unvollständig geprüft (Quellen nicht verfügbar)");
  });
});
