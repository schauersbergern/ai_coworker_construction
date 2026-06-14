import type { CoworkerManifest } from "./types";

const registry = new Map<string, CoworkerManifest<unknown>>();

export function registerCoworker<C>(manifest: CoworkerManifest<C>): void {
  if (registry.has(manifest.id)) {
    throw new Error(`Coworker "${manifest.id}" already registered`);
  }
  registry.set(manifest.id, manifest as CoworkerManifest<unknown>);
}

export function getCoworker(id: string): CoworkerManifest<unknown> | undefined {
  return registry.get(id);
}

export function getAllCoworkers(): CoworkerManifest<unknown>[] {
  return [...registry.values()];
}

/** Nur für Tests: leert die Registry. */
export function clearRegistry(): void {
  registry.clear();
}
