# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

Two independent applications:

- **`src/`** — .NET 10 console app that authenticates via OIDC and bulk-creates SuperOffice CRM entities using `SuperOffice.WebApi` and `Bogus` for fake data.
- **`websrc/`** — Next.js 14 App Router web application for browser-based provisioning. This is the active development surface.

---

## Web Application (`websrc/`)

### Commands

```bash
cd websrc

npm install
npx prisma migrate dev      # creates/migrates SQLite DB (first-time setup)
npm run dev                 # dev server at http://localhost:3000

npm run build               # production build
npm run lint                # ESLint
npm run typecheck           # tsc --noEmit (no emit, type-check only)

npx prisma studio           # browse the SQLite DB in browser
npx prisma migrate dev      # apply new migrations after schema changes
```

### Environment Setup

Copy `.env` to `.env.local` and fill in:

```env
SUPEROFFICE_CLIENT_ID=
SUPEROFFICE_CLIENT_SECRET=
DATABASE_URL="file:./storage/app.db"
AUTH_SECRET=                          # random 32-char string
AUTH_URL=http://localhost:3000
SUPEROFFICE_ISSUER=https://sod.superoffice.com   # defaults to SOD environment
SUPEROFFICE_PRIVATE_KEY=              # RSA private key — required for mass-ops mode only
```

The SuperOffice app (registered at dev.superoffice.com) must include redirect URI `http://localhost:3000/api/auth/callback/superoffice`.

---

### Architecture

```
Browser → Middleware (auth guard) → Next.js Pages
                                        ├─ Server Actions (lib/services.ts → lib/storage.ts → Prisma/SQLite)
                                        └─ SSE Route (/api/jobs/[id]/stream) → lib/mass-ops.ts → SuperOffice Web API
```

**Key files:**

| File | Purpose |
|------|---------|
| `lib/types.ts` | All shared TypeScript types — `EntityDefinition`, `TemplateDefinition`, `JobManifest`, `JobPhaseEvent` |
| `lib/storage.ts` | Prisma read/write layer; handles v1→v2 template schema migration at read time |
| `lib/services.ts` | Business logic (server-only) — CRUD for templates and jobs |
| `app/actions.ts` | Next.js server actions; validates input with Zod before calling services |
| `lib/mass-ops.ts` | Execution engine — `executeJob()` dispatches to entity-agent or mass-ops path |
| `lib/entity-schema.ts` | `EntitySchema` definitions for the 5 builtin types + `topoSort()` for dependency ordering |
| `lib/superoffice-client.ts` | Factory functions that create typed SuperOffice agent instances |
| `lib/system-user.ts` | System user ticket generation for mass-ops mode |
| `lib/metadata.ts` | Cached SuperOffice metadata (categories, countries, sale types, etc.) |
| `app/api/jobs/[id]/stream/route.ts` | SSE route — opening this page starts job execution |

**Data model (Prisma/SQLite):**
- `Template` — stores `entities` as JSON (`EntityDefinition[]`, schemaVersion 2)
- `Job` — stores `locales`, `requestedCounts`, `metrics`, `items`, `phases` all as JSON strings

---

### Execution Engine

Jobs are created with status `queued` and only begin executing when the job detail page is opened (which opens the SSE stream at `/api/jobs/[id]/stream`).

Two execution modes:
- **entity** — uses `ContactAgent`, `PersonAgent`, etc. Works with any OIDC access token. Concurrency = 5.
- **massops** — uses `DatabaseTableAgent.insertAsync` in 500-row batches. Requires System Design access and `SUPEROFFICE_PRIVATE_KEY`. Only supports builtin types plus custom table entities.

Entities within a template run in **topological order** driven by `dependsOn`. Non-company entity counts are multiplied by the number of inserted company IDs (i.e., N contacts *per company*).

**Template schema versioning:** v1 templates stored `TemplateEntitySettings[]` (field `entityType`). v2 stores `EntityDefinition[]` (field `name` + optional `builtinType`). The `normalizeEntities()` function in `lib/storage.ts` upgrades v1→v2 transparently at read time.

---

## Console Application (`src/`)

```bash
cd src
# Edit appsettings.json with SUPEROFFICE_CLIENT_ID / SUPEROFFICE_CLIENT_SECRET
dotnet build
dotnet run
```

Requires a redirect URI of `^http://127.0.0.1:\d{4,10}$` in the SuperOffice app registration (loopback OIDC flow).
