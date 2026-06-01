# Baudoku MVP – Plan 1: Fundament (Scaffold, DB, Auth, Projekte)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine lauffähige Next.js-App, in die sich ein:e **manuell provisionierte:r** Nutzer:in via Magic-Link einloggen und Projekte ihrer Organisation anlegen/auflisten/öffnen kann. Unbekannte E-Mail-Adressen erhalten keinen Link.

**Architecture:** Next.js 16 (App Router, TypeScript, Turbopack default) mit Prisma/Postgres. Domänen-Module unter `src/server/<domain>`. Auth.js v5 (Magic-Link, Prisma-Adapter) mit **Allowlist** (nur provisionierte E-Mails). Alle Daten organisationsweit sichtbar (kein Pro-Projekt-Rechtesystem). Tests: Vitest (Unit/Integration gegen Test-Postgres).

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4 (CSS-`@theme`, **kein** `tailwind.config.ts`), Prisma, PostgreSQL, Auth.js v5 (Nodemailer-Provider), Vitest, pnpm, Docker (Postgres + Mailpit).

**Async-Job-Entscheidung (Spec §4):** Festgelegt auf **Inngest** für Transkription/PDF-Generierung. Installation und Routen kommen in **Plan 2** (dort werden die Jobs erstmals gebraucht); dieser Plan **reserviert** bereits die Inngest-Env-Variablen, damit das Fundament konsistent bleibt.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-01-baudoku-mvp-design.md`

---

## Dateistruktur (in diesem Plan angelegt/berührt)

- `package.json`, `tsconfig.json`, `next.config.ts` — Scaffold (Next 16)
- `src/app/globals.css` — Tailwind v4 + Markenfarben via `@theme`
- `docker-compose.yml` — Postgres **und** Mailpit (dev + test, reproduzierbarer Login)
- `.env.example`, `.env.test.example` (beide committed), `.env`, `.env.test` (lokal, ignoriert) — Konfiguration (inkl. reservierter Inngest-Vars)
- `prisma/schema.prisma` — vollständiges Datenmodell (alle Tabellen, auch für spätere Pläne)
- `prisma/seed.ts` — manuelles Provisionieren von Org + Nutzer:in (Pilot)
- `src/server/db.ts` — Prisma-Client-Singleton
- `src/server/projects/projects.service.ts` (+ `.test.ts`) — Projekt-Domänenlogik
- `src/server/projects/projects.schema.ts` (+ `.test.ts`) — Eingabevalidierung
- `src/server/auth/provisioning.ts` (+ `.test.ts`) — Allowlist-Prüfung provisionierter E-Mails
- `src/auth.ts` — Auth.js-Konfiguration (Allowlist via `sendVerificationRequest` + `signIn`-Callback)
- `src/app/api/auth/[...nextauth]/route.ts` — Auth-Handler
- `src/server/auth/require-session.ts` — Session-/Org-Guard
- `src/app/login/page.tsx`, `src/app/no-org/page.tsx` — Auth-Seiten (vor Projekt-UI)
- `src/app/(app)/projects/page.tsx` — Projektliste
- `src/app/(app)/projects/new/action.ts`, `.../new-project-form.tsx` — Projekt anlegen
- `src/app/(app)/projects/[id]/page.tsx` — Projekt-Detail (Shell)
- `vitest.config.ts`, `vitest.setup.ts`, `scripts/test-db.sh` — Testinfrastruktur

---

## Task 0: Next.js-16-Scaffold & Markenfarben (Tailwind v4)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Next.js-App scaffolden (Turbopack ist Default — kein Flag)**

Run:
```bash
cd /Users/nikolausschauersberger/Projects/ai/ai_coworker_construction
pnpm create next-app@latest . --ts --eslint --tailwind --app --src-dir --import-alias "@/*"
```
Bei „directory not empty" bestehende Dateien behalten. Erwartet: `package.json`, `src/app/`, `src/app/globals.css` existieren; Tailwind v4 ist installiert (`@tailwindcss/postcss` in `devDependencies`, `postcss.config.mjs` vorhanden). **Kein** `tailwind.config.ts` (Tailwind v4 konfiguriert per CSS).

- [ ] **Step 2: Dev-Server prüfen**

Run: `pnpm dev`
Erwartet: Server auf `http://localhost:3000`, Default-Seite lädt. Mit Ctrl-C beenden.

