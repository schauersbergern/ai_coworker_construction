import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock the Prisma singleton BEFORE importing resolve.
const findUnique = vi.fn();
const findMany = vi.fn();
vi.mock("@/server/db", () => ({
  prisma: { orgModule: { findUnique: (...a: unknown[]) => findUnique(...a), findMany: (...a: unknown[]) => findMany(...a) } },
}));

import type { CoworkerManifest } from "./types";
import { clearRegistry, registerCoworker } from "./registry";
import { getResolvedCoworker, getResolvedCoworkers, isAvailable } from "./resolve";

function manifest(over: Partial<CoworkerManifest<{ v: string }>> & { id: string }): CoworkerManifest<{ v: string }> {
  return {
    name: over.id,
    role: "r",
    emoji: "🤖",
    blurb: "b",
    lifecycle: "active",
    enabledByDefault: true,
    configSchema: z.object({ v: z.string() }),
    defaultConfig: { v: "default" },
    configVersion: 0,
    entryPath: `/c/${over.id}`,
    ...over,
  };
}

const ORIG = process.env.DISABLED_COWORKERS;
beforeEach(() => {
  clearRegistry();
  findUnique.mockReset();
  findMany.mockReset();
  delete process.env.DISABLED_COWORKERS;
});
afterEach(() => {
  process.env.DISABLED_COWORKERS = ORIG;
  clearRegistry();
});

describe("getResolvedCoworker (wiring)", () => {
  it("returns null for an unknown coworker without hitting the DB", async () => {
    const result = await getResolvedCoworker("o1", "ghost");
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("comingSoon stays not-available even with an enabling DB row", async () => {
    registerCoworker(manifest({ id: "mira", lifecycle: "comingSoon", enabledByDefault: false }));
    findUnique.mockResolvedValue({ enabled: true, config: null, configVersion: 0 });
    const result = await getResolvedCoworker("o1", "mira");
    expect(result?.availability).toBe("comingSoon");
    expect(result?.config).toBeUndefined();
  });

  it("entitled row → available with resolved config", async () => {
    registerCoworker(manifest({ id: "franz" }));
    findUnique.mockResolvedValue({ enabled: true, config: { v: "tenant" }, configVersion: 0 });
    const result = await getResolvedCoworker("o1", "franz");
    expect(result?.availability).toBe("available");
    expect((result?.config as { v: string }).v).toBe("tenant");
  });

  it("no row → falls back to enabledByDefault", async () => {
    registerCoworker(manifest({ id: "franz", enabledByDefault: false }));
    findUnique.mockResolvedValue(null);
    expect((await getResolvedCoworker("o1", "franz"))?.availability).toBe("notEntitled");
  });
});

describe("isAvailable (wiring)", () => {
  it("false when kill-switched even if entitled", async () => {
    registerCoworker(manifest({ id: "franz" }));
    process.env.DISABLED_COWORKERS = "franz";
    findUnique.mockResolvedValue({ enabled: true, config: null, configVersion: 0 });
    expect(await isAvailable("o1", "franz")).toBe(false);
  });

  it("true when entitled and not kill-switched", async () => {
    registerCoworker(manifest({ id: "franz" }));
    findUnique.mockResolvedValue({ enabled: true, config: null, configVersion: 0 });
    expect(await isAvailable("o1", "franz")).toBe(true);
  });
});

describe("getResolvedCoworkers (wiring)", () => {
  it("maps every registered manifest, joining the org's rows by id", async () => {
    registerCoworker(manifest({ id: "franz" }));
    registerCoworker(manifest({ id: "mira", lifecycle: "comingSoon", enabledByDefault: false }));
    findMany.mockResolvedValue([{ coworkerId: "franz", enabled: true, config: null, configVersion: 0 }]);
    const all = await getResolvedCoworkers("o1");
    const byId = Object.fromEntries(all.map((r) => [r.manifest.id, r.availability]));
    expect(byId).toEqual({ franz: "available", mira: "comingSoon" });
  });
});
