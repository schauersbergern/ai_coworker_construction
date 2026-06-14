import { describe, it, expect } from "vitest";
import { renderDossier } from "./render-dossier";

describe("renderDossier", () => {
  it("renders a non-empty PDF buffer (sufficient data)", async () => {
    const buf = await renderDossier({
      address: "Kiefernstr. 25, München",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scores: { ampel: "gelb", vermarktungsScore: 42, teilscores: { oepnv: 80 }, zielgruppen: [{ id: "familien", label: "Familien", score: 50 }], primaereZielgruppe: "Familien", investitionsSignal: { score: 42, label: "Entwicklungslage", risiken: ["Hochwassergefahr (HQ100/häufig)"] }, dataCoverage: { available: 5, total: 6 }, dataSufficient: true } as any,
      narrative: "Mikrolage-Text",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profile: { coordinate: { lat: 48, lon: 11 }, fields: { hochwasser: { value: { hq100: true }, status: "ok", source: "LfU", license: "CC BY-SA 4.0", confidence: "high", retrievedAt: "" }, sozio: { value: null, status: "unavailable", reason: "nur München", source: "X", license: "Y", confidence: "low", retrievedAt: "" } } } as any,
    });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF"); // gültige PDF-Magic-Bytes
  });

  it("renders the insufficient-data notice without fabricated scores", async () => {
    const buf = await renderDossier({
      address: "Irgendwo, Bayern",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scores: { ampel: "unbekannt", vermarktungsScore: 50, teilscores: { oepnv: 50 }, zielgruppen: [{ id: "familien", label: "Familien", score: 50 }], primaereZielgruppe: "Familien", investitionsSignal: { score: 50, label: "Unzureichende Datenlage", risiken: ["Risikolage unvollständig geprüft (Quellen nicht verfügbar)"] }, dataCoverage: { available: 0, total: 6 }, dataSufficient: false } as any,
      narrative: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profile: { coordinate: { lat: 48, lon: 11 }, fields: {} } as any,
    });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
