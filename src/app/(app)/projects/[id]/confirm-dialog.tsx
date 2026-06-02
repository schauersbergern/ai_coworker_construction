"use client";

import { useEffect, useId } from "react";

/**
 * Wiederverwendbares Guard-Popup für destruktive Aktionen (Notiz/Foto löschen).
 * Schließen via Backdrop-Klick oder Escape; Body-Scroll wird gesperrt.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Löschen",
  cancelLabel = "Abbrechen",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="card max-w-sm w-full p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 id={titleId} className="font-bold text-lg">{title}</h3>
          <p className="text-muted text-sm mt-1">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn btn-outline">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy} className="btn btn-danger">
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
