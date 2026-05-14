# ABC Buddy — Agent Reference

## What This App Is

ABC Buddy is a Progressive Web App (PWA) for **Animal Birth Control (ABC)** dog welfare field teams. Staff use it on phones to photograph stray dogs at catch time, capture GPS, generate an AI description, and assign a unique Dog ID. The same record tracks release — location, distance, photo. Managers view aggregate records, build release plans, and export reports.

Operated by Peepaal Farm (`peepalfarm.org`). All dates/times display in **IST (Asia/Kolkata)**.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui (Radix) |
| Backend | Express.js + tRPC + Drizzle ORM + MySQL |
| AI | Vercel AI SDK — Manus Forge API by default; direct OpenAI when `USE_OPENAI=true` |
| Storage | Google Cloud Storage (GCS) — public-read bucket |
| Auth | Cookie-based JWT (jose) + OAuth provider |
| Package manager | pnpm |
| Tests | vitest |

---

## Repo Layout

```
client/            React PWA
  src/
    pages/         AddRecord, Home, Lookup, LoginPage, ReleasePlanPage, SettingsPage, ConfigPage
    components/    Shared UI — AIChatBox, Map, RecordDetailModal, PendingBars, etc.
    hooks/         useOfflineQueue, useFileUpload, useRecordCache, useReleasePlanCache, …
    contexts/      TeamContext (staffSession), ThemeContext
    lib/           annotateAndShare, resizeImage, appLog, trpc, utils

server/
  _core/           Framework glue — index.ts (entry), trpc.ts, context.ts, env.ts,
                   oauth.ts, notification.ts, storage helpers
  db.ts            All Drizzle DB query functions
  routers.ts       Main tRPC router (all app procedures)
  ingest.ts        POST /api/ingest — programmatic dog record creation
  stops.ts         GET  /api/stops  — catch/release stops for external route planner
  exports.ts       GET  /api/export/json|docx|photos — filtered record exports
  tools.ts         GET  /api/tools/export-json|export-csv|migrate-images — admin ops
  storage.ts       GCS storagePut / storageGet
  pdf.ts           Per-dog DOCX generation (GET /api/record/:dogId/docx)

shared/
  types.ts         Re-exports drizzle schema types + core errors
  const.ts         Shared constants (e.g. COOKIE_NAME)

drizzle/
  schema.ts        MySQL table definitions (source of truth for types)
  *.sql            Migration files managed by drizzle-kit

scripts/           One-off admin scripts (backup-db-to-gcs, migrate-images-to-gcs, …)
references/        AI SDK docs snippets
```

---

## Database Schema (key tables)

| Table | Purpose |
|---|---|
| `dog_records` | Core record: dogId, image URLs, GPS, AI description, release data, soft-delete |
| `release_plans` | A scheduled batch release (date + team + order index) |
| `release_plan_dogs` | Join: which dogs are in which plan, with sort order |
| `team_settings` | Per-team config: DOCX template URL, release-far threshold (default 200 m) |
| `users` | OAuth users with role (user / admin) |
| `login_attempts` | Rate-limit tracking |
| `blocked_ips` | IP block list |

**dogId format**: `YYYYMMDDP-NNN` where P is the team identifier letter (A–E) and NNN is a 3-digit sequential suffix. Example: `20260513A-001` = date 2026-05-13, team A, dog 001. The counter resets per team per day.

---

## API Surface

### tRPC (`/api/trpc`) — main app API
All procedures are in `server/routers.ts`. Auth is via session cookie; sensitive procedures check `ctx.user`.

Key procedure namespaces:
- `dogs.*` — create, list, update, delete dog records; save release data
- `airtable.*` — login, refreshSession, checkIpBlock (Airtable-backed auth)
- `releasePlan.*` — CRUD for release plans and plan membership
- `team.*` — team settings (DOCX template, releaseFarThreshold)

### REST endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/ingest` | `TOOLS_SECRET` | Programmatic dog record creation from external devices |
| GET | `/api/stops` | `TOOLS_SECRET` | Catch+release stops for a staff/date (route planner integration) |
| GET | `/api/export/json` | session cookie | Filtered records as JSON download |
| GET | `/api/export/docx` | session cookie | Filtered records as merged DOCX |
| GET | `/api/export/photos` | session cookie | Filtered annotated photos as ZIP |
| GET | `/api/record/:dogId/docx` | session cookie | Single dog DOCX |
| GET | `/api/tools/export-json` | `TOOLS_SECRET` | Full DB dump to GCS |
| GET | `/api/tools/export-csv` | `TOOLS_SECRET` | Full DB as CSV ZIP to GCS |
| GET | `/api/tools/migrate-images` | `TOOLS_SECRET` | Migrate old images to GCS (add `?dryRun=true` for preview) |
| GET | `/api/version` | none | Build timestamp for update detection |