- [ ] **Step 3: Markenfarben in globals.css via @theme (Tailwind v4)**

In `src/app/globals.css` direkt nach `@import "tailwindcss";` einfügen:
```css
@theme {
  --color-cobalt: #1b3bdb;
  --color-accent: #f4b400;
}
```
Damit funktionieren Utilities wie `bg-cobalt`, `text-cobalt`, `text-accent`.

- [ ] **Step 4: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js 16 app with Tailwind v4 brand colors"
```
(Falls `git init` schon erfolgt ist, nur `git add`/`commit`.)

---

## Task 1: Lokale Infrastruktur via Docker (Postgres + Mailpit)

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env`, `.env.test`

- [ ] **Step 1: docker-compose.yml anlegen (Postgres + Mailpit)**

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: baudoku
      POSTGRES_PASSWORD: baudoku
      POSTGRES_DB: baudoku
    ports:
      - "5432:5432"
    volumes:
      - baudoku_pgdata:/var/lib/postgresql/data

  mail:
    image: axllent/mailpit:latest
    restart: unless-stopped
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web-UI

volumes:
  baudoku_pgdata:
```

- [ ] **Step 2: .env.example anlegen (inkl. reservierter Inngest-Vars)**

```bash
DATABASE_URL="postgresql://baudoku:baudoku@localhost:5432/baudoku?schema=public"
# Auth.js
AUTH_SECRET="dev-secret-change-me"
AUTH_URL="http://localhost:3000"
# Magic-Link via lokales Mailpit (siehe docker-compose)
EMAIL_SERVER="smtp://localhost:1025"
EMAIL_FROM="noreply@baudoku.local"
# Reserviert für Plan 2 (Inngest – Background-Jobs für STT/PDF)
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""
```

- [ ] **Step 3: .env und .env.test erzeugen**

`.env` = Kopie von `.env.example`. `.env.test` identisch, aber eigene Test-DB und Test-Secret:
```bash
DATABASE_URL="postgresql://baudoku:baudoku@localhost:5432/baudoku_test?schema=public"
AUTH_SECRET="test-secret"
AUTH_URL="http://localhost:3000"
EMAIL_SERVER="smtp://localhost:1025"
EMAIL_FROM="noreply@baudoku.local"
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""
```
`.gitignore` muss `.env*` (außer `.env.example`) enthalten — Next.js-Scaffold ergänzt das; prüfen.

- [ ] **Step 4: Container starten und Test-DB anlegen**

Run:
```bash
docker compose up -d
sleep 3
docker compose exec -T db psql -U baudoku -d baudoku -c "CREATE DATABASE baudoku_test;" || echo "exists"
```
Erwartet: Container `db` und `mail` laufen (`docker compose ps`); Mailpit-UI unter `http://localhost:8025` erreichbar; `baudoku_test` existiert.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "chore: docker-compose with postgres and mailpit for reproducible login"
```

---

## Task 2: Prisma + vollständiges Datenmodell

**Files:**
- Create: `prisma/schema.prisma`, `src/server/db.ts`

- [ ] **Step 1: Prisma installieren & initialisieren**

Run:
```bash
pnpm add -D prisma && pnpm add @prisma/client
pnpm prisma init --datasource-provider postgresql
```
Erwartet: `prisma/schema.prisma` existiert.

- [ ] **Step 2: schema.prisma vollständig definieren (komplett ersetzen)**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---- Auth.js Standardmodelle ----
model User {
  id             String    @id @default(cuid())
  email          String    @unique
  emailVerified  DateTime?
  name           String?
  orgId          String?
  organization   Organization? @relation(fields: [orgId], references: [id])
  accounts       Account[]
  sessions       Session[]
  createdReports Report[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
}

// ---- Domänenmodelle ----
model Organization {
  id        String    @id @default(cuid())
  name      String
  createdAt DateTime  @default(now())
  users     User[]
  projects  Project[]
}

model Project {
  id        String   @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name      String
  address   String?
  projectNo String?
  createdAt DateTime @default(now())
  notes     Note[]
  photos    Photo[]
  reports   Report[]

  @@index([orgId])
}

enum TranscriptStatus {
  pending
  done
  failed
}

model Note {
  id               String   @id @default(cuid())
  projectId        String
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  audioUrl         String
  transcript       String?
  transcriptStatus TranscriptStatus @default(pending)
  recordedAt       DateTime
  createdAt        DateTime @default(now())

  @@index([projectId])
}

model Photo {
  id               String   @id @default(cuid())
  projectId        String
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  fileUrl          String
  exifTakenAt      DateTime?
  clientCapturedAt DateTime
  uploadedAt       DateTime @default(now())

  @@index([projectId])
}

enum ReportStatus {
  pending
  done
  failed
}

model Report {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  label       String
  status      ReportStatus @default(pending)
  pdfUrl      String?
  reportJson  Json?
  createdById String?
  createdBy   User?    @relation(fields: [createdById], references: [id])
  generatedAt DateTime @default(now())

  @@index([projectId])
}
```

