"""Persistenter Whisper-Worker: lädt das Modell EINMAL und transkribiert auf Anfrage.

Eliminiert das teure Modell-Laden pro Notiz (Hauptkosten bei kurzen Clips).
Protokoll: POST /transcribe mit den rohen Audio-Bytes im Body, Header
X-Audio-Ext für die Dateiendung. Antwort: {"text": "..."}.
GET /health -> {"status":"ok"} (für den Container-Healthcheck).
"""

import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", os.cpu_count() or 4))

print(f"[whisper] loading model '{MODEL_SIZE}' (cpu_threads={CPU_THREADS}) ...", flush=True)
MODEL = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", cpu_threads=CPU_THREADS)
print("[whisper] model ready", flush=True)


def transcribe(path: str) -> str:
    segments, _info = MODEL.transcribe(
        path,
        language="de",
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    return " ".join(s.text.strip() for s in segments).strip()


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"status": "ok", "model": MODEL_SIZE})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/transcribe":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        ext = self.headers.get("X-Audio-Ext", "webm")
        try:
            with tempfile.NamedTemporaryFile(suffix=f".{ext}") as f:
                f.write(data)
                f.flush()
                text = transcribe(f.name)
            self._json(200, {"text": text})
        except Exception as exc:  # noqa: BLE001 — Fehler an den Aufrufer melden
            print(f"[whisper] error: {exc}", flush=True)
            self._json(500, {"error": str(exc)})

    def log_message(self, *_args) -> None:  # stdout nicht zuspammen
        pass


if __name__ == "__main__":
    port = int(os.environ.get("WHISPER_PORT", "8001"))
    print(f"[whisper] listening on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
