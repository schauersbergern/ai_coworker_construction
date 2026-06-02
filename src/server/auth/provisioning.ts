import { prisma } from "@/server/db";

/**
 * Eine E-Mail ist provisioniert, wenn ein User existiert, der einer
 * Organisation zugeordnet ist. Nur solche Adressen dürfen einen Magic-Link
 * erhalten (Pilot: manuelles Provisionieren, kein Self-Service-Signup).
 */
export async function isProvisionedEmail(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { orgId: true },
  });
  return Boolean(user?.orgId);
}
