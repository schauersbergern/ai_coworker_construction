import { describe, expect, it } from "vitest";
import { FakeDocGenerator } from "./doc-generator";

describe("FakeDocGenerator", () => {
  it("produces one finding per note, preserving noteId and transcript", async () => {
    const gen = new FakeDocGenerator();
    const out = await gen.generate({
      projectName: "Wohnbau",
      notes: [
        { id: "n1", transcript: "Riss in der Wand" },
        { id: "n2", transcript: "Feuchtigkeit im Keller" },
      ],
      systemPrompt: "Test-Prompt",
    });
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({ noteId: "n1", text: "Riss in der Wand" });
    expect(out.findings[1].noteId).toBe("n2");
  });
});
