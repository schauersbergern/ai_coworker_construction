import { describe, expect, it } from "vitest";
import { FakeTranscriber } from "./transcriber";

describe("FakeTranscriber", () => {
  it("returns the configured transcript", async () => {
    const t = new FakeTranscriber("Riss in der Wand");
    expect(await t.transcribe("/tmp/whatever.webm")).toBe("Riss in der Wand");
  });
});
