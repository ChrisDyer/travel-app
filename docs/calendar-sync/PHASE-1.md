# Phase 1 — Foundation: migration, OAuth, token + calendar helpers

## Goal

After this phase, the user can connect their Google account for Calendar access, and the app can (a) obtain a valid access token on demand (refreshing when expired) and (b) find-or-create the secondary **"Travel"** calendar. No event syncing yet.

## Prerequisites

- Read `docs/calendar-sync/ARCHITECTURE.md` completely.
- Read `AGENTS.md` (repo root) and consult `node_modules/next/dist/docs/` for route-handler conventions before writing routes.
- The user must have completed the Google Cloud console steps (Calendar API enabled, redirect URI added — see PROMPT.md "Manual setup"). If the consent flow fails with `redirect_uri_mismatch` or `access_denied`, that setup is the likely cause — tell the user rather than debugging code.

## Read first (templates to clone)

- `src/app/api/gmail/auth/route.ts` — clone nearly verbatim.
- `src/app/api/gmail/callback/route.ts` — clone nearly verbatim (token exchange + upsert).
- `src/app/api/trips/[tripId]/assistant/suggest/route.ts` lines ~166–183 (`refreshGmailToken`) and ~324–337 (expiry-check-then-refresh call pattern).
- `src/db/migrations.ts` — the existing entries and `runMigrations`.
- `src/db/index.ts` — `db`, `camelize` helpers, how the DB is opened.

## Work items

### 1. Migration `004_google_calendar` in `src/db/migrations.ts`

Append a new `{ name: '004_google_calendar', sql: \`...\` }` entry containing **exactly** the DDL from ARCHITECTURE.md § "Data model" (three CREATE TABLEs, one CREATE INDEX, four ALTER TABLE ADD COLUMN on `trips`).

Gotchas:
- `db.exec` handles multiple statements in one string (see `001_initial_schema`), and SQLite requires one `ALTER TABLE ... ADD COLUMN` per statement — the migration string has four separate ALTERs.
- Migrations run on DB import: a syntax error bricks `npm run dev`. Test immediately after writing (start dev server, watch for errors).
- Never modify the existing three migration entries.

### 2. Trip type additions in `src/types/travel.ts`

Add to the `Trip` interface:

```ts
calendarSyncEnabled: boolean;
timezone: string | null;
calendarLastSyncedAt: string | null;
calendarSyncError: string | null;
```

Check how existing INTEGER-backed booleans (e.g. `digestEnabled`, `rentalCarNeeded`) are typed/handled through `camelize` and follow the same pattern (SQLite stores 0/1).

### 3. `src/lib/calendar/google.ts`

The Google API layer, per ARCHITECTURE.md § "Google API layer". Contents:

```ts
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
export class CalendarAuthError extends Error {}

export interface CalendarTokens { /* camelized calendar_tokens row */ }

export function getCalendarTokens(userId: string): CalendarTokens | null;
export async function getCalendarAccessToken(userId: string): Promise<string>;
export async function ensureTravelCalendar(userId: string, accessToken: string): Promise<string>;
export async function insertEvent(accessToken: string, calendarId: string, payload: unknown): Promise<{ id: string }>;
export async function patchEvent(accessToken: string, calendarId: string, eventId: string, payload: unknown): Promise<void>;
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
```

Implementation notes:
- `getCalendarAccessToken`: read the `calendar_tokens` row; if missing or `needs_reauth = 1` throw `CalendarAuthError`. If `expires_at` is within 60 s of now, refresh: `POST https://oauth2.googleapis.com/token` with `client_id: process.env.GOOGLE_GMAIL_CLIENT_ID`, `client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET`, `refresh_token`, `grant_type: 'refresh_token'` (form-encoded — copy `refreshGmailToken`). Update `access_token`, `expires_at`, `updated_at` in the row. If the refresh response contains `error: 'invalid_grant'` (or 400/401): set `needs_reauth = 1` and throw `CalendarAuthError('Reconnect Google Calendar')`.
- `ensureTravelCalendar`: return cached `google_calendar_id` from the token row if set. Else `GET https://www.googleapis.com/calendar/v3/users/me/calendarList` with the bearer token, following `nextPageToken` until exhausted; find `items[]` entry with `summary === 'Travel'`. If none, `POST https://www.googleapis.com/calendar/v3/calendars` with body `{"summary":"Travel"}`. Persist the resulting id into `calendar_tokens.google_calendar_id` and return it.
- A private `calendarFetch(accessToken, url, init)` helper: sets `Authorization: Bearer`, `Content-Type: application/json` when there's a body; on non-OK, parse the JSON error body and throw an `Error` whose message includes status + Google's `error.message`. Give the thrown error a `status` property (used by Phase 3 for 404/410 handling).
- `deleteEvent`: treat response status 404 and 410 as success (return normally).
- Keep everything in plain `fetch`; do not add npm dependencies.

