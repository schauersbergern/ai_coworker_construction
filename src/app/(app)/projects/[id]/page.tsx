import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProjectDetail } from "./data";
import { NoteRecorder } from "./note-recorder";
import { NotesList } from "./notes-list";
import { PhotoUploader } from "./photo-uploader";
import { PhotoGallery } from "./photo-gallery";
import { ExportButton } from "./export-button";
import { ReportsList } from "./reports-list";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadProjectDetail(id);
  if (!data) notFound();
  const { project, notes, photos, reports } = data;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10 flex flex-col gap-8">
      <header>
        <Link href="/projects" className="text-sm text-muted hover:text-cobalt">
          ← Projekte
        </Link>
        <h1 className="text-3xl font-extrabold mt-2 leading-tight">{project.name}</h1>
        {project.address && <p className="text-muted mt-1">{project.address}</p>}
      </header>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-bold flex items-center gap-2">🎤 Sprachnotizen</h2>
        <NoteRecorder projectId={project.id} />
        <NotesList
          projectId={project.id}
          notes={notes.map((n) => ({
            id: n.id,
            transcript: n.transcript,
            transcriptStatus: n.transcriptStatus,
            recordedAt: n.recordedAt.toISOString(),
            audioKey: n.audioUrl,
          }))}
        />
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-bold flex items-center gap-2">📷 Fotos</h2>
        <PhotoUploader projectId={project.id} />
        <PhotoGallery photos={photos.map((p) => ({ id: p.id, fileKey: p.fileUrl }))} />
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-bold flex items-center gap-2">📄 Dokumentation</h2>
        <ExportButton projectId={project.id} />
        <ReportsList
          projectId={project.id}
          reports={reports.map((r) => ({
            id: r.id,
            label: r.label,
            status: r.status,
            pdfKey: r.pdfUrl,
            generatedAt: r.generatedAt.toISOString(),
          }))}
        />
      </section>
    </div>
  );
}