- [ ] **Step 3: Erste Migration erzeugen**

Run: `pnpm prisma migrate dev --name init`
Erwartet: `prisma/migrations/<ts>_init` entsteht, „Your database is now in sync".

- [ ] **Step 4: Prisma-Client-Singleton anlegen**

`src/server/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Commit**

```bash
git add prisma src/server/db.ts
git commit -m "feat: prisma schema (full data model) and db client"
```

---

## Task 3: Test-Harness (Vitest gegen Test-Postgres)

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `scripts/test-db.sh`
- Modify: `package.json` (Scripts)

- [ ] **Step 1: Test-Dependencies installieren**

Run: `pnpm add -D vitest vite-tsconfig-paths dotenv`

- [ ] **Step 2: vitest.config.ts anlegen**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: vitest.setup.ts anlegen (lädt .env.test)**

```ts
import { config } from "dotenv";
config({ path: ".env.test", override: true });
```

- [ ] **Step 4: scripts/test-db.sh anlegen (reproduzierbar aus frischem Checkout)**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Reproducible from a fresh checkout: if no local .env.test exists yet,
# bootstrap it from the committed template.
if [ ! -f .env.test ]; then
  cp .env.test.example .env.test
  echo "created .env.test from .env.test.example"
fi

export $(grep -v '^#' .env.test | xargs)

# Ensure the test database exists (Postgres has no CREATE DATABASE IF NOT EXISTS).
if ! docker compose exec -T db psql -U baudoku -d baudoku -tAc \
    "SELECT 1 FROM pg_database WHERE datname='baudoku_test'" | grep -q 1; then
  docker compose exec -T db psql -U baudoku -d baudoku -c "CREATE DATABASE baudoku_test;"
  echo "created database baudoku_test"
fi

pnpm prisma migrate deploy
echo "test db migrated"
```
Danach: `chmod +x scripts/test-db.sh`. Außerdem `.env.test.example` (committed, identische Werte wie `.env.test`) anlegen und in `.gitignore` `!.env.test.example` ergänzen, damit ein frischer Checkout/CI `pnpm db:test:migrate` ohne verstecktes lokales Setup ausführen kann.

- [ ] **Step 5: package.json-Scripts ergänzen**

Unter `"scripts"`:
```json
"db:test:migrate": "bash scripts/test-db.sh",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Test-DB migrieren**

Run: `pnpm db:test:migrate`
Erwartet: „test db migrated".

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.setup.ts scripts/test-db.sh package.json
git commit -m "test: vitest harness against test postgres"
```

---

## Task 4: Projekt-Domänenlogik (create/list/get) — TDD

**Files:**
- Create: `src/server/projects/projects.service.ts`, `src/server/projects/projects.service.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/server/projects/projects.service.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createProject, listProjects, getProject } from "./projects.service";

async function makeOrg() {
  return prisma.organization.create({ data: { name: "Test-Büro" } });
}

describe("projects.service", () => {
  beforeEach(async () => {
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a project in the org and lists it", async () => {
    const org = await makeOrg();
    const created = await createProject(org.id, { name: "Wohnbau Lindengasse" });
    expect(created.id).toBeTruthy();
    expect(created.orgId).toBe(org.id);

    const list = await listProjects(org.id);
    expect(list.map((p) => p.id)).toContain(created.id);
  });

  it("does not list projects of other orgs", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await createProject(orgA.id, { name: "A-Projekt" });

    const listB = await listProjects(orgB.id);
    expect(listB).toHaveLength(0);
  });

  it("getProject returns null for a project of another org", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const p = await createProject(orgA.id, { name: "A-Projekt" });

    expect(await getProject(orgB.id, p.id)).toBeNull();
    expect((await getProject(orgA.id, p.id))?.id).toBe(p.id);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `pnpm test src/server/projects/projects.service.test.ts`
Erwartet: FAIL — Import './projects.service' nicht auflösbar.

- [ ] **Step 3: Minimal-Implementierung**

`src/server/projects/projects.service.ts`:
```ts
import { prisma } from "@/server/db";

