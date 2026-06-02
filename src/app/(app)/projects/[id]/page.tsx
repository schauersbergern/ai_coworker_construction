import { notFound } from "next/navigation";
import { loadProjectDetail } from "./data";
import { NoteRecorder } from "./note-recorder";
import { NotesList } from "./notes-list";
import { PhotoUploader } from "./photo-uploader";
import { PhotoGallery } from "./photo-gallery";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadProjectDetail(id);
  if (!data) notFound();
  const { project, notes, photos } = data;

  return (
    <main className="p-6 flex flex-col gap-8 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold text-cobalt">{project.name}</h1>
        {project.address && <p className="text-gray-600">{project.address}</p>}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Sprachnotizen</h2>
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Fotos</h2>
        <PhotoUploader projectId={project.id} />
        <PhotoGallery photos={photos.map((p) => ({ id: p.id, fileKey: p.fileUrl }))} />
      </section>
    </main>
  );
}
