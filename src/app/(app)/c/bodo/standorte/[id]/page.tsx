import { notFound } from "next/navigation";
import { loadAssessment } from "./data";

export default async function AssessmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await loadAssessment(id);
  if (!a) notFound();
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-bold">{a.address}</h1>
      <p className="text-muted mt-1">Status: {a.status}</p>
      {a.status === "ready" && (
        <pre className="mt-6 text-xs bg-black/[0.03] rounded-lg p-4 overflow-auto">
          {JSON.stringify(a.profile, null, 2)}
        </pre>
      )}
      {(a.status === "failed" || a.status === "cancelled") && (
        <p className="text-red-600 mt-4">Fehler: {a.error}</p>
      )}
    </div>
  );
}