export type CreateProjectInput = {
  name: string;
  address?: string;
  projectNo?: string;
};

export function createProject(orgId: string, input: CreateProjectInput) {
  return prisma.project.create({
    data: {
      orgId,
      name: input.name,
      address: input.address,
      projectNo: input.projectNo,
    },
  });
}

export function listProjects(orgId: string) {
  return prisma.project.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
}

export function getProject(orgId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, orgId } });
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `pnpm test src/server/projects/projects.service.test.ts`
Erwartet: PASS (3 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/server/projects
git commit -m "feat: project service (create/list/get) with org scoping"
```

---

## Task 5: Eingabevalidierung für Projektanlage — TDD

**Files:**
- Create: `src/server/projects/projects.schema.ts`, `src/server/projects/projects.schema.test.ts`

- [ ] **Step 1: Zod installieren**

Run: `pnpm add zod`

- [ ] **Step 2: Failing test schreiben**

`src/server/projects/projects.schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createProjectSchema } from "./projects.schema";

describe("createProjectSchema", () => {
  it("accepts a valid name and trims it", () => {
    const r = createProjectSchema.parse({ name: "  Wohnbau  " });
    expect(r.name).toBe("Wohnbau");
  });

  it("rejects an empty name", () => {
    expect(() => createProjectSchema.parse({ name: "   " })).toThrow();
  });

  it("passes optional fields through", () => {
    const r = createProjectSchema.parse({ name: "X", address: "Gasse 1", projectNo: "2026-014" });
    expect(r.address).toBe("Gasse 1");
    expect(r.projectNo).toBe("2026-014");
  });
});
```

- [ ] **Step 3: Test ausführen, Fehlschlag verifizieren**

Run: `pnpm test src/server/projects/projects.schema.test.ts`
Erwartet: FAIL — Import nicht auflösbar.

- [ ] **Step 4: Schema implementieren**

`src/server/projects/projects.schema.ts`:
```ts
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().transform((s) => s.trim()).pipe(z.string().min(1, "Name erforderlich")),
  address: z.string().trim().optional(),
  projectNo: z.string().trim().optional(),
});

export type CreateProjectValues = z.infer<typeof createProjectSchema>;
```

- [ ] **Step 5: Test ausführen, Erfolg verifizieren**

Run: `pnpm test src/server/projects/projects.schema.test.ts`
Erwartet: PASS (3 Tests grün).

- [ ] **Step 6: Commit**

```bash
git add src/server/projects/projects.schema.ts src/server/projects/projects.schema.test.ts
git commit -m "feat: zod validation for project creation"
```

---

## Task 6: Allowlist provisionierter E-Mails — TDD (verhindert Self-Signup)

**Files:**
- Create: `src/server/auth/provisioning.ts`, `src/server/auth/provisioning.test.ts`

Eine E-Mail gilt nur dann als „provisioniert", wenn ein User mit gesetzter `orgId` existiert. Diese Funktion ist das Gate, das Auth.js (Task 7) vor dem Versand prüft.

- [ ] **Step 1: Failing test schreiben**

`src/server/auth/provisioning.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { isProvisionedEmail } from "./provisioning";

