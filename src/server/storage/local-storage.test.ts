import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorage } from "./local-storage";

let dir: string;
let storage: LocalStorage;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "baudoku-store-"));
  storage = new LocalStorage(dir);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("puts and reads back an object with content type", async () => {
    await storage.put("projects/p1/notes/n1.webm", Buffer.from("audio-bytes"), "audio/webm");
    expect(await storage.exists("projects/p1/notes/n1.webm")).toBe(true);
    expect((await storage.read("projects/p1/notes/n1.webm")).toString()).toBe("audio-bytes");
    expect(await storage.contentType("projects/p1/notes/n1.webm")).toBe("audio/webm");
  });

  it("returns false for a missing object", async () => {
    expect(await storage.exists("projects/p1/photos/missing.jpg")).toBe(false);
  });

  it("rejects path-traversal keys", async () => {
    await expect(storage.put("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow();
    await expect(storage.read("/etc/passwd")).rejects.toThrow();
  });

  it("deletes an object and its content-type sidecar", async () => {
    await storage.put("projects/p1/photos/x.jpg", Buffer.from("img"), "image/jpeg");
    await storage.delete("projects/p1/photos/x.jpg");
    expect(await storage.exists("projects/p1/photos/x.jpg")).toBe(false);
    expect(await storage.contentType("projects/p1/photos/x.jpg")).toBe("application/octet-stream");
  });

  it("delete is a no-op for a missing object", async () => {
    await expect(storage.delete("projects/p1/photos/missing.jpg")).resolves.toBeUndefined();
  });

  it("rejects path-traversal keys on delete", async () => {
    await expect(storage.delete("../escape.txt")).rejects.toThrow();
  });
});
