import { afterEach, describe, expect, it } from "vitest";
import "@/coworkers"; // registriert franz/mira/theo/bodo
import { resolveAvailability } from "@/coworkers/resolve";
import { getCoworker } from "@/coworkers/registry";

describe("franz endpoint gate inputs", () => {
  afterEach(() => {
    delete process.env.DISABLED_COWORKERS;
  });

  it("franz is notEntitled when the org row disables it", () => {
    const franz = getCoworker("franz")!;
    expect(resolveAvailability(franz, { enabled: false }, new Set())).toBe("notEntitled");
  });

  it("franz is killSwitched when env disables it", () => {
    const franz = getCoworker("franz")!;
    expect(resolveAvailability(franz, { enabled: true }, new Set(["franz"]))).toBe("killSwitched");
  });
});
