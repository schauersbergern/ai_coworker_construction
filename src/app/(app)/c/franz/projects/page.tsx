import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";
import { listProjects } from "@/server/projects/projects.service";
import { NewProjectForm } from "./new/new-project-form";

export default async function ProjectsPage() {
  const session = await requireSession();
  const projects = await listProjects(session.orgId);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10 flex flex-col gap-8">
      <header>
        <Link href="/" className="text-sm text-muted hover:text-cobalt">
          ← Mitarbeiter
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-cobalt/10 text-xl">👷</span>
          <div>
            <h1 className="text-2xl font-extrabold leading-none">Franz</h1>
            <p className="label-eyebrow mt-1 !text-muted">Baudokumentation</p>
          </div>
        </div>
      </header>

      <section className="card p-5">
        <h2 className="font-bold mb-3">Neues Projekt</h2>
        <NewProjectForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">Projekte</h2>
        {projects.length === 0 ? (
          <p className="text-muted text-sm">Noch keine Projekte — leg oben das erste an.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/c/franz/projects/${p.id}`}
                  className="card p-4 block hover:-translate-y-0.5 hover:shadow-md transition-transform"
                >
                  <span className="font-semibold">{p.name}</span>
                  {p.address && <span className="block text-sm text-muted mt-0.5">{p.address}</span>}
                  {p.projectNo && (
                    <span className="block text-xs text-muted/80 font-mono mt-1">
                      Nr. {p.projectNo}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
