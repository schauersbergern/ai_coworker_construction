import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Transcriber } from "./transcriber";

/** Ruft scripts/transcribe.py im whisper-venv auf und liefert stdout als Transkript. */
export class LocalWhisperTranscriber implements Transcriber {
  constructor(
    private readonly venvDir: string = process.env.WHISPER_VENV ?? ".venv-whisper",
    private readonly scriptPath: string = join(process.cwd(), "scripts", "transcribe.py"),
  ) {}

  transcribe(audioAbsPath: string): Promise<string> {
    const python = join(this.venvDir, "bin", "python");
    const timeoutMs = Number(process.env.WHISPER_TIMEOUT_MS ?? 120_000);
    return new Promise((resolve, reject) => {
      const proc = spawn(python, [this.scriptPath, audioAbsPath], { env: process.env });
      let out = "";
      let err = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        finish(() => reject(new Error(`whisper timed out after ${timeoutMs}ms`)));
      }, timeoutMs);
      proc.stdout.on("data", (d) => (out += d.toString()));
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("error", (e) => finish(() => reject(e)));
      proc.on("close", (code) => {
        finish(() =>
          code === 0
            ? resolve(out.trim())
            : reject(new Error(`whisper exited ${code}: ${err.trim()}`)),
        );
      });
    });
  }
}
