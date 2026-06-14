/** Global per Env abgeschaltete Coworker (Notabschaltung), getrennt vom DB-Entitlement. */
export function disabledCoworkers(): ReadonlySet<string> {
  return new Set(
    (process.env.DISABLED_COWORKERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}
