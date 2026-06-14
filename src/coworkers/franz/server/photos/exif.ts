import exifr from "exifr";

/** Liest DateTimeOriginal aus EXIF; null, wenn nicht vorhanden/parsebar. */
export async function extractTakenAt(buffer: Buffer): Promise<Date | null> {
  try {
    const data = await exifr.parse(buffer, ["DateTimeOriginal"]);
    const v = data?.DateTimeOriginal;
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    return null;
  } catch {
    return null;
  }
}
