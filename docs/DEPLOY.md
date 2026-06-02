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
- Login über **Google OAuth**; Zugriff via `ALLOWED_EMAILS` (kommaseparierte Allowlist), kein E-Mail-Versand nötig.

---

## Einmalige Einrichtung (Reihenfolge wichtig)

### 1. DNS  *(nur du)*
A-Record setzen: `employees.aicoreinfra.de` → `72.62.42.27`. Mit `dig +short employees.aicoreinfra.de`
prüfen, dass die IP zurückkommt, bevor du das Zertifikat holst.

### 2. CD-Runner (self-hosted)
Der Server steht hinter **ufw**, das die wechselnden GitHub-hosted-Runner-IPs auf Port 22 blockt — SSH-basierte Deploys (appleboy/ssh-action) laufen daher in einen Timeout. Stattdessen läuft ein **self-hosted GitHub Runner** auf dem Server (`~/actions-runner`, über pm2 als `gh-runner`, Label `self-hosted`). Er verbindet sich **ausgehend** zu GitHub → kein offener Port nötig. Das Workflow (`.github/workflows/deploy.yml`) nutzt `runs-on: self-hosted` und deployt lokal (kein SSH, kein `DEPLOY_SSH_KEY`).
Neu aufsetzen falls nötig: Repo → Settings → Actions → Runners → New self-hosted runner → Token; dann `~/actions-runner/config.sh --url … --token … --unattended --labels self-hosted` + `pm2 start ./run.sh --name gh-runner && pm2 save`.

### 3. Inngest Cloud  *(nur du)*
Kostenlosen Account auf inngest.com anlegen, eine App „baudoku" erstellen, **Event Key** und
**Signing Key** kopieren (kommen in die server-seitige `.env`). Nach dem ersten Deploy die
Sync-URL `https://employees.aicoreinfra.de/api/inngest` im Inngest-Dashboard registrieren.

### 3b. Google OAuth  *(nur du)*
Login läuft über Google. In der **Google Cloud Console** → APIs & Services → Credentials →
**OAuth client ID (Web application)** anlegen:
- **Authorized redirect URI:** `https://employees.aicoreinfra.de/api/auth/callback/google`
- (Optional lokal: `http://localhost:3000/api/auth/callback/google`)

Client-ID + Secret kommen in die server-seitige `.env`. Wer Zugriff bekommt, steuerst du über
`ALLOWED_EMAILS` (kommaseparierte Google-Adressen) — kein Self-Signup, kein DB-Provisioning mehr.

### 4. Repo + .env auf dem Server
```bash
ssh deploy@72.62.42.27
cd /home/deploy
git clone https://github.com/schauersbergern/ai_coworker_construction.git
cd ai_coworker_construction
cp .env.production.example .env
# .env mit echten Werten füllen (Secrets!):
#   POSTGRES_PASSWORD       -> openssl rand -base64 24
#   AUTH_SECRET             -> openssl rand -base64 32
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET -> aus Schritt 3b
#   ALLOWED_EMAILS          -> kommaseparierte Google-Adressen mit Zugriff
#   ANTHROPIC_API_KEY       -> dein Claude-Key
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
curl -fsS https://employees.aicoreinfra.de/health   # Liveness -> {"status":"ok"}
curl -fsS https://employees.aicoreinfra.de/ready    # Readiness (DB) -> {"status":"ready"}
```
Kein Seeding nötig: Beim **ersten Google-Login einer Adresse aus `ALLOWED_EMAILS`** wird die
gemeinsame Pilot-Organisation automatisch angelegt und der/die Nutzer:in zugeordnet. Zugriff
erweitern/entziehen = `ALLOWED_EMAILS` in der server-`.env` ändern + Container neu starten
(`docker compose -f docker-compose.prod.yml up -d`).

---

## Laufender Betrieb (automatisch)
Ab jetzt deployt **jeder Merge auf `main`** automatisch via `.github/workflows/deploy.yml`:
`git reset --hard origin/main` → `docker compose -f docker-compose.prod.yml up -d --build` →
Smoke-Test gegen `/ready`. Manuell auslösbar über „Run workflow" (workflow_dispatch).

## Hinweise
- **Whisper-Modell** wird beim ersten Job in das `whisper_cache`-Volume geladen (einmalig, Netz nötig).
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`
- **Migrationen** laufen automatisch beim Container-Start (`prisma migrate deploy`).
- Der `app`-Container ist nur über `127.0.0.1:3012` erreichbar; öffentlich ausschließlich via Host-nginx.
