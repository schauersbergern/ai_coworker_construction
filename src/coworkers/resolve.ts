import { logError } from "@/server/log";
import { prisma } from "@/server/db";
import { deepMerge } from "./merge";
import { getAllCoworkers, getCoworker } from "./registry";
import { disabledCoworkers } from "./env";
import type { Availability, CoworkerManifest, ResolvedCoworker } from "./types";

type EntitlementRow = { enabled: boolean } | null;
type ConfigRow = { config: unknown; configVersion: number } | null;

/** Reihenfolge: lifecycle → kill-switch → entitlement (erste zutreffende Regel gewinnt). */
export function resolveAvailability(
  manifest: CoworkerManifest<unknown>,
  row: EntitlementRow,
  disabled: ReadonlySet<string>,
): Availability {
  if (manifest.lifecycle === "comingSoon") return "comingSoon";
  if (disabled.has(manifest.id)) return "killSwitched";
  const entitled = row ? row.enabled : manifest.enabledByDefault;
  return entitled ? "available" : "notEntitled";
}

/**
 * Migriert ältere Overrides, merged über Defaults und validiert. Bei ungültiger
 * Config: laut loggen und auf Defaults zurückfallen (Sicherung, kein stiller Normalzustand).
 */
export function resolveConfig<C>(
  manifest: CoworkerManifest<C>,
  row: ConfigRow,
  ctx?: { orgId: string },
): C {
  if (!row || row.config == null) return manifest.defaultConfig;

  let raw: unknown = row.config;
  for (let v = row.configVersion; v < manifest.configVersion; v++) {
    const migrate = manifest.configMigrations?.[v];
    if (migrate) raw = migrate(raw);
  }

  const merged = deepMerge(manifest.defaultConfig, raw);
  const parsed = manifest.configSchema.safeParse(merged);
  if (!parsed.success) {
    logError("coworker", "invalid tenant config, falling back to defaults", parsed.error, {
      coworker: manifest.id,
      orgId: ctx?.orgId,
    });
    return manifest.defaultConfig;
  }
  return parsed.data;
}

export async function getResolvedCoworkers(orgId: string): Promise<ResolvedCoworker[]> {
  const rows = await prisma.orgModule.findMany({ where: { orgId } });
  const byId = new Map(rows.map((r) => [r.coworkerId, r]));
  const disabled = disabledCoworkers();

  return getAllCoworkers().map((manifest) => {
    const row = byId.get(manifest.id) ?? null;
    const availability = resolveAvailability(manifest, row, disabled);
    const config = availability === "available" ? resolveConfig(manifest, row, { orgId }) : undefined;
    return { manifest, availability, config };
  });
}

export async function getResolvedCoworker(orgId: string, id: string): Promise<ResolvedCoworker | null> {
  const manifest = getCoworker(id);
  if (!manifest) return null;
  const row = await prisma.orgModule.findUnique({
    where: { orgId_coworkerId: { orgId, coworkerId: id } },
  });
  const availability = resolveAvailability(manifest, row, disabledCoworkers());
  const config = availability === "available" ? resolveConfig(manifest, row, { orgId }) : undefined;
  return { manifest, availability, config };
}

export async function isAvailable(orgId: string, id: string): Promise<boolean> {
  const resolved = await getResolvedCoworker(orgId, id);
  return !!resolved && resolved.availability === "available";
}
