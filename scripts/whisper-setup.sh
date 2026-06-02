#!/usr/bin/env bash
set -euo pipefail
VENV_DIR="${WHISPER_VENV:-.venv-whisper}"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
"$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
"$VENV_DIR/bin/pip" install "faster-whisper>=1.0,<2"
echo "whisper venv ready at $VENV_DIR"
