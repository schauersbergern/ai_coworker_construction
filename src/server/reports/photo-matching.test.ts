import { describe, expect, it } from "vitest";
import { matchPhotosToNotes } from "./photo-matching";

const t = (iso: string) => new Date(iso);

describe("matchPhotosToNotes", () => {
  const notes = [
    { id: "n1", recordedAt: t("2026-06-01T09:00:00Z") },
    { id: "n2", recordedAt: t("2026-06-01T09:10:00Z") },
  ];

  it("matches a photo to the nearest note within the window", () => {
    const r = matchPhotosToNotes(notes, [{ id: "p1", effectiveTime: t("2026-06-01T09:01:00Z") }]);
    expect(r.byNote.get("n1")).toEqual(["p1"]);
    expect(r.unmatched).toEqual([]);
  });

  it("puts a photo outside the ±2min window into unmatched", () => {
    const r = matchPhotosToNotes(notes, [{ id: "p1", effectiveTime: t("2026-06-01T09:05:00Z") }]);
    expect(r.unmatched).toEqual(["p1"]);
    expect([...r.byNote.values()].flat()).toEqual([]);
  });

  it("assigns to the nearest of two candidate notes", () => {
    const r = matchPhotosToNotes(notes, [{ id: "p1", effectiveTime: t("2026-06-01T09:09:00Z") }]);
    expect(r.byNote.get("n2")).toEqual(["p1"]);
  });

  it("treats an ambiguous tie as unmatched (→ appendix, per spec)", () => {
    const tied = [
      { id: "a", recordedAt: t("2026-06-01T09:00:00Z") },
      { id: "b", recordedAt: t("2026-06-01T09:02:00Z") },
    ];
    const r = matchPhotosToNotes(tied, [{ id: "p", effectiveTime: t("2026-06-01T09:01:00Z") }]);
    expect(r.unmatched).toEqual(["p"]);
    expect([...r.byNote.values()].flat()).toEqual([]);
  });

  it("returns all photos unmatched when there are no notes", () => {
    const r = matchPhotosToNotes([], [{ id: "p1", effectiveTime: t("2026-06-01T09:00:00Z") }]);
    expect(r.unmatched).toEqual(["p1"]);
  });
});
