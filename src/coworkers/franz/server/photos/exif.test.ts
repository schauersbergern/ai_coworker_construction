import { describe, expect, it } from "vitest";
import { extractTakenAt } from "./exif";

describe("extractTakenAt", () => {
  it("returns null for a buffer without EXIF", async () => {
    expect(await extractTakenAt(Buffer.from("not-an-image"))).toBeNull();
  });
});
