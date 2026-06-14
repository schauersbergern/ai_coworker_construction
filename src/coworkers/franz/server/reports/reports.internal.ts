import { prisma } from "@/server/db";
export { setReportResult, setReportStatus } from "./reports.service";

export function getReportById(reportId: string) {
  return prisma.report.findUnique({ where: { id: reportId } });
}

/** Lädt Projekt + Notizen (mit Transkript) + Fotos für die Generierung. */
export async function loadReportInputs(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const [notes, photos] = await Promise.all([
    prisma.note.findMany({ where: { projectId }, orderBy: { recordedAt: "asc" } }),
    prisma.photo.findMany({ where: { projectId } }),
  ]);
  return { project, notes, photos };
}

/** Anzeigename des/der Ersteller:in fürs PDF-Deckblatt (Name → E-Mail → undefined). */
export async function getCreatorLabel(createdById: string | null): Promise<string | undefined> {
  if (!createdById) return undefined;
  const u = await prisma.user.findUnique({
    where: { id: createdById },
    select: { name: true, email: true },
  });
  return u?.name ?? u?.email ?? undefined;
}
