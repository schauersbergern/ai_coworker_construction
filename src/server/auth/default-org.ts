import { prisma } from "@/server/db";

/**
 * Pilot-Modell: alle freigeschalteten Nutzer:innen teilen sich EINE Organisation
 * (passt zu „alle Org-Nutzer sehen alle Projekte"). Wird beim ersten Login per
 * createUser-Event zugeordnet. Fester ID-Wert → idempotent.
 */
export const DEFAULT_ORG_ID = "default-org";

export function getOrCreateDefaultOrg() {
  return prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    update: {},
    create: { id: DEFAULT_ORG_ID, name: process.env.ORG_NAME ?? "Pilot-Büro" },
  });
}
