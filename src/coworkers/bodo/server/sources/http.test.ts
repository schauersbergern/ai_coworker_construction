import { describe, it, expect, vi } from "vitest";
import { withTimeout, fetchJson } from "./http";

describe("http helpers", () => {
  it("withTimeout rejects after the limit", async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 50)), 10, "x")).rejects.toThrow(/timeout/);
  });
  it("fetchJson parses ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 })));
    expect(await fetchJson("https://x")).toEqual({ a: 1 });
  });
  it("fetchJson throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(fetchJson("https://x")).rejects.toThrow(/500/);
  });
});