### 4. OAuth + status routes

Create four route files (clone gmail auth/callback and adapt):

**`src/app/api/calendar/auth/route.ts`** — differences from the Gmail clone:
- `SCOPES = 'https://www.googleapis.com/auth/calendar'` (import `CALENDAR_SCOPE` from the lib).
- `STATE_COOKIE = 'calendar_oauth_state'`.
- `redirect_uri: ${NEXT_PUBLIC_APP_URL}/api/calendar/callback`.
- Keep `access_type=offline`, `prompt=consent` (required to guarantee a refresh_token), CSRF nonce + httpOnly cookie, `sanitizeReturnTo`.

**`src/app/api/calendar/callback/route.ts`** — clone gmail/callback:
- Validate state against the `calendar_oauth_state` cookie; exchange the code at `https://oauth2.googleapis.com/token` with the calendar redirect URI.
- Upsert into `calendar_tokens` (same `ON CONFLICT(user_id) DO UPDATE` + `COALESCE(excluded.refresh_token, calendar_tokens.refresh_token)` pattern), and set `needs_reauth = 0` on update.
- After storing tokens, best-effort (try/catch, log-and-continue): call `ensureTravelCalendar`. (Phase 3 adds a `cleanupOrphanLinks` call here — leave a `// Phase 3: cleanupOrphanLinks` comment.)
- Redirect to `returnTo` with `?calendarConnected=1`.

**`src/app/api/calendar/status/route.ts`** — GET, wrapped in `withErrorHandling` (see `src/lib/api-helpers.ts`): return `{ connected, needsReauth, calendarId }` from the `calendar_tokens` row (`connected: !!row && !row.needsReauth`).

**`src/app/api/calendar/disconnect/route.ts`** — POST:
1. Best-effort revoke: `POST https://oauth2.googleapis.com/revoke?token={refresh_token || access_token}` (ignore failures).
2. `DELETE FROM calendar_tokens WHERE user_id = ?`.
3. `DELETE FROM calendar_event_links WHERE user_id = ?`.
4. `UPDATE trips SET calendar_sync_enabled = 0 WHERE user_id = ?`.
5. Return `{ ok: true }`. (Google events are intentionally left on the calendar — see ARCHITECTURE.md edge cases.)

## Definition of done / verification

1. `npm run dev` starts cleanly (migration applied). Confirm: `npx tsx -e "..."` or a quick sqlite query — `SELECT name FROM schema_migrations` includes `004_google_calendar`; `PRAGMA table_info(trips)` shows the four new columns.
2. Visit `http://localhost:3000/api/calendar/auth?returnTo=/trips` in a browser → Google consent screen shows the Calendar scope → after consent, redirected to `/trips?calendarConnected=1`.
3. `calendar_tokens` has one row for user `local` with a non-null `refresh_token` and `google_calendar_id` set.
4. A calendar named **Travel** exists at calendar.google.com (created if it didn't exist; found if it did — test by deleting the row's `google_calendar_id` and re-running the callback logic or calling `ensureTravelCalendar` from a scratch script).
5. `GET /api/calendar/status` → `{ "connected": true, "needsReauth": false, "calendarId": "..." }`.
6. `POST /api/calendar/disconnect` → tokens row gone, status shows `connected: false`. Reconnect afterwards (the sync phases need a live connection).
7. `npx tsc --noEmit` and `npm run lint` pass.

Commit with a message describing the phase.
