import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { CoworkerManifest } from "./types";
import { resolveAvailability, resolveConfig } from "./resolve";

type Cfg = { docgen: { systemPrompt: string }; labels: { a: string } };

function manifest(over: Partial<CoworkerManifest<Cfg>> = {}): CoworkerManifest<Cfg> {
  return {
    id: "franz",
    name: "Franz",
    role: "r",
    emoji: "👷",
    blurb: "b",
    lifecycle: "active",
    enabledByDefault: true,
    configSchema: z.object({
      docgen: z.object({ systemPrompt: z.string().min(1) }),
      labels: z.object({ a: z.string().min(1) }),
    }),
    defaultConfig: { docgen: { systemPrompt: "default" }, labels: { a: "Notizen" } },
    configVersion: 0,
    entryPath: "/c/franz",
    ...over,
  };
}

describe("resolveAvailability", () => {
  const empty = new Set<string>();

  it("comingSoon wins even if a DB row enables it", () => {
    const m = manifest({ lifecycle: "comingSoon" });
    expect(resolveAvailability(m, { enabled: true }, empty)).toBe("comingSoon");
  });

  it("kill-switch wins over entitlement", () => {
    expect(resolveAvailability(manifest(), { enabled: true }, new Set(["franz"]))).toBe("killSwitched");
  });

  it("available when entitled via row", () => {
    expect(resolveAvailability(manifest(), { enabled: true }, empty)).toBe("available");
  });

  it("notEntitled when row disables it", () => {
    expect(resolveAvailability(manifest(), { enabled: false }, empty)).toBe("notEntitled");
  });

  it("falls back to enabledByDefault when no row exists", () => {
    expect(resolveAvailability(manifest({ enabledByDefault: false }), null, empty)).toBe("notEntitled");
    expect(resolveAvailability(manifest({ enabledByDefault: true }), null, empty)).toBe("available");
  });
});

describe("resolveConfig", () => {
  it("returns defaults when no row/config", () => {
    expect(resolveConfig(manifest(), null)).toEqual(manifest().defaultConfig);
  });

  it("deep-merges a partial override over defaults", () => {
    const row = { config: { labels: { a: "Sprachnotizen" } }, configVersion: 0 };
    expect(resolveConfig(manifest(), row).labels.a).toBe("Sprachnotizen");
    expect(resolveConfig(manifest(), row).docgen.systemPrompt).toBe("default");
  });

  it("applies migrations before merge/validate", () => {
    const m = manifest({
      configVersion: 1,
      configMigrations: { 0: (old) => ({ ...(old as object), labels: { a: "migriert" } }) },
    });
    const row = { config: { docgen: { systemPrompt: "p" } }, configVersion: 0 };
    expect(resolveConfig(m, row).labels.a).toBe("migriert");
  });

  it("falls back to defaults and logs on invalid config", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const row = { config: { labels: { a: 123 } }, configVersion: 0 };
    expect(resolveConfig(manifest(), row, { orgId: "o1" })).toEqual(manifest().defaultConfig);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
