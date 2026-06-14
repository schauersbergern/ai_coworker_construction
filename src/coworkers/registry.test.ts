import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { CoworkerManifest } from "./types";
import { clearRegistry, getAllCoworkers, getCoworker, registerCoworker } from "./registry";

function fakeManifest(id: string): CoworkerManifest<{ v: string }> {
  return {
    id,
    name: id,
    role: "r",
    emoji: "🤖",
    blurb: "b",
    lifecycle: "active",
    enabledByDefault: true,
    configSchema: z.object({ v: z.string() }),
    defaultConfig: { v: "x" },
    configVersion: 0,
    entryPath: `/c/${id}`,
  };
}

afterEach(() => clearRegistry());

describe("registry", () => {
  it("registers and retrieves by id", () => {
    registerCoworker(fakeManifest("a"));
    expect(getCoworker("a")?.id).toBe("a");
  });

  it("lists all registered manifests", () => {
    registerCoworker(fakeManifest("a"));
    registerCoworker(fakeManifest("b"));
    expect(getAllCoworkers().map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("throws on duplicate id", () => {
    registerCoworker(fakeManifest("a"));
    expect(() => registerCoworker(fakeManifest("a"))).toThrow(/already registered/);
  });

  it("returns undefined for unknown id", () => {
    expect(getCoworker("nope")).toBeUndefined();
  });
});