describe("isProvisionedEmail", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("returns false for an unknown email (kein Link)", async () => {
    expect(await isProvisionedEmail("unknown@example.com")).toBe(false);
  });

  it("returns false for a user without an org", async () => {
    await prisma.user.create({ data: { email: "no-org@example.com" } });
    expect(await isProvisionedEmail("no-org@example.com")).toBe(false);
  });

  it("returns true for a user assigned to an org", async () => {
    const org = await prisma.organization.create({ data: { name: "Büro" } });
    await prisma.user.create({ data: { email: "ok@example.com", orgId: org.id } });
    expect(await isProvisionedEmail("ok@example.com")).toBe(true);
  });

  it("is case-insensitive on the email", async () => {
    const org = await prisma.organization.create({ data: { name: "Büro" } });
    await prisma.user.create({ data: { email: "mix@example.com", orgId: org.id } });
    expect(await isProvisionedEmail("MIX@example.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `pnpm test src/server/auth/provisioning.test.ts`
Erwartet: FAIL — Import './provisioning' nicht auflösbar.

- [ ] **Step 3: Implementierung**

`src/server/auth/provisioning.ts`:
```ts
import { prisma } from "@/server/db";

/**
 * Eine E-Mail ist provisioniert, wenn ein User existiert, der einer
 * Organisation zugeordnet ist. Nur solche Adressen dürfen einen Magic-Link
 * erhalten (Pilot: manuelles Provisionieren, kein Self-Service-Signup).
 */
export async function isProvisionedEmail(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { orgId: true },
  });
  return Boolean(user?.orgId);
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `pnpm test src/server/auth/provisioning.test.ts`
Erwartet: PASS (4 Tests grün).

> Hinweis: Damit die Case-Insensitivity auch beim Seed/Provisionieren stimmt, werden E-Mails in Task 8 (Seed) ebenfalls lowercased gespeichert.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/provisioning.ts src/server/auth/provisioning.test.ts
git commit -m "feat: provisioned-email allowlist check (TDD)"
```

---

## Task 7: Auth.js v5 (Magic-Link) mit Allowlist + Org-Guard

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/server/auth/require-session.ts`

- [ ] **Step 1: Auth-Dependencies installieren**

Run: `pnpm add next-auth@beta @auth/prisma-adapter nodemailer`

- [ ] **Step 2: Auth.js konfigurieren (mit Allowlist)**

`src/auth.ts`:
```ts
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { createTransport } from "nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { isProvisionedEmail } from "@/server/auth/provisioning";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER!,
      from: process.env.EMAIL_FROM!,
      // Gate VOR dem Versand: unbekannte/unprovisionierte Adressen erhalten
      // keinen Magic-Link (kein Account wird angelegt).
      async sendVerificationRequest({ identifier, url, provider }) {
        if (!(await isProvisionedEmail(identifier))) return;
        const transport = createTransport(provider.server);
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: "Dein Anmelde-Link für Baudoku",
          text: `Anmelden: ${url}`,
          html: `<p>Klicke zum Anmelden:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    }),
  ],
  callbacks: {
    // Defense-in-depth: selbst wenn ein Token kursiert, wird die Anmeldung
    // einer nicht provisionierten Adresse abgelehnt.
    async signIn({ user }) {
      if (!user.email) return false;
      return await isProvisionedEmail(user.email);
    },
  },
  pages: { signIn: "/login" },
});
```

- [ ] **Step 3: Auth-Route-Handler anlegen**

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Session-/Org-Guard anlegen**

`src/server/auth/require-session.ts`:
```ts
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/server/db";

export type AppSession = { userId: string; orgId: string; email: string };

/**
 * Liefert die aktive Session inkl. Org. Redirect auf /login wenn nicht
 * eingeloggt, auf /no-org wenn keiner Organisation zugeordnet.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, orgId: true, email: true },
  });
  if (!user) redirect("/login");
  if (!user.orgId) redirect("/no-org");

  return { userId: user.id, orgId: user.orgId, email: user.email };
}
```

- [ ] **Step 5: Build-Check**

Run: `pnpm exec tsc --noEmit`
Erwartet: Keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts src/app/api/auth src/server/auth/require-session.ts
git commit -m "feat: auth.js v5 magic-link with provisioned-email allowlist and org guard"
```

---

## Task 8: Seed-Script — Pilot-Org & Nutzer:in provisionieren

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (prisma.seed + script)

- [ ] **Step 1: tsx installieren**

Run: `pnpm add -D tsx`

- [ ] **Step 2: seed.ts anlegen (E-Mail lowercased)**

`prisma/seed.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? "Pilot-Büro";
  const email = (process.env.SEED_USER_EMAIL ?? "pilot@example.com").toLowerCase();

  const org = await prisma.organization.upsert({
    where: { id: "seed-pilot-org" },
    update: { name: orgName },
    create: { id: "seed-pilot-org", name: orgName },
  });

  await prisma.user.upsert({
    where: { email },
    update: { orgId: org.id },
    create: { email, orgId: org.id },
  });

  console.log(`Seeded org "${orgName}" with user ${email}`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 3: package.json für Seed konfigurieren**

Ergänzen:
```json
"prisma": { "seed": "tsx prisma/seed.ts" },
```
und unter `"scripts"`:
```json
"db:seed": "prisma db seed"
```

- [ ] **Step 4: Seed gegen Dev-DB ausführen**

Run:
```bash
SEED_USER_EMAIL="nikolaus.schauersberger@gmail.com" SEED_ORG_NAME="Pilot-Büro" pnpm db:seed
```
Erwartet: „Seeded org …". DB enthält Organization + User mit gesetzter `orgId`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: seed script to provision pilot org and user"
```

---

## Task 9: Auth-Seiten — Login & no-org (VOR der Projekt-UI)

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/no-org/page.tsx`

- [ ] **Step 1: Login-Seite (Magic-Link)**

`src/app/login/page.tsx`:
```tsx
import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        action={async (formData: FormData) => {
          "use server";
          await signIn("nodemailer", {
            email: String(formData.get("email")),
            redirectTo: "/projects",
          });
        }}
        className="flex flex-col gap-3 w-full max-w-sm"
      >
        <h1 className="text-xl font-semibold text-cobalt">Anmelden</h1>
        <input name="email" type="email" placeholder="E-Mail" className="border rounded p-2" required />
        <button type="submit" className="bg-cobalt text-white rounded p-2">
          Magic-Link senden
        </button>
        <p className="text-xs text-gray-500">
          Nur freigeschaltete Adressen erhalten einen Link.
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: no-org-Seite**

`src/app/no-org/page.tsx`:
```tsx
export default function NoOrgPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-cobalt">Kein Zugang</h1>
        <p className="text-gray-600 mt-2">
          Dein Konto ist noch keiner Organisation zugeordnet. Bitte wende dich an dein Team.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Build-Check**

Run: `pnpm exec tsc --noEmit`
Erwartet: Keine Fehler.

- [ ] **Step 4: Manuell verifizieren — Login & Allowlist**

Run: `docker compose up -d && pnpm dev` (db + mail laufen)
- `http://localhost:3000/login` öffnen.
- **Provisionierte** E-Mail (geseedet) eingeben → in Mailpit (`http://localhost:8025`) erscheint ein Magic-Link → klicken → eingeloggt (Redirect zu `/projects`, das in Task 10 entsteht; bis dahin 404 ist ok).
- **Unbekannte** E-Mail (z. B. `fremd@example.com`) eingeben → in Mailpit erscheint **kein** Link.

Erwartet: Nur provisionierte Adressen erhalten einen Link.

- [ ] **Step 5: Commit**

```bash
git add src/app/login src/app/no-org
git commit -m "feat: login and no-org pages with allowlist messaging"
```

---

## Task 10: Projekt-UI — Liste, Anlage (Server Action), Detail

**Files:**
- Create: `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/new/action.ts`, `src/app/(app)/projects/new/new-project-form.tsx`, `src/app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Server Action „Projekt anlegen"**

`src/app/(app)/projects/new/action.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/require-session";
import { createProjectSchema } from "@/server/projects/projects.schema";
import { createProject } from "@/server/projects/projects.service";

export type CreateProjectState = { error?: string };

export async function createProjectAction(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await requireSession();
  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    projectNo: formData.get("projectNo") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" };
  }
  const project = await createProject(session.orgId, parsed.data);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
```

- [ ] **Step 2: Formular-Komponente (Client)**

`src/app/(app)/projects/new/new-project-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { createProjectAction, type CreateProjectState } from "./action";

const initial: CreateProjectState = {};

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3 max-w-md">
      <input name="name" placeholder="Projektname" className="border rounded p-2" required />
      <input name="address" placeholder="Adresse (optional)" className="border rounded p-2" />
      <input name="projectNo" placeholder="Projekt-Nr. (optional)" className="border rounded p-2" />
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-cobalt text-white rounded p-2 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Projekt anlegen"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Projektliste-Seite**

`src/app/(app)/projects/page.tsx`:
```tsx
import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";
import { listProjects } from "@/server/projects/projects.service";
import { NewProjectForm } from "./new/new-project-form";

export default async function ProjectsPage() {
  const session = await requireSession();
  const projects = await listProjects(session.orgId);

  return (
    <main className="p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-cobalt">Projekte</h1>
      <section>
        <h2 className="text-lg font-medium mb-2">Neues Projekt</h2>
        <NewProjectForm />
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">Bestehende Projekte</h2>
        {projects.length === 0 ? (
          <p className="text-gray-500">Noch keine Projekte.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="text-cobalt underline">
                  {p.name}
                </Link>
                {p.address && <span className="text-gray-500"> — {p.address}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Projekt-Detail-Shell**

`src/app/(app)/projects/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/require-session";
import { getProject } from "@/server/projects/projects.service";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProject(session.orgId, id);
  if (!project) notFound();

  return (
    <main className="p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-cobalt">{project.name}</h1>
      {project.address && <p className="text-gray-600">{project.address}</p>}
      <p className="text-gray-500">
        Erfassung (Sprachnotizen &amp; Fotos) und Export folgen in Plan 2 &amp; 3.
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Build-Check**

Run: `pnpm exec tsc --noEmit`
Erwartet: Keine Fehler.

- [ ] **Step 6: Manuell verifizieren — voller Flow**

Run: `pnpm dev` (db + mail laufen)
- Mit provisionierter E-Mail einloggen (Magic-Link aus Mailpit) → landet auf `/projects`.
- Projekt „Wohnbau Lindengasse" anlegen → erscheint in Liste, Redirect auf Detailseite mit Projektname.
- Leeren Namen absenden → Fehlermeldung „Name erforderlich".

Erwartet: Anlegen, Auflisten, Detail, Validierung funktionieren.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/projects"
git commit -m "feat: projects list, create action, and detail shell"
```

---

## Task 11: Volltest & Abschluss Plan 1

- [ ] **Step 1: Alle Tests grün**

Run: `pnpm test`
Erwartet: Alle Suites (projects.service, projects.schema, provisioning) PASS.

- [ ] **Step 2: Typecheck & Lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Erwartet: Keine Fehler.

- [ ] **Step 3: Abschluss-Commit (falls offen)**

```bash
git add -A
git commit -m "chore: finalize plan 1 foundation" || echo "nothing to commit"
```

---

## Self-Review-Notiz (für Reviewer dieses Plans)

- **Spec-Abdeckung Plan 1:** Auth/Team-Modell inkl. **Allowlist** gegen Self-Signup (Spec §2 „Auth & Team-Modell" — manuell provisioniert, kein Self-Service); Datenmodell vollständig migriert (Spec §5 — Note/Photo/Report bereits angelegt, damit Plan 2/3 ohne Schema-Bruch aufsetzen); Projekte anlegen/auflisten/öffnen (Spec §3 Schritt 1); Org-Scoping (alle Org-Nutzer sehen alle Projekte); Eingabevalidierung (Spec §9).
- **Async-Jobs (Spec §4):** Entscheidung **Inngest** dokumentiert; Env-Vars reserviert; Implementierung bewusst in Plan 2 (erst dort gebraucht).
- **Versionen:** Next 16 (Turbopack default, kein `--no-turbopack`), Tailwind v4 (Markenfarben via CSS-`@theme`, kein `tailwind.config.ts`). Verifiziert gegen aktuelle Next/Tailwind-Docs (Stand Juni 2026).
- **Reihenfolge:** Auth-Seiten (Task 9) **vor** Projekt-UI (Task 10); manuelle Verifikation in Task 9 testet Login + Allowlist eigenständig, Task 10 den vollen Flow.
- **Reproduzierbarer Login:** Mailpit ist Teil von `docker-compose.yml` (kein ad-hoc `docker run`).
- **Typkonsistenz:** `createProject/listProjects/getProject`, `requireSession(): {userId,orgId,email}`, `isProvisionedEmail(email): Promise<boolean>` durchgängig identisch verwendet. E-Mails überall lowercased (Seed, Allowlist, Guard).
- **Bewusst NICHT in Plan 1:** Sprachnotizen/STT, Fotos, Export/PDF, PWA, Inngest-Implementierung, E2E — Pläne 2–4.
