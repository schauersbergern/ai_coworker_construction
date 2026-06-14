import { requireSession } from "@/server/auth/require-session";
import { requireAvailable } from "@/coworkers";

export default async function FranzLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  // 404, wenn Franz für diese Org nicht verfügbar ist (UX-Gate; APIs gaten separat).
  await requireAvailable(session.orgId, "franz");
  return <>{children}</>;
}
