import { describe, it, expect } from "vitest";
import { unavailable, ok, errored } from "./types";

describe("DataPoint helpers", () => {
  it("ok() builds an ok data point", () => {
    const dp = ok(42, { source: "X", license: "CC BY 4.0", confidence: "high" });
    expect(dp.status).toBe("ok");
    expect(dp.value).toBe(42);
    expect(dp.retrievedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
  it("unavailable() builds an unavailable data point with reason", () => {
    const dp = unavailable<number>({ source: "Y", license: "-", reason: "nicht per API abrufbar" });
    expect(dp.status).toBe("unavailable");
    expect(dp.value).toBeNull();
    expect(dp.reason).toBe("nicht per API abrufbar");
  });
  it("errored() builds an error data point with low confidence", () => {
    const dp = errored<number>({ source: "Z", license: "CC BY 4.0", reason: "timeout" });
    expect(dp.status).toBe("error");
    expect(dp.value).toBeNull();
    expect(dp.confidence).toBe("low");
  });
});
