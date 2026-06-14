import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { CoworkerManifest } from "./types";
import { clearRegistry, registerCoworker } from "./registry";
import { validateRegisteredManifests } from "./validate";

function m(id: string, defaultConfig: unknown): CoworkerManifest<unknown> {
  return {
    id,
    name: id,
    role: "r",
    emoji: "🤖",
    blurb: "b",
    lifecycle: "active",
    enabledByDefault: true,
    configSchema: z.object({ v: z.string() }),
    defaultConfig,
    configVersion: 0,
    entryPath: `/c/${id}`,
  };
}

afterEach(() => clearRegistry());

describe("validateRegisteredManifests", () => {
  it("passes when all defaults satisfy their schema", () => {
    registerCoworker(m("a", { v: "ok" }));
    expect(() => validateRegisteredManifests()).not.toThrow();
  });

  it("throws when a default violates its own schema", () => {
    registerCoworker(m("b", { v: 123 }));
    expect(() => validateRegisteredManifests()).toThrow(/defaultConfig/);
  });
});
