import { z } from "zod";
import type { CoworkerManifest } from "../types";

export const miraManifest: CoworkerManifest<Record<string, never>> = {
  id: "mira",
  name: "Mira",
  role: "Angebote & Leistungen",
  emoji: "📐",
  blurb: "Erstellt Angebote und Leistungsbeschreibungen aus deinen Vorgaben.",
  lifecycle: "comingSoon",
  enabledByDefault: false,
  configSchema: z.object({}),
  defaultConfig: {},
  configVersion: 0,
  entryPath: "/c/mira",
};
