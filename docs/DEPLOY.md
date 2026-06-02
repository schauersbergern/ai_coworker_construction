# Deployment – employees.aicoreinfra.de

Produktions-Deploy auf den geteilten Server `deploy@72.62.42.27` (Ubuntu 24.04), nach dem
gleichen Muster wie `angebotparser`: **Docker Compose** (App + dedizierter Postgres),
**Host-nginx** als TLS-Reverse-Proxy, **CD via GitHub Action** bei Merge auf `main`.

Die App-Architektur:
- Ein `app`-Container (Next.js 16 + Python/ffmpeg/faster-whisper für lokales STT), nur an
  `127.0.0.1:3012` gebunden.
- Ein `db`-Container (Postgres 16), isoliert vom geteilten Host-Postgres.
- **Inngest Cloud (Free)** für die Hintergrundjobs (kein Extra-Container) — ruft die
  öffentliche `/api/inngest`-Route auf.
- E-Mail (Magic-Link) über vorhandenen SMTP-Zugang.

---

## Einmalige Einrichtung (Reihenfolge wichtig)

### 1. DNS  *(nur du)*
A-Record setzen: `employees.aicoreinfra.de` → `72.62.42.27`. Mit `dig +short employees.aicoreinfra.de`
prüfen, dass die IP zurückkommt, bevor du das Zertifikat holst.

### 2. GitHub-Secret  *(nur du)*
Im Repo `schauersbergern/ai_coworker_construction` → Settings → Secrets and variables → Actions:
**`DEPLOY_SSH_KEY`** = derselbe private Deploy-Key wie bei `angebotparser` (Zugang zu `deploy@72.62.42.27`).
Optional ein GitHub-Environment `production` mit Pflicht-Review anlegen (die Action referenziert es bereits).

### 3. Inngest Cloud  *(nur du)*
Kostenlosen Account auf inngest.com anlegen, eine App „baudoku" erstellen, **Event Key** und
**Signing Key** kopieren (kommen in die server-seitige `.env`). Nach dem ersten Deploy die
Sync-URL `https://employees.aicoreinfra.de/api/inngest` im Inngest-Dashboard registrieren.

### 4. Repo + .env auf dem Server
```bash
ssh deploy@72.62.42.27
cd /home/deploy
git clone https://github.com/schauersbergern/ai_coworker_construction.git
cd ai_coworker_construction
cp .env.production.example .env
# .env mit echten Werten füllen (Secrets!):
#   POSTGRES_PASSWORD   -> openssl rand -base64 24
#   AUTH_SECRET         -> openssl rand -base64 32
#   EMAIL_SERVER        -> dein SMTP (smtp://user:pass@host:587)
#   ANTHROPIC_API_KEY   -> dein Claude-Key
#   INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY -> aus Schritt 3
nano .env
```
> Die `.env` ist gitignored und bleibt nur auf dem Server. `git reset --hard` im Deploy lässt
> sie unangetastet (untracked file).

### 5. nginx-vhost + TLS  *(sudo nötig — nur du)*
Datei `/etc/nginx/sites-available/employees.aicoreinfra.de`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name employees.aicoreinfra.de;

    # Uploads: Audio bis 25 MB, Fotos bis 15 MB
    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3012;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```
Aktivieren + Zertifikat:
```bash
sudo ln -s /etc/nginx/sites-available/employees.aicoreinfra.de /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d employees.aicoreinfra.de
```
certbot ergänzt den `listen 443 ssl`-Block + Redirect automatisch.

### 6. Erster Start (manuell, einmalig)
```bash
cd /home/deploy/ai_coworker_construction
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -fsS https://employees.aicoreinfra.de/health   # -> {"status":"ok"}
```
Erste Begehung anlegen: Pilot-Org + Nutzer provisionieren (Allowlist!):
```bash
docker compose -f docker-compose.prod.yml exec app \
  sh -c 'SEED_USER_EMAIL="nikolaus.schauersberger@gmail.com" SEED_ORG_NAME="Pilot-Büro" pnpm db:seed'
```

---

## Laufender Betrieb (automatisch)
Ab jetzt deployt **jeder Merge auf `main`** automatisch via `.github/workflows/deploy.yml`:
`git reset --hard origin/main` → `docker compose -f docker-compose.prod.yml up -d --build` →
Smoke-Test gegen `/health`. Manuell auslösbar über „Run workflow" (workflow_dispatch).

## Hinweise
- **Whisper-Modell** wird beim ersten Job in das `whisper_cache`-Volume geladen (einmalig, Netz nötig).
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`
- **Migrationen** laufen automatisch beim Container-Start (`prisma migrate deploy`).
- Der `app`-Container ist nur über `127.0.0.1:3012` erreichbar; öffentlich ausschließlich via Host-nginx.
