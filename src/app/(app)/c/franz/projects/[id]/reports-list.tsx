"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ReportView = {
  id: string;
  label: string;
  status: "pending" | "done" | "failed" | "cancelled";
  pdfKey: string | null;
  generatedAt: string;
};

export function ReportsList({ projectId, reports }: { projectId: string; reports: ReportView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const anyPending = reports.some((r) => r.status === "pending");

  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [anyPending, router]);

  async function retry(reportId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reports/${reportId}/retry`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erneuter Export fehlgeschlagen");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erneuter Export fehlgeschlagen");
    }
  }

  if (reports.length === 0) return <p className="text-gray-500">Noch keine Exporte.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {reports.map((r) => (
          <li key={r.id} className="flex items-center gap-3 text-sm border rounded p-2">
            <span className="text-gray-500">{new Date(r.generatedAt).toLocaleString("de-AT")}</span>
            <span className="font-medium">{r.label}</span>
            <StatusBadge status={r.status} />
            {r.status === "done" && r.pdfKey && (
              <a href={`/api/files/${r.pdfKey}`} className="text-cobalt underline ml-auto" target="_blank" rel="noreferrer">
                PDF herunterladen
              </a>
            )}
            {r.status === "failed" && (
              <button onClick={() => retry(r.id)} className="text-cobalt underline ml-auto">
                Erneut versuchen
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: ReportView["status"] }) {
  const map = {
    pending: ["bg-yellow-100 text-yellow-800", "wird erstellt"],
    done: ["bg-green-100 text-green-800", "fertig"],
    failed: ["bg-red-100 text-red-800", "fehlgeschlagen"],
    cancelled: ["bg-gray-100 text-gray-700", "abgebrochen"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
