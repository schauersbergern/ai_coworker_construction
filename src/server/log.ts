/**
 * Minimaler strukturierter Logger (stdout/stderr → `docker compose logs app`).
 * Format: [ISO-Zeit] [scope] message {json-context}
 */
export function log(scope: string, message: string, ctx?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [${scope}] ${message}`;
  if (ctx) console.log(line, JSON.stringify(ctx));
  else console.log(line);
}

export function logError(scope: string, message: string, err: unknown, ctx?: Record<string, unknown>) {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const prefix = `[${new Date().toISOString()}] [${scope}] ${message}`;
  if (ctx) console.error(prefix, JSON.stringify(ctx), "\n", detail);
  else console.error(prefix, "\n", detail);
}
