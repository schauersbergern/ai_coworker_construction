import { describe, expect, it } from "vitest";
import { enforceFindingsContract } from "./enforce-contract";
import type { ReportContent } from "@/server/reports/report-content";

const finding = (noteId: string): ReportContent["findings"][number] => ({
  noteId,
  title: `T-${noteId}`,
  text: `Text ${noteId}`,
});

describe("enforceFindingsContract", () => {
  it("accepts one finding per note and reorders to input order", () => {
    const content: ReportContent = { intro: "x", findings: [finding("n2"), finding("n1")] };
    const out = enforceFindingsContract(content, ["n1", "n2"]);
    expect(out.findings.map((f) => f.noteId)).toEqual(["n1", "n2"]); // reordered
    expect(out.intro).toBe("x");
  });

  it("throws when a note is missing", () => {
    const content: ReportContent = { findings: [finding("n1")] };
    expect(() => enforceFindingsContract(content, ["n1", "n2"])).toThrow();
  });

  it("throws on a duplicate noteId", () => {
    const content: ReportContent = { findings: [finding("n1"), finding("n1")] };
    expect(() => enforceFindingsContract(content, ["n1", "n2"])).toThrow();
  });

  it("throws on a foreign noteId not in the input", () => {
    const content: ReportContent = { findings: [finding("n1"), finding("fremd")] };
    expect(() => enforceFindingsContract(content, ["n1", "n2"])).toThrow();
  });

  it("throws when there are extra findings", () => {
    const content: ReportContent = { findings: [finding("n1"), finding("n2"), finding("n3")] };
    expect(() => enforceFindingsContract(content, ["n1", "n2"])).toThrow();
  });
});
