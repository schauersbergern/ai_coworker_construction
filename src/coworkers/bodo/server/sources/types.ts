export type SourceStatus = "ok" | "unavailable" | "error";
export type Confidence = "high" | "medium" | "low";

export interface DataPoint<T> {
  value: T | null;
  status: SourceStatus;
  reason?: string;
  source: string;
  license: string;
  retrievedAt: string;
  confidence: Confidence;
}

export function ok<T>(
  value: T,
  meta: { source: string; license: string; confidence: Confidence },
): DataPoint<T> {
  return { value, status: "ok", retrievedAt: new Date().toISOString(), ...meta };
}

export function unavailable<T>(meta: {
  source: string;
  license: string;
  reason: string;
  confidence?: Confidence;
}): DataPoint<T> {
  return {
    value: null,
    status: "unavailable",
    reason: meta.reason,
    source: meta.source,
    license: meta.license,
    confidence: meta.confidence ?? "low",
    retrievedAt: new Date().toISOString(),
  };
}

export function errored<T>(meta: {
  source: string;
  license: string;
  reason: string;
}): DataPoint<T> {
  return {
    value: null,
    status: "error",
    reason: meta.reason,
    source: meta.source,
    license: meta.license,
    confidence: "low",
    retrievedAt: new Date().toISOString(),
  };
}
