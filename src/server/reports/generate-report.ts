import sharp from "sharp";
import {
  getCreatorLabel,
  getReportById,
  loadReportInputs,
  setReportResult,
  setReportStatus,
} from "./reports.internal";
import { matchPhotosToNotes } from "./photo-matching";
import { renderReportPdf } from "@/server/pdf/render-report";
import { log, logError } from "@/server/log";
import type { RenderFinding } from "@/server/pdf/report-document";
import type { DocGenerator } from "@/server/docgen/doc-generator";
import type { ObjectStorage } from "@/server/storage/object-storage";

export type GenerateDeps = { storage: ObjectStorage; docGenerator: DocGenerator; now: Date };

function hasUsableTranscript(n: { transcript: string | null; transcriptStatus: string }): boolean {
  return n.transcriptStatus === "done" && !!n.transcript && n.transcript.trim().length > 0;
}

/**
 * Normalisiert beliebige Foto-Bytes nach JPEG (react-pdf rendert JPEG/PNG zuverlässig,
 * HEIC/WebP nicht). Schlägt das Dekodieren fehl, wird das Foto übersprungen (null)
 * statt das PDF zu brechen.
 */
async function toJpegDataUri(buf: Buffer): Promise<string | null> {
  try {
    const jpeg = await sharp(buf).rotate().jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function runGenerateReport(reportId: string, deps: GenerateDeps) {
  const report = await getReportById(reportId);
  if (!report) throw new Error(`Report ${reportId} not found`);

  log("report", "start", { reportId, projectId: report.projectId });
  const startedAt = Date.now();
  try {
    const inputs = await loadReportInputs(report.projectId);
    if (!inputs) throw new Error(`Project ${report.projectId} not found`);
    const { project, notes, photos } = inputs;

    const usableNotes = notes.filter(hasUsableTranscript);
    if (usableNotes.length === 0) {
      throw new Error("Keine nutzbaren Transkripte: Export nicht möglich (Transkription unvollständig oder leer).");
    }

    const content = await deps.docGenerator.generate({
      projectName: project.name,
      notes: usableNotes.map((n) => ({ id: n.id, transcript: n.transcript! })),
    });

    const effectiveTime = (p: (typeof photos)[number]) => p.exifTakenAt ?? p.clientCapturedAt;
    const match = matchPhotosToNotes(
      usableNotes.map((n) => ({ id: n.id, recordedAt: n.recordedAt })),
      photos.map((p) => ({ id: p.id, effectiveTime: effectiveTime(p) })),
    );
    const keyByPhoto = new Map(photos.map((p) => [p.id, p.fileUrl] as const));

    const skippedPhotos: string[] = [];
    const toDataUris = async (photoIds: string[]) => {
      const uris: string[] = [];
      for (const id of photoIds) {
        const uri = await toJpegDataUri(await deps.storage.read(keyByPhoto.get(id)!));
        if (uri) uris.push(uri);
        else skippedPhotos.push(id);
      }
      return uris;
    };

    const findings: RenderFinding[] = [];
    let i = 1;
    for (const f of content.findings) {
      findings.push({
        index: i++,
        title: f.title,
        location: f.location,
        text: f.text,
        photos: await toDataUris(match.byNote.get(f.noteId) ?? []),
      });
    }
    const appendixPhotos = await toDataUris(match.unmatched);

    const walkthrough = usableNotes.reduce(
      (min, n) => (n.recordedAt < min ? n.recordedAt : min),
      usableNotes[0].recordedAt,
    );
    const author = await getCreatorLabel(report.createdById);
    const pdf = await renderReportPdf({
      projectName: project.name,
      address: project.address ?? undefined,
      projectNo: project.projectNo ?? undefined,
      dateLabel: walkthrough.toLocaleDateString("de-AT"),
      author,
      intro: content.intro,
      findings,
      appendixPhotos,
    });
    const pdfKey = `projects/${project.id}/reports/${reportId}.pdf`;
    await deps.storage.put(pdfKey, pdf, "application/pdf");

    const artifact = {
      content,
      matching: {
        byNote: Object.fromEntries(match.byNote),
        unmatched: match.unmatched,
        skipped: skippedPhotos,
      },
      photoEffectiveTimes: Object.fromEntries(
        photos.map((p) => [p.id, effectiveTime(p).toISOString()]),
      ),
      walkthroughDate: walkthrough.toISOString(),
      generatedAt: deps.now.toISOString(),
    };
    const result = await setReportResult(reportId, { pdfUrl: pdfKey, reportJson: artifact });
    log("report", "done", {
      reportId,
      findings: findings.length,
      matchedPhotos: [...match.byNote.values()].reduce((a, l) => a + l.length, 0),
      unmatchedPhotos: match.unmatched.length,
      skippedPhotos: skippedPhotos.length,
      pdfBytes: pdf.length,
      ms: Date.now() - startedAt,
    });
    return result;
  } catch (err) {
    await setReportStatus(reportId, "failed");
    logError("report", "failed", err, { reportId });
    throw err;
  }
}
