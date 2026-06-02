export type NoteRef = { id: string; recordedAt: Date };
export type PhotoRef = { id: string; effectiveTime: Date };

export type MatchResult = {
  byNote: Map<string, string[]>;
  unmatched: string[];
};

const WINDOW_MS = 2 * 60 * 1000; // ±2 Minuten

/**
 * Ordnet jedes Foto der zeitlich nächstgelegenen Notiz zu, sofern der Abstand
 * |effectiveTime − recordedAt| ≤ 2 Min ist UND eindeutig ist. Liegen zwei oder mehr
 * Notizen exakt gleich nah (mehrdeutig) oder ist keine im Fenster, kommt das Foto in
 * den Anhang (`unmatched`). Rein funktional, kein I/O.
 */
export function matchPhotosToNotes(notes: NoteRef[], photos: PhotoRef[]): MatchResult {
  const byNote = new Map<string, string[]>();
  const unmatched: string[] = [];

  for (const photo of photos) {
    let bestDist = Infinity;
    let bestNoteId: string | null = null;
    let tied = false;
    for (const note of notes) {
      const dist = Math.abs(photo.effectiveTime.getTime() - note.recordedAt.getTime());
      if (dist > WINDOW_MS) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestNoteId = note.id;
        tied = false;
      } else if (dist === bestDist) {
        tied = true;
      }
    }
    if (bestNoteId !== null && !tied) {
      const list = byNote.get(bestNoteId) ?? [];
      list.push(photo.id);
      byNote.set(bestNoteId, list);
    } else {
      unmatched.push(photo.id);
    }
  }
  return { byNote, unmatched };
}
