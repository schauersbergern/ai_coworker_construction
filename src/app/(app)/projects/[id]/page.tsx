import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProject(session.orgId, id);
  if (!project) notFound();

  return (
    <main className="p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-cobalt">{project.name}</h1>
      {project.address && <p className="text-gray-600">{project.address}</p>}
      <p className="text-gray-500">
        Erfassung (Sprachnotizen &amp; Fotos) und Export folgen in Plan 2 &amp; 3.
      </p>
    </main>
  );
}
