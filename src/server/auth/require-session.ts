import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { isEmailAllowed } from "@/server/auth/access";

export type AppSession = { userId: string; orgId: string; email: string };

/**
 * Liefert die aktive Session inkl. Org. Redirect auf /login wenn nicht eingeloggt
 * oder nicht (mehr) in der Allowlist, auf /no-org wenn keiner Organisation zugeordnet.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // Allowlist bei JEDEM Request prüfen — Entfernen aus ALLOWED_EMAILS entzieht den
  // Zugriff sofort, auch bei noch bestehender DB-Session (nur Sign-in zu prüfen reicht nicht).
  if (!isEmailAllowed(session.user.email)) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, orgId: true, email: true },
  });
  if (!user) redirect("/login");
  if (!user.orgId) redirect("/no-org");

  return { userId: user.id, orgId: user.orgId, email: user.email };
}
