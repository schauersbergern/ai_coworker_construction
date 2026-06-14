import type { CoworkerManifest } from "../types";
import { franzConfigSchema, franzDefaultConfig, type FranzConfig } from "./config";

export const franzManifest: CoworkerManifest<FranzConfig> = {
  id: "franz",
  name: "Franz",
  role: "Baudokumentation",
  emoji: "👷",
  blurb:
    "Erfasst Mängel & Fortschritt per Sprachnotiz und Foto — und erstellt daraus auf Knopfdruck den fertigen PDF-Bericht.",
  lifecycle: "active",
  enabledByDefault: true,
  configSchema: franzConfigSchema,
  defaultConfig: franzDefaultConfig,
  configVersion: 0,
  entryPath: "/c/franz/projects",
};
