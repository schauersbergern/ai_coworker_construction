import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { Transcriber } from "./transcriber";

/**
 * Schickt das Audio an den persistenten Whisper-Worker (scripts/whisper_server.py),
 * der das Modell warmhält → kein Modell-Laden pro Notiz, deutlich schneller.
 */
export class LocalWhisperTranscriber implements Transcriber {
  constructor(
    private readonly url: string = process.env.WHISPER_URL ?? "http://whisper:8001/transcribe",
  ) {}

  async transcribe(audioAbsPath: string): Promise<string> {
    const data = await readFile(audioAbsPath);
    const ext = extname(audioAbsPath).replace(/^\./, "") || "webm";
    const timeoutMs = Number(process.env.WHISPER_TIMEOUT_MS ?? 120_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Audio-Ext": ext },
        body: new Uint8Array(data),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`whisper worker HTTP ${res.status}: ${detail.slice(0, 200)}`);
      }
      const json = (await res.json()) as { text?: string };
      return (json.text ?? "").trim();
    } finally {
      clearTimeout(timer);
    }
  }
}
