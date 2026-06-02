# syntax=docker/dockerfile:1

# ---- Builder: install deps + build Next.js ----
FROM node:20-bookworm AS builder
WORKDIR /app
# pnpm-Version aus package.json#packageManager fest aktivieren (kein Laufzeit-Download/Drift)
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
# Lockfile-getreue Installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate && pnpm build

# ---- Runner: Next.js + Python/ffmpeg/faster-whisper für lokales STT ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Systemabhängigkeiten für die Transkription (faster-whisper braucht python + ffmpeg)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Whisper-venv (faster-whisper). Modell wird zur Laufzeit nach HF_HOME geladen (Volume).
ENV WHISPER_VENV=/app/.venv-whisper
RUN python3 -m venv "$WHISPER_VENV" \
  && "$WHISPER_VENV/bin/pip" install --no-cache-dir --upgrade pip \
  && "$WHISPER_VENV/bin/pip" install --no-cache-dir "faster-whisper>=1.0,<2"

# Gebaute App + node_modules + prisma + scripts aus dem Builder übernehmen
COPY --from=builder /app ./

EXPOSE 3000
# Migrationen anwenden, dann Server starten — über die lokalen Binaries (kein pnpm/corepack
# im Laufzeitpfad → keine Versionsauflösung/kein Download beim Containerstart). Schlägt die
# Migration fehl, startet die App nicht.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/next start"]
