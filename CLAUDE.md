# Baudoku — KI-Mitarbeiter-Plattform

KI-Baudokumentation für Architektur-/Baubüros. Nutzer wählen am Dashboard einen
**KI-Mitarbeiter** (Coworker). Aktiv ist **Franz** (Baudokumentation): Sprachnotizen +
Fotos erfassen → KI erzeugt einen PDF-Bericht. Mira/Theo sind Platzhalter (`comingSoon`).

## Stack
Next.js 16 (App Router) · TypeScript · Prisma/PostgreSQL · Inngest (Hintergrundjobs) ·
NextAuth (Google, E-Mail-Allowlist) · Tailwind · Vitest · pnpm. Lokales Whisper für
Transkription, Anthropic SDK für die Berichtserstellung.

**Mandantenfähig:** eine geteilte SaaS-Instanz, ein Tenant = eine `Organization` (`orgId`).
Alles ist org-scoped; die Tenant-Grenze wird in der **Service-Schicht** erzwungen
(Defense-in-Depth), nicht nur in Routen.

## Kernarchitektur: modulare KI-Mitarbeiter

Modular Monolith. Jeder Mitarbeiter ist ein **gekapseltes Modul** unter `src/coworkers/<id>/`
mit einem **Manifest**, registriert in einer zentralen Registry, pro Organization per
DB-Config freischalt- und anpassbar. Ein Build, Komposition zur Laufzeit.

**Leitsatz:** Eine Kundenanpassung ist ein Flag + eine Config-Zeile — niemals ein Code-Branch.

Fundament unter `src/coworkers/`:
- `types.ts` — `CoworkerManifest`-Port (id, lifecycle, configSchema, defaultConfig, …).
- `registry.ts` · `index.ts` — Module registrieren sich; `index.ts` ist die einzige Lade-/Re-Export-Stelle.
- `resolve.ts` — löst pro Org die **Verfügbarkeit** und die **effektive Config** auf.
- `guard.ts` — `requireAvailable` / `isAvailable` für Routen & Layouts.
- `validate.ts` — Startup-Check: jeder Default muss sein Schema erfüllen.

**Drei orthogonale Zustände** (nie vermischen):
- `lifecycle` (`active` | `comingSoon`) — Code-Reifegrad; `comingSoon` ist nie freischaltbar.
- **Entitlement** (`OrgModule.enabled`, pro Org in der DB) — hat dieser Kunde den Mitarbeiter?
- **Kill-Switch** (`DISABLED_COWORKERS` env, global) — Notabschaltung.

`getResolvedCoworker(orgId, id)` kombiniert sie zu `availability`; Config wird nur bei
`available` aufgelöst (`deepMerge(defaults, OrgModule.config)`, Zod-validiert, versioniert
über `configVersion`/`configMigrations`).

**Gating = Defense-in-Depth:** Das Page-Layout ist KEIN Sicherheits-Gate. Jede Franz-API,
Server Action, Datei-Download UND jeder Inngest-Job prüft eigenständig die Verfügbarkeit.
Beim Hinzufügen eines Coworker-Endpunkts: immer am Anfang `isAvailable(orgId, id)` (Routen)
bzw. `requireAvailable` (Layouts) setzen.

**Hintergrundjobs** (Transkription, Bericht) sind idempotent (terminale Zustände = No-op),
brechen bei nicht verfügbarem Coworker kontrolliert auf `cancelled` ab (statt auf `pending`
zu hängen) und arbeiten mit einem **Config-Snapshot** vom Enqueue-Zeitpunkt (reproduzierbare
Retries). Retry beansprucht den Übergang `failed|cancelled → pending` **atomar**
(`claim*ForRetry`), um Doppel-Jobs zu vermeiden.

**Grenzen:** `pnpm lint:boundaries` (dependency-cruiser) verbietet, dass ein Coworker-Modul
in die Interna eines anderen greift.

### Einen neuen Mitarbeiter hinzufügen
1. `src/coworkers/<id>/manifest.ts` (+ `config.ts` bei Anpassbarkeit) anlegen.
2. In `src/coworkers/index.ts` registrieren.
3. UI unter `src/app/(app)/c/<id>/` mit Guard-Layout; Backend gaten wie oben.
4. Pro-Org via `OrgModule`-Row freischalten (siehe Seed). Exklusiv = `enabledByDefault: false` + Row nur für eine Org.

Franz ist die Referenz-Implementierung: `src/coworkers/franz/` (Manifest, Config, `server/`).
Geteilte Primitive bleiben unter `src/server/` (`auth`, `db`, `log`, `storage`, `projects`).

## Befehle
- `pnpm dev` — App · `pnpm dev:inngest` — Job-Worker · `pnpm dev:whisper` — Transkription
- `pnpm test` (Vitest; DB-Tests brauchen Postgres) · `pnpm exec tsc --noEmit`
- `pnpm db:test:migrate` — Test-DB migrieren · `pnpm seed:coworkers` — Franz für bestehende Orgs freischalten
- `pnpm lint` · `pnpm lint:boundaries`

Nach Schema-Änderungen: `pnpm prisma migrate dev` und `pnpm db:test:migrate`, sonst schlagen DB-Tests fehl.

## Konventionen
- TDD: Test zuerst, kleine Schritte, häufige Commits. Tests liegen neben dem Code (`*.test.ts`).
- Jede DB-Abfrage org-scoped (`project: { orgId }` o. Ä.). Fehler nicht still verschlucken — loggen (`@/server/log`).
- Code-Stil regeln Linter/Formatter, nicht diese Datei.

## Vertiefung
- Architektur-Spec: `docs/superpowers/specs/2026-06-14-modular-coworker-architecture-design.md`
- Umsetzungsplan: `docs/superpowers/plans/2026-06-14-modular-coworker-architecture.md`
