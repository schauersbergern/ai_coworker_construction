import sys
from faster_whisper import WhisperModel

def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audo_path>", file=sys.stderr)
        return 2
    audio_path = sys.argv[1]
    model_size = __import__("os").environ.get("WHISPER_MODEL", "small")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(audio_path, language="de")
    text = " ".join(seg.text.strip() for seg in segments).strip()
    print(text)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
