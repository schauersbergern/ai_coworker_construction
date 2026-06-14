import { describe, expect, it } from "vitest";
import { deepMerge } from "./merge";

describe("deepMerge", () => {
  it("overrides scalar values", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 9 })).toEqual({ a: 1, b: 9 });
  });

  it("merges nested objects recursively", () => {
    expect(deepMerge({ x: { p: 1, q: 2 } }, { x: { q: 5 } })).toEqual({ x: { p: 1, q: 5 } });
  });

  it("keeps base when override key is absent", () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it("replaces arrays wholesale (no element merge)", () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] });
  });

  it("returns base unchanged when override is not a plain object", () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it("ignores __proto__ to prevent prototype pollution", () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = deepMerge<Record<string, unknown>>({ a: 1 }, malicious);
    expect(result).toEqual({ a: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
