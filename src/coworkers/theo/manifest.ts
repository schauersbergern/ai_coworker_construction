import { z } from "zod";
import type { CoworkerManifest } from "../types";

export const theoManifest: CoworkerManifest<Record<string, never>> = {
  id: "theo",
  name: "Theo",
  role: "Bauzeit & Termine",
  emoji: "📅",
  blurb: "Plant Bauzeiten, behält Fristen und Wiedervorlagen im Blick.",
  lifecycle: "comingSoon",
  enabledByDefault: false,
  configSchema: z.object({}),
  defaultConfig: {},
  configVersion: 0,
  entryPath: "/c/theo",
};
