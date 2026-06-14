export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Tiefes Mergen von Plain-Objects: override gewinnt, verschachtelte Objekte werden
 * rekursiv gemergt, Arrays und Skalare werden ersetzt (nicht gemergt). Ist eine Seite
 * kein Plain-Object, gewinnt override (außer override ist undefined → base bleibt).
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined || override === null ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}
