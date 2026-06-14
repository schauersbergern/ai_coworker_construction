import { notFound } from "next/navigation";
import { getResolvedCoworker, isAvailable } from "./resolve";
import type { ResolvedCoworker } from "./types";

/** Für Server Components / Layouts: 404 wenn nicht "available", sonst liefert es den Resolved. */
export async function requireAvailable(orgId: string, coworkerId: string): Promise<ResolvedCoworker> {
  const resolved = await getResolvedCoworker(orgId, coworkerId);
  if (!resolved || resolved.availability !== "available") notFound();
  return resolved;
}

export { isAvailable, getResolvedCoworker };
