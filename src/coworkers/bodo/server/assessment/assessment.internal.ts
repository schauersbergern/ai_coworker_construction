import { prisma } from "@/server/db";
import type { Prisma } from "@prisma/client";

/** Atomar pending -> running. true, wenn dieser Aufruf den Übergang gewonnen hat. */
export async function claimForRun(id: string): Promise<boolean> {
  const res = await prisma.assessment.updateMany({
    where: { id, status: "pending" },
    data: { status: "running" },
  });
  return res.count === 1;
}

export async function markReady(
  id: string,
  data: {
    profile: Prisma.InputJsonValue;
    scores: Prisma.InputJsonValue;
    narrative: string | null;
    lat: number;
    lon: number;
  },
) {
  await prisma.assessment.update({ where: { id }, data: { ...data, status: "ready", error: null } });
}

export async function markFailed(id: string, error: string) {
  await prisma.assessment.update({ where: { id }, data: { status: "failed", error } });
}

export async function markCancelled(id: string, reason: string) {
  await prisma.assessment.update({ where: { id }, data: { status: "cancelled", error: reason } });
}

/**
 * Setzt einen NICHT-terminalen Datensatz (pending|running) auf failed. Für den
 * Inngest-onFailure-Pfad (harter Crash/Timeout, bei dem der Job-Catch nie lief) — verhindert
 * ein dauerhaft in `running` hängendes Assessment. Bedingt (updateMany), damit ein bereits
 * `ready`/`cancelled` gewordener Datensatz nicht überschrieben wird.
 */
export async function failIfNotTerminal(id: string, error: string) {
  await prisma.assessment.updateMany({
    where: { id, status: { in: ["pending", "running"] } },
    data: { status: "failed", error },
  });
}

export async function getSnapshot(id: string) {
  return prisma.assessment.findUnique({
    where: { id },
    select: { orgId: true, address: true, status: true, configSnapshot: true, configVersion: true },
  });
}
