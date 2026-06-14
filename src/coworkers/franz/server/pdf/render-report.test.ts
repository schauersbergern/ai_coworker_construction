import { describe, expect, it } from "vitest";
import { renderReportPdf } from "./render-report";

describe("renderReportPdf", () => {
  it("produces a non-empty PDF buffer", async () => {
    const buf = await renderReportPdf({
      projectName: "Wohnbau Lindengasse",
      dateLabel: "01.06.2026",
      findings: [
        { index: 1, title: "Riss in Trockenbauwand", location: "EG", text: "Vertikaler Riss …", photos: [] },
      ],
      appendixPhotos: [],
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
