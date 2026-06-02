export type PhotoView = { id: string; fileKey: string };

export function PhotoGallery({ photos }: { photos: PhotoView[] }) {
  if (photos.length === 0) return <p className="text-gray-500">Noch keine Fotos.</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
        // TODO(plan-3+): next/image erwägen; Fotos laufen über die authentifizierte
        // /api/files-Route, daher hier vorerst bewusst <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.id} src={`/api/files/${p.fileKey}`} alt="" className="aspect-square object-cover rounded border" />
      ))}
    </div>
  );
}
