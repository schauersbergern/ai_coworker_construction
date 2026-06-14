import { afterEach, describe, expect, it } from "vitest";
import { disabledCoworkers } from "./env";

const ORIG = process.env.DISABLED_COWORKERS;
afterEach(() => {
  process.env.DISABLED_COWORKERS = ORIG;
});

describe("disabledCoworkers", () => {
  it("parses a comma-separated, trimmed list", () => {
    process.env.DISABLED_COWORKERS = " franz , mira ";
    expect([...disabledCoworkers()].sort()).toEqual(["franz", "mira"]);
  });

  it("is empty when unset", () => {
    delete process.env.DISABLED_COWORKERS;
    expect(disabledCoworkers().size).toBe(0);
  });
});
