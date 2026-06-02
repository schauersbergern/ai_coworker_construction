import os
import sys
from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audio_path>", file=sys.stderr)
        return 2
    audio_path = sys.argv[1]
    model_size = os.environ.get("WHISPER_MODEL", "small")
    # Alle verfügbaren CPU-Kerne nutzen (überschreibbar via WHISPER_CPU_THREADS).
    cpu_threads = int(os.environ.get("WHISPER_CPU_THREADS", os.cpu_count() or 4))

    model = WhisperModel(
        model_size, device="cpu", compute_type="int8", cpu_threads=cpu_threads
    )
    segments, _info = model.transcribe(
        audio_path,
        language="de",
        # Speed: greedy statt 5er-Beam (deutlich schneller, minimal weniger genau)
        beam_size=1,
        # Stille/Nicht-Sprache überspringen → schneller + weniger Halluzination
        vad_filter=True,
        condition_on_previous_text=False,
    )
    text = " ".join(seg.text.strip() for seg in segments).strip()
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
