import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/server/db";

export type AppSession = { userId: string; orgId: string; email: string };

/**
 * Liefert die aktive Session inkl. Org. Redirect auf /login wenn nicht
 * eingeloggt, auf /no-org wenn keiner Organisation zugeordnet.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, orgId: true, email: true },
  });
  if (!user) redirect("/login");
  if (!user.orgId) redirect("/no-org");

  return { userId: user.id, orgId: user.orgId, email: user.email };
}
