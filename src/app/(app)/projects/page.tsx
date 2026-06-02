import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";
import { listProjects } from "@/server/projects/projects.service";
import { NewProjectForm } from "./new/new-project-form";

export default async function ProjectsPage() {
  const session = await requireSession();
  const projects = await listProjects(session.orgId);

  return (
    <main className="p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-cobalt">Projekte</h1>
      <section>
        <h2 className="text-lg font-medium mb-2">Neues Projekt</h2>
        <NewProjectForm />
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">Bestehende Projekte</h2>
        {projects.length === 0 ? (
          <p className="text-gray-500">Noch keine Projekte.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="text-cobalt underline">
                  {p.name}
                </Link>
                {p.address && <span className="text-gray-500"> — {p.address}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