**`TOOLS_SECRET` auth**: pass as `?secret=` query param or `X-Tools-Secret` header.

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | MySQL connection string |
| `JWT_SECRET` | Yes | Cookie signing key |
| `OAUTH_SERVER_URL` | Yes | OAuth provider base URL |
| `OWNER_OPEN_ID` | Yes | Grants admin role automatically |
| `TOOLS_SECRET` | Yes | Shared secret for ingest/stops/tools endpoints |
| `GCS_SERVICE_ACCOUNT_JSON` | Yes | Full GCS service account JSON (stringified) |
| `GCS_BUCKET_NAME` | Yes | e.g. `photos.abc.peepalfarm.org` |
| `BUILT_IN_FORGE_API_URL` | Default AI | Manus Forge API base URL |
| `BUILT_IN_FORGE_API_KEY` | Default AI | Manus Forge API key |
| `OPENAI_API_KEY` | When USE_OPENAI=true | Direct OpenAI key |
| `USE_OPENAI` | No | Set to `"true"` to use direct OpenAI instead of Forge |
| `VITE_APP_ID` | Yes | App identifier |
| `VITE_DEFAULT_WEBHOOK_URL` | No | Default webhook for ingest notifications |

---

## Key Patterns & Conventions

### Image pipeline
1. Staff captures photo (camera or upload)
2. Client resizes to ≤ 1600 px (`resizeImage.ts`)
3. EXIF GPS extracted (`exifreader`, `piexifjs`)
4. Image annotated with dog ID + date/time/location strip (`annotateAndShare.ts`, uses `sharp` on server)
5. Uploaded to GCS via `storagePut` — returns public `https://storage.googleapis.com/…` URL
6. `originalImageUrl` = pre-annotation; `imageUrl` = annotated version

### Offline queue
`useOfflineQueue.ts` persists pending records to IndexedDB. A `BroadcastChannel` (`QUEUE_CHANNEL_NAME`) coordinates between tabs. Records are retried when connectivity returns.

### AI description
Both `/api/ingest` and the tRPC `dogs.create` flow call `generateText` with a vision prompt via the Vercel AI SDK. Failures are non-fatal — the record saves without a description.

### Release distance
`releaseDistanceMetres` is computed as Haversine distance between catch GPS and release GPS. Records flagged `releasedFar = true` when distance > team's `releaseFarThreshold` (default 200 m).

### Team letter in dogId
`CATCH_PLANS` = Alpha/Beta/Charlie/Delta/Echo (A–E). The selected letter is a **team identifier** embedded in the dogId (e.g. `20260513A-001` = date + team A + dog 001). Stored in localStorage. Allows multiple teams/vans working the same day to generate non-colliding IDs without a server round-trip.

### Auth flow
1. Login: email + password → `airtable.login` tRPC mutation → checks Airtable → issues JWT cookie + returns `StaffSession`
2. `StaffSession` stored in localStorage; checked by `getStaffSession()` on app load
3. Server reads cookie in `createContext` → populates `ctx.user` for protected procedures
4. IP blocking: >5 failed attempts in 15 min → auto-block

---

## Running Locally

```bash
pnpm install
pnpm dev          # starts Express + Vite dev server
pnpm test         # vitest unit tests
pnpm check        # TypeScript type check
pnpm db:push      # generate + run drizzle migrations
```

---

## Testing

Test files live in `server/*.test.ts`. Coverage areas:
- `auth.logout.test.ts` — logout clears cookie
- `dogs.test.ts` — dog record CRUD
- `gcs.storage.test.ts` — GCS integration
- `geocoding.test.ts` — reverse geocoding
- `ingest.test.ts` — /api/ingest validation + auth
- `tools.secret.test.ts` — TOOLS_SECRET enforcement on all three admin endpoints
- `use-openai.flag.test.ts` — USE_OPENAI branching
- `env-defaults.test.ts` — env var defaults
- `openai.key.test.ts` — OpenAI key presence

Run a single test file: `pnpm vitest run server/ingest.test.ts`

---

## Settled Decisions

- **Auth**: Airtable is the sole source of truth for staff credentials. The MySQL `users` table tracks OAuth-linked sessions but login always validates against Airtable.
- **dogId format**: Only `YYYYMMDDP-NNN` (with team letter) is used. The legacy `YYYYMMDD-NNN` format is obsolete — do not generate or expect it.
- **`exports.ts` vs `tools.ts`**: `exports.ts` = filtered user-facing downloads (JSON, DOCX, photos ZIP). `tools.ts` = admin backup to GCS (full DB dump, CSV ZIP, image migration) — `TOOLS_SECRET` required.

## What to Ask the Human

Before starting non-trivial work, clarify:
- **Team identifier** if the task is team-specific (e.g. `bold-otter`)
- **Which AI provider** is active (`USE_OPENAI` flag) if touching AI paths
- **GCS bucket name** if touching storage or migration scripts
- **Whether a DB migration is needed** — `pnpm db:push` must be run after schema changes
