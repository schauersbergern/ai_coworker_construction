import { getAllCoworkers } from "./registry";

/** Startup-Sicherung: jeder Manifest-Default MUSS sein eigenes Schema erfüllen. */
export function validateRegisteredManifests(): void {
  for (const manifest of getAllCoworkers()) {
    const result = manifest.configSchema.safeParse(manifest.defaultConfig);
    if (!result.success) {
      throw new Error(
        `Coworker "${manifest.id}" defaultConfig violates its schema: ${result.error.message}`,
      );
    }
  }
}
