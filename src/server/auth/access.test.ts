import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allowedEmails, isEmailAllowed } from "./access";

const ORIG = process.env.ALLOWED_EMAILS;
afterEach(() => {
  process.env.ALLOWED_EMAILS = ORIG;
});

describe("access allowlist", () => {
  it("parses a comma-separated list, trimmed and lowercased", () => {
    process.env.ALLOWED_EMAILS = " A@x.com , b@Y.com ,, c@z.com ";
    expect(allowedEmails()).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });

  it("returns empty when unset", () => {
    delete process.env.ALLOWED_EMAILS;
    expect(allowedEmails()).toEqual([]);
  });

  describe("isEmailAllowed", () => {
    beforeEach(() => {
      process.env.ALLOWED_EMAILS = "ok@example.com,team@büro.de";
    });

    it("is true for a listed email (case-insensitive)", () => {
      expect(isEmailAllowed("OK@example.com")).toBe(true);
    });

    it("is false for an unlisted email", () => {
      expect(isEmailAllowed("fremd@example.com")).toBe(false);
    });

    it("is false for null/undefined/empty", () => {
      expect(isEmailAllowed(null)).toBe(false);
      expect(isEmailAllowed(undefined)).toBe(false);
      expect(isEmailAllowed("")).toBe(false);
    });
  });
});
