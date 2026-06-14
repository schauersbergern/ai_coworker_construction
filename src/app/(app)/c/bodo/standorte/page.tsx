import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";
import { listAssessments } from "@/coworkers/bodo/server/assessment/assessment.service";
import { NewAssessmentForm } from "./new/new-assessment-form";

export default async function StandortePage() {
  const session = await requireSession();
  const items = await listAssessments(session.orgId);
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-extrabold mb-6">📍 Standorte</h1>
      <div className="mb-8"><NewAssessmentForm /></div>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/c/bodo/standorte/${a.id}`} className="card p-4 block hover:shadow-md">
              <span className="font-semibold">{a.address}</span>
              <span className="text-muted ml-2 text-sm">{a.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
