import { notFound } from "next/navigation";
import { loadAssessment } from "./data";
import { StatusPoller } from "./status-poller";
import type { Scores } from "@/coworkers/bodo/server/scoring/score";

function AmpelBadge({ ampel }: { ampel: Scores["ampel"] }) {
  const map = {
    gruen: { label: "Grün", className: "bg-green-100 text-green-800 border-green-300" },
    gelb: { label: "Gelb", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    rot: { label: "Rot", className: "bg-red-100 text-red-800 border-red-300" },
    unbekannt: { label: "Unbekannt", className: "bg-gray-100 text-gray-700 border-gray-300" },
  } as const;
  const { label, className } = map[ampel];
  return (
    <span className={`inline-block border rounded-full px-3 py-0.5 text-sm font-semibold ${className}`}>
      {label}
    </span>
  );
}

function AmpelLabel({ ampel }: { ampel: Scores["ampel"] }) {
  const labels: Record<Scores["ampel"], string> = {
    gruen: "Gute Vermarktbarkeit",
    gelb: "Eingeschränkte Vermarktbarkeit",
    rot: "Schwierige Vermarktbarkeit",
    unbekannt: "Unzureichende Datenlage — keine belastbare Bewertung",
  };
  return <span className="text-muted">{labels[ampel]}</span>;
}

export default async function AssessmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await loadAssessment(id);
  if (!a) notFound();

  const scores = a.status === "ready" ? (a.scores as unknown as Scores) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-bold">{a.address}</h1>
      <p className="text-muted mt-1">Status: {a.status}</p>

      {scores && scores.dataSufficient && (
        <>
          {/* Ampel + Vermarktungs-Score */}
          <section className="mt-8">
            <div className="flex items-center gap-3">
              <AmpelBadge ampel={scores.ampel} />
              <AmpelLabel ampel={scores.ampel} />
            </div>
            <p className="mt-2 text-3xl font-bold">
              {scores.vermarktungsScore}
              <span className="text-base font-normal text-muted"> / 100 Vermarktungs-Score</span>
            </p>
          </section>

          {/* Teilscores */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Teilscores</h2>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(scores.teilscores).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between bg-black/[0.03] rounded-lg px-3 py-2">
                  <span className="text-sm text-muted capitalize">{key}</span>
                  <span className="font-semibold">{val}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Primäre Zielgruppe */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Zielgruppen</h2>
            <div className="space-y-1.5">
              {scores.zielgruppen.map((z) => (
                <div
                  key={z.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    z.label === scores.primaereZielgruppe
                      ? "bg-blue-50 border border-blue-200 font-semibold"
                      : "bg-black/[0.03]"
                  }`}
                >
                  <span className="text-sm">
                    {z.label}
                    {z.label === scores.primaereZielgruppe && (
                      <span className="ml-1.5 text-xs text-blue-600 font-normal">(Primär)</span>
                    )}
                  </span>
                  <span className="font-semibold">{z.score}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Investitions-Signal */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Investitions-Signal</h2>
            <div className="bg-black/[0.03] rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{scores.investitionsSignal.label}</span>
                <span className="text-muted text-sm">{scores.investitionsSignal.score} / 100</span>
              </div>
              {scores.investitionsSignal.risiken.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {scores.investitionsSignal.risiken.map((r, i) => (
                    <li key={i} className="text-sm text-red-600 flex items-start gap-1.5">
                      <span className="mt-0.5">⚠</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Mikrolage-Text */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Mikrolage</h2>
            {a.narrative ? (
              <p className="text-sm leading-relaxed bg-black/[0.03] rounded-lg px-4 py-3">{a.narrative}</p>
            ) : (
              <p className="text-sm text-muted italic">Kein Mikrolage-Text verfügbar.</p>
            )}
          </section>

          {/* PDF-Export */}
          <section className="mt-8">
            <a
              href={`/c/bodo/standorte/${a.id}/dossier`}
              className="btn btn-accent"
            >
              📄 PDF-Dossier exportieren
            </a>
          </section>
        </>
      )}

      {scores && !scores.dataSufficient && (
        <section className="mt-8 space-y-3">
          <div className="flex items-center gap-3">
            <AmpelBadge ampel="unbekannt" />
            <AmpelLabel ampel="unbekannt" />
          </div>
          <p className="text-sm text-muted">
            Für diese Adresse konnten zu wenige Datenquellen abgerufen werden (
            {scores.dataCoverage.available}/{scores.dataCoverage.total}). Es wird bewusst{" "}
            <strong>keine Bewertung</strong> (Score, Zielgruppen, Investitions-Signal, Mikrolage-Text)
            angezeigt — fehlende Daten sind keine Aussage.
          </p>
          {scores.investitionsSignal.risiken.length > 0 && (
            <ul className="space-y-1">
              {scores.investitionsSignal.risiken.map((r, i) => (
                <li key={i} className="text-sm text-red-600 flex items-start gap-1.5">
                  <span className="mt-0.5">⚠</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          <a href={`/c/bodo/standorte/${a.id}/dossier`} className="btn btn-accent">
            📄 PDF-Dossier (nur Datenpunkte) exportieren
          </a>
        </section>
      )}

      {(a.status === "failed" || a.status === "cancelled") && (
        <p className="text-red-600 mt-4">Fehler: {a.error ?? "Unbekannter Fehler"}</p>
      )}

      {(a.status === "pending" || a.status === "running") && (
        <>
          <p className="text-muted mt-4 italic">Bewertung wird erstellt…</p>
          <StatusPoller />
        </>
      )}
    </div>
  );
}
