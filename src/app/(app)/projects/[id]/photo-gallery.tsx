"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./confirm-dialog";

export type PhotoView = { id: string; fileKey: string };

/* eslint-disable @next/next/no-img-element -- Fotos laufen über die authentifizierte /api/files-Route */

export function PhotoGallery({ projectId, photos }: { projectId: string; photos: PhotoView[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (photos.length === 0) return <p className="text-muted text-sm">Noch keine Fotos.</p>;

  async function del(photoId: string) {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      setConfirmId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <div key={p.id} className="relative aspect-square group">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="absolute inset-0 overflow-hidden rounded-lg border border-line"
            >
              <img
                src={`/api/files/${p.fileKey}`}
                alt=""
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
            </button>
            <button
              type="button"
              onClick={() => setConfirmId(p.id)}
              aria-label="Foto löschen"
              className="absolute top-1 right-1 z-10 grid place-items-center w-6 h-6 rounded-full bg-black/55 text-white text-xs leading-none hover:bg-black/75"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {open !== null && (
        <Lightbox
          photos={photos}
          index={open}
          onClose={() => setOpen(null)}
          onNav={(d) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length))}
        />
      )}

      {confirmId !== null && (
        <ConfirmDialog
          title="Foto löschen?"
          message="Das Foto wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden."
          busy={deleting}
          onConfirm={() => del(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </>
  );
}

function Lightbox({
  photos,
  index,
  onClose,
  onNav,
}: {
  photos: PhotoView[];
  index: number;
  onClose: () => void;
  onNav: (delta: number) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  // Beim Bildwechsel Zoom zurücksetzen — React-Muster: State während des Renders
  // anpassen (kein useEffect → kein set-state-in-effect).
  const [prevIndex, setPrevIndex] = useState(index);
  if (index !== prevIndex) {
    setPrevIndex(index);
    setZoomed(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNav(1);
      else if (e.key === "ArrowLeft") onNav(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onNav]);

  const src = `/api/files/${photos[index].fileKey}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={onClose}>
      <div
        className="flex items-center justify-between px-4 py-3 text-white/80 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-mono">
          {index + 1} / {photos.length}
        </span>
        <button onClick={onClose} className="rounded-md px-3 py-1 hover:bg-white/10">
          ✕ Schließen
        </button>
      </div>

      {/* Scroll-/Pinch-Bereich: zoomed → Originalgröße + Pan; touch-action erlaubt Pinch auf Mobile */}
      <div
        className="flex-1 overflow-auto grid place-items-center"
        style={{ touchAction: "pinch-zoom" }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt=""
          onClick={() => setZoomed((z) => !z)}
          className={
            zoomed
              ? "max-w-none cursor-zoom-out p-2"
              : "max-h-[82vh] max-w-[94vw] object-contain cursor-zoom-in select-none"
          }
        />
      </div>

      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNav(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/80 text-3xl px-3 py-2 rounded-md hover:bg-white/10"
            aria-label="Vorheriges Foto"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNav(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/80 text-3xl px-3 py-2 rounded-md hover:bg-white/10"
            aria-label="Nächstes Foto"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
