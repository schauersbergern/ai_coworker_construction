# syntax=docker/dockerfile:1

# ---- Builder: install deps + build Next.js ----
FROM node:20-bookworm AS builder
WORKDIR /app
RUN corepack enable
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
RUN corepack enable

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
# Migrationen anwenden, dann Server starten. Schlägt die Migration fehl, startet die App nicht.
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm start"]
