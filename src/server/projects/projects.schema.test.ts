import { describe, expect, it } from "vitest";
import { createProjectSchema } from "./projects.schema";

describe("createProjectSchema", () => {
  it("accepts a valid name and trims it", () => {
    const r = createProjectSchema.parse({ name: "  Wohnbau  " });
    expect(r.name).toBe("Wohnbau");
  });

  it("rejects an empty name", () => {
    expect(() => createProjectSchema.parse({ name: "   " })).toThrow();
  });

  it("passes optional fields through", () => {
    const r = createProjectSchema.parse({ name: "X", address: "Gasse 1", projectNo: "2026-014" });
    expect(r.address).toBe("Gasse 1");
    expect(r.projectNo).toBe("2026-014");
  });
});
