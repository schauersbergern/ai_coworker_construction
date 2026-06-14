"use server";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/require-session";
import { getResolvedCoworker } from "@/coworkers";
import { createAssessment } from "@/coworkers/bodo/server/assessment/assessment.service";
import { failIfNotTerminal } from "@/coworkers/bodo/server/assessment/assessment.internal";
import { inngest } from "@/inngest/client";
import { logError } from "@/server/log";

export type CreateAssessmentState = { error?: string };

export async function createAssessmentAction(
  _prev: CreateAssessmentState,
  formData: FormData,
): Promise<CreateAssessmentState> {
  const session = await requireSession();

  // Günstige Eingabevalidierung zuerst — kein DB-Round-Trip bei leerem Formular (wie Franz).
  const address = String(formData.get("address") ?? "").trim();
  if (!address) return { error: "Bitte eine Adresse eingeben." };

  const resolved = await getResolvedCoworker(session.orgId, "bodo");
  if (!resolved || resolved.availability !== "available" || !resolved.config) {
    throw new Error("Coworker nicht verfügbar");
  }

  const a = await createAssessment(session.orgId, address, {
    snapshot: resolved.config as Prisma.InputJsonValue,
    version: resolved.manifest.configVersion,
  });

  // Enqueue separat absichern: schlägt inngest.send fehl, darf das Assessment nicht ewig
  // in pending hängen. redirect() MUSS außerhalb des try stehen (wirft intern NEXT_REDIRECT).
  try {
    await inngest.send({ name: "assessment/requested", data: { assessmentId: a.id } });
  } catch (err) {
    await failIfNotTerminal(a.id, "Job konnte nicht eingereiht werden");
    logError("bodo", "assessment/requested enqueue failed", err, { assessmentId: a.id });
    return { error: "Analyse konnte nicht gestartet werden. Bitte erneut versuchen." };
  }

  revalidatePath("/c/bodo/standorte"); // Liste nach Anlage nicht aus dem Cache stale zeigen
  redirect(`/c/bodo/standorte/${a.id}`);
}
