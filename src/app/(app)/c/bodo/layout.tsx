import { requireSession } from "@/server/auth/require-session";
import { requireAvailable } from "@/coworkers";

export default async function BodoLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  await requireAvailable(session.orgId, "bodo");
  return <>{children}</>;
}
