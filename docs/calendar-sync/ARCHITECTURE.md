# Google Calendar Sync — Architecture

Shared context for all implementation phases. **Read this file completely before starting any phase.** Also read `AGENTS.md` at the repo root — this project uses a Next.js version with breaking changes; consult `node_modules/next/dist/docs/` before writing route handlers or pages.

## Goal

Push select itinerary items from this travel app to the user's Google Calendar:

- An **all-day event spanning the trip dates** (when the trip's sync toggle is on).
- Every booking with `bookingStatus === 'confirmed'` (flights, hotels, rental cars, parking, transit, day events).
- **Per-item manual overrides**: `include` forces a non-confirmed item onto the calendar; `exclude` keeps a confirmed item off it.

Full lifecycle: creating, editing, or deleting anything in the app — including status changes, trip date changes, toggling sync off, deleting the trip, or disconnecting Google — must be reflected on the calendar. The app is the **source of truth**; we never watch for changes made directly in Google Calendar.

Events go to a dedicated secondary calendar named **"Travel"** that the app finds or creates. The app never writes to the user's primary calendar.

## The app (facts you must respect)

- Next.js App Router, TypeScript, **better-sqlite3** (synchronous, raw SQL, no ORM). DB file `local.db` at repo root.
- Single user: `getUserId(request)` in `src/lib/auth.ts` always returns `'local'`. Always scope queries by `user_id` anyway (existing convention).
- **Migrations**: `src/db/migrations.ts` exports a `migrations` array of `{ name, sql }`. The runner (`runMigrations`, called on every import of `src/db/index.ts`) applies unapplied entries in order, tracked in `schema_migrations`. To change schema, **append a new entry** — never edit an applied one. A broken migration bricks app startup, so test immediately.
- DB rows are snake_case; `camelize`/`camelizeAll` from `src/db/index.ts` convert to camelCase TS objects. Types live in `src/types/travel.ts`.
- **All dates are TEXT**: dates `'YYYY-MM-DD'`, times `'HH:MM'` (24h), times nullable (null time = all-day/untimed). **No timezone is stored** (until this project adds a trip-level one). Date-math convention (see `src/lib/dates.ts` header comment): never `new Date('YYYY-MM-DD')` then `.toISOString()` — anchor date-only strings at UTC (`+ 'T00:00:00Z'` or noon) to avoid day-shift.
- All mutations are REST route handlers under `src/app/api/trips/...`, wrapped in `withErrorHandling` from `src/lib/api-helpers.ts`. There is **no background-job / cron / queue infrastructure** — sync must be driven from these handlers.
- No test infrastructure. Verification = `npm run dev` + manual/curl checks + `npx tsc --noEmit` + `npm run lint`.

### Existing code to clone / reuse

| What | Where |
|---|---|
| Google OAuth consent-URL route (CSRF state nonce + httpOnly cookie, `access_type=offline`, `prompt=consent`, sanitized `returnTo`) | `src/app/api/gmail/auth/route.ts` |
| OAuth callback (code exchange at `oauth2.googleapis.com/token`, upsert tokens with `ON CONFLICT(user_id) DO UPDATE`, `COALESCE` preserves refresh_token) | `src/app/api/gmail/callback/route.ts` |
| Token-refresh pattern (`grant_type=refresh_token`, update row, return new access token) | `refreshGmailToken()` in `src/app/api/trips/[tripId]/assistant/suggest/route.ts` (~lines 166–183; call pattern ~324–337) |
| Event normalization for all six booking types (all-day vs timed, exclusive end dates, stable UIDs) | `src/app/api/trips/[tripId]/export/route.ts` (.ics export) |
| Per-trip opt-in toggle UI pattern (`digestEnabled` checkbox) | `src/components/trips/TripEditForm.tsx` |
| Trip overflow menu (has "Export to calendar") | `src/components/trips/TripMoreMenu.tsx` |
| Per-item detail drawer with Edit/Delete footer | `src/components/itinerary/BookingDetailSheet.tsx` |
| Toasts | `import { toast } from '@/components/ui/toast'; toast('msg')` / `toast('msg', 'error')` |

Env vars reused as-is: `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`. **No new env vars.**

## Core design: a declarative per-trip reconciler

We never track "what changed". After **any** mutation, the route handler awaits one function:

```ts
// src/lib/calendar/sync.ts
export async function syncTripCalendar(userId: string, tripId: string): Promise<void>
// NEVER throws — all errors are caught inside and recorded on the trip row.
```

The reconciler:

1. **No-op guards**: no `calendar_tokens` row, or `needs_reauth = 1` → return silently (users who never connected are unaffected).
2. **Desired state**: load the trip + all six entity tables + overrides. If the trip exists AND `calendar_sync_enabled = 1`, build the list of `CalendarItem`s (trip-span + entities; round-trip flight = 2 items) and filter: keep item iff `override === 'include'` OR (`bookingStatus === 'confirmed'` AND `override !== 'exclude'`). Trip-span item is desired iff the toggle is on. If the trip doesn't exist or the toggle is off, desired = ∅.
3. **Recorded state**: `SELECT * FROM calendar_event_links WHERE trip_id = ?`.
4. **Diff and act** (sequentially, collecting the first error but continuing where safe):
   - Desired, no link → **insert** Google event → insert link row.
   - Link exists, fingerprint differs → **patch** Google event; on 404/410, insert a new event instead and update the link's `google_event_id`. Update link fingerprint.
   - Link exists, not desired → **delete** Google event (404/410 counts as success) → delete link row.
   - Fingerprint equal → skip (zero API calls). A no-change reconcile costs zero Google requests.
5. **Record outcome** (only if the trip row still exists): `UPDATE trips SET calendar_last_synced_at = <now ISO>, calendar_sync_error = <message or NULL>`.

Why this shape:

- **One function covers every lifecycle case**: item create/edit/delete, booking-status change, trip date change, toggle on/off, override change, trip deletion, bulk assistant-apply.
- **Awaited, not fire-and-forget**: Next.js may tear down handlers after the response resolves; fire-and-forget fetches are unreliable. A trip syncs in a handful of calls (~0.5–2 s worst case) — fine for a single-user local app. Google failures must **never** fail the app mutation.
- **Failure = stale, self-healing**: a failed sync leaves stale state; the next mutation or a manual "Sync now" retries idempotently via the diff.
- **Concurrency**: a tiny in-process per-trip mutex (module-level `Map<string, Promise<void>>` chaining) serializes overlapping syncs for the same trip.
- **Trip deletion**: the DELETE handler calls `syncTripCalendar` **after** the DB cascade. The trip is gone, desired = ∅, but the link rows survive (deliberately **no FK** on `calendar_event_links`) and drive Google-side teardown, after which the links are deleted.
- **Orphan sweep**: `cleanupOrphanLinks(userId)` deletes Google events for link rows whose `trip_id` no longer exists in `trips` (covers "Google was down during trip delete"). Called from the OAuth callback and the Sync-now endpoint.

## Data model — migration `004_google_calendar`

Append this entry to the `migrations` array in `src/db/migrations.ts`. This DDL is normative — Phase 1 implements it verbatim.

```sql
CREATE TABLE IF NOT EXISTS calendar_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT NOT NULL,
  scope TEXT,
  google_calendar_id TEXT,
  needs_reauth INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One row per Google event we created. NO foreign keys ON PURPOSE:
-- rows must survive trip cascade-delete so the reconciler can still
-- delete the Google events afterwards.
CREATE TABLE IF NOT EXISTS calendar_event_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  google_calendar_id TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_links_trip ON calendar_event_links(trip_id);

-- Per-item manual overrides. Absent row = auto (confirmed => sync).
-- FK to trips cascades: overrides evaporate with the trip.
CREATE TABLE IF NOT EXISTS calendar_item_overrides (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('include','exclude')),
  created_at TEXT NOT NULL,
  UNIQUE(item_type, item_id)
);

ALTER TABLE trips ADD COLUMN calendar_sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trips ADD COLUMN timezone TEXT;
ALTER TABLE trips ADD COLUMN calendar_last_synced_at TEXT;
ALTER TABLE trips ADD COLUMN calendar_sync_error TEXT;
```

### `item_type` vocabulary

- `calendar_event_links.item_type` ∈ `'trip' | 'event' | 'flight' | 'flight_return' | 'hotel' | 'car' | 'parking' | 'transit'`.
  - `item_id` = the trip id when `item_type = 'trip'`; = the flight row id for BOTH `'flight'` and `'flight_return'` (a round-trip flight row produces two calendar events, two link rows).
- `calendar_item_overrides.item_type` uses **base types only**: `'event' | 'flight' | 'hotel' | 'car' | 'parking' | 'transit'` (one override governs both legs of a round-trip flight; the trip-span event is governed by the toggle, not overrides).
- The UI's `BookingKind` (`src/components/itinerary/booking-selection.ts`) uses `rentalCar` — **map `rentalCar` → `car`** at the overrides API boundary.

### Trip type additions (`src/types/travel.ts`)

```ts
calendarSyncEnabled: boolean;        // camelize maps calendar_sync_enabled (0/1 → truthy)
timezone: string | null;             // IANA, e.g. 'Europe/Paris'
calendarLastSyncedAt: string | null; // ISO datetime
calendarSyncError: string | null;
```

## Google API layer — `src/lib/calendar/google.ts`

Plain `fetch`, **no googleapis npm package** (the app has zero Google SDK deps; the Gmail integration is raw REST — stay consistent).

- **OAuth scope**: `https://www.googleapis.com/auth/calendar` (full scope — required to list calendars and create the secondary "Travel" calendar).
- `getCalendarAccessToken(userId): Promise<string>` — read `calendar_tokens`; if `expires_at` is within 60 s, refresh via `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token` and `GOOGLE_GMAIL_CLIENT_ID/SECRET`. On `invalid_grant`: set `needs_reauth = 1` and throw a typed `CalendarAuthError`.
- `ensureTravelCalendar(userId, accessToken): Promise<string>` — return cached `calendar_tokens.google_calendar_id` if set; else `GET https://www.googleapis.com/calendar/v3/users/me/calendarList` (follow `nextPageToken` pagination), find an entry with `summary === 'Travel'`; else `POST https://www.googleapis.com/calendar/v3/calendars` with `{"summary": "Travel"}`. Cache the id in the token row.
- Event operations (all take `accessToken`, `calendarId`):
  - `insertEvent` → `POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` → returns `{ id }`.
  - `patchEvent` → `PATCH .../events/{eventId}`.
  - `deleteEvent` → `DELETE .../events/{eventId}` — treat 404 and 410 as success.
- A `calendarFetch()` wrapper: attaches the bearer token, retries **once** on 401 after a forced refresh, extracts JSON error messages into thrown `Error`s.
- If an event call fails with 404 **at the calendar level** (the user deleted the Travel calendar): clear the cached `google_calendar_id`, re-run `ensureTravelCalendar`, delete all link rows pointing at the dead calendar id (their events are gone with it) so the reconciler recreates everything.

## Mapping layer — `src/lib/calendar/mapping.ts` (pure, no I/O to Google)

Extracted/extended from the `.ics` export's normalization. Public surface:

```ts
export type CalendarItemType =
  'trip' | 'event' | 'flight' | 'flight_return' | 'hotel' | 'car' | 'parking' | 'transit';

export interface CalendarItem {
  itemType: CalendarItemType;
  itemId: string;                    // flight row id for both flight legs; trip id for 'trip'
  baseType: Exclude<CalendarItemType, 'trip' | 'flight_return'> | 'flight'; // override lookup key
  bookingStatus: string | null;      // null for 'trip'
  summary: string;
  start: { date: string; time?: string | null };
  end?: { date: string; time?: string | null } | null;
  location?: string | null;
  description?: string | null;
}

export function buildTripCalendarItems(tripId: string, userId: string):
  { trip: Trip; items: CalendarItem[] } | null;      // null if trip doesn't exist
export function toGoogleEvent(item: CalendarItem, timezone: string, tripId: string): GoogleEventPayload;
export function fingerprintEvent(payload: GoogleEventPayload): string;  // sha1 of stable-ordered JSON
export function isItemDesired(item: CalendarItem, overrides: Map<string, 'include'|'exclude'>): boolean;
export function defaultTimezone(): string;           // Intl.DateTimeFormat().resolvedOptions().timeZone
```

Mapping rules (normative):

| Item | Calendar event |
|---|---|
| Trip span | All-day, `start.date` = trip `startDate`, Google `end.date` = trip `endDate` **+ 1 day** (exclusive). Summary `✈️ {title} — {destination}`. |
| Day event (`trip_events`) | Date from its parent `trip_days.date`. Timed if `startTime` set, else all-day. |
| Flight (outbound) | `departureDate/Time` → `arrivalDate/Time`. Summary like `Flight {airline} {flightNumber}: {departureAirport} → {arrivalAirport}`. |
| Flight (return leg) | Emitted only when `tripType === 'round-trip'` AND `returnDepartureDate` present; uses the `return*` columns. `itemType: 'flight_return'`, same `itemId`. |
| Hotel | **One all-day event spanning check-in → check-out** (`end.date = nextDay(checkOutDate)`; see note below). Check-in/out times go in the description. |
| Rental car | `pickupDate/Time` → `dropoffDate/Time`. |
| Parking | `startDate/Time` → `endDate/Time`. |
| Transit | `departureDate/Time` → `arrivalDate/Time`. |

> **Hotel end-date note:** a stay checking in on the 10th and out on the 13th should display as an all-day banner on the 10th–12th nights *including* the checkout morning of the 13th — use Google `end.date = nextDay(checkOutDate)` for consistency with the other all-day rules. Keep it simple and consistent: all all-day ends are `nextDay(lastVisibleDate)`.

- **Timed events**: `{ start: { dateTime: '${date}T${time}:00', timeZone: tz }, end: {...} }` — local wall-clock string, **no UTC offset**; Google resolves via `timeZone`. `tz = trip.timezone ?? defaultTimezone()`.
- **All-day events**: `{ start: { date }, end: { date: exclusiveEnd } }`. Google requires an `end`; single-day all-day → `end.date = nextDay(start.date)`.
- **Timed with no end**: end = start + 1 hour (Google requires an end).
- Every payload sets `extendedProperties: { private: { travelAppItem: '{itemType}:{itemId}' } }` and appends a backlink `${NEXT_PUBLIC_APP_URL}/trips/{tripId}` to the description.
- **Fingerprint**: `sha1` (`node:crypto`) of a stable-key-ordered JSON of the payload. Never include volatile values (timestamps, tokens).
- Date math per `src/lib/dates.ts` conventions (`nextDay` in the export route is the model: `new Date(date + 'T00:00:00Z')`, add a UTC day, slice).

`isItemDesired`: trip-span → always true when called (the caller only builds it when the toggle is on); others → `override === 'include' || (bookingStatus === 'confirmed' && override !== 'exclude')`. Override map key: `'{baseType}:{itemId}'`.

## API surface added

| Route | Method | Purpose |
|---|---|---|
| `/api/calendar/auth` | GET | Redirect to Google consent (clone of gmail/auth; cookie `calendar_oauth_state`) |
| `/api/calendar/callback` | GET | Code exchange → upsert `calendar_tokens`, clear `needs_reauth`, best-effort `ensureTravelCalendar` + `cleanupOrphanLinks`, redirect `returnTo?calendarConnected=1` |
| `/api/calendar/status` | GET | `{ connected: boolean, needsReauth: boolean, calendarId: string \| null }` |
| `/api/calendar/disconnect` | POST | Best-effort token revoke, delete `calendar_tokens` + all `calendar_event_links`, set `calendar_sync_enabled = 0` on all trips. Google events are left in place. |
| `/api/trips/[tripId]/calendar/sync` | POST | "Sync now": `cleanupOrphanLinks` + `syncTripCalendar`; returns `{ lastSyncedAt, error }` |
| `/api/trips/[tripId]/calendar/overrides` | GET | All overrides for the trip |
| `/api/trips/[tripId]/calendar/overrides` | PUT | `{ itemType, itemId, mode: 'include' \| 'exclude' \| null }` — null deletes the row (back to auto); upsert otherwise; then sync |

## Sync wiring (every mutation path)

Add `await syncTripCalendar(userId, tripId)` after the DB write, before the response return, in:

- `src/app/api/trips/[tripId]/route.ts` — PATCH (covers title/date/status/toggle/timezone changes) and DELETE (**after** the `DELETE FROM trips`).
- The 12 entity mutation routes under `src/app/api/trips/[tripId]/`: `{flights, hotels, rental-cars, parking-bookings, transit, events}` × (`route.ts` POST; `[id]/route.ts` PATCH + DELETE).
- `src/app/api/trips/[tripId]/assistant/apply/route.ts` — once, after the bulk insert.
- The overrides PUT handler.

No try/catch needed at call sites — `syncTripCalendar` never throws. **Important with better-sqlite3**: complete all synchronous DB writes first, then await the sync — never hold a DB transaction across the awaited Google calls.

`src/app/api/trips/[tripId]/duplicate/route.ts`: add `timezone` to the copied column list; do **not** copy sync state (toggle defaults to 0, statuses reset to unbooked, new ids — nothing else to do).

## Edge-case behaviors (normative)

| Case | Behavior |
|---|---|
| Trip dates change | Trip PATCH → reconcile. Trip-span fingerprint changes → patch. Days removed by the existing trip_days reconciliation cascade-delete their events → those disappear from desired → Google events deleted. |
| Item deleted in app | Link row survives (no FK) → reconcile deletes the Google event → deletes the link. |
| Trip deleted | DELETE handler: DB cascade first, then sync (trip missing ⇒ teardown from surviving links). If Google is down, orphan links are swept later by `cleanupOrphanLinks`. |
| Sync toggled off | Desired = ∅ → all events including trip span removed. Overrides stay in the DB (restored behavior if re-enabled). |
| Disconnect Google | Revoke (best-effort `POST https://oauth2.googleapis.com/revoke?token=…`), delete tokens + ALL link rows, disable all trip toggles. Events already on the Travel calendar **stay there** — the confirm dialog must say so and tell the user they can delete the Travel calendar in Google to remove them. |
| Token revoked externally | Refresh returns `invalid_grant` → `needs_reauth = 1`, sync becomes a no-op, trip gets `calendar_sync_error = 'Reconnect Google Calendar'`, UI shows a Reconnect button → auth flow clears the flag. |
| User edits/deletes events in Google | Not watched. PATCH hitting 404/410 → recreate; DELETE hitting 404/410 → success. Manual Google edits persist until the item's fingerprint next changes. |
| Round-trip flight | Two events, two link rows (`flight` + `flight_return`), one override (base type `flight`). |
| Google API down mid-sync | Partial sync; first error recorded in `calendar_sync_error`; every future mutation or Sync-now retries idempotently. |
| Duplicate trip | Sync state not copied; `timezone` is copied. |
| Travel calendar deleted by the user | Calendar-level 404 → clear cached id, recreate calendar, drop stale link rows → events recreate on next sync. |

## File map (what each phase creates/touches)

```
src/db/migrations.ts                     Phase 1 (append 004_google_calendar)
src/types/travel.ts                      Phase 1 (Trip fields)
src/lib/calendar/google.ts               Phase 1 (tokens, refresh, ensureTravelCalendar, event CRUD)
src/app/api/calendar/auth/route.ts       Phase 1
src/app/api/calendar/callback/route.ts   Phase 1
src/app/api/calendar/status/route.ts     Phase 1
src/app/api/calendar/disconnect/route.ts Phase 1
src/lib/calendar/mapping.ts              Phase 2 (pure mapping + fingerprint)
src/app/api/trips/[tripId]/export/route.ts  Phase 2 (refactor to consume mapping)
src/lib/calendar/sync.ts                 Phase 3 (reconciler, mutex, orphan sweep)
src/app/api/trips/[tripId]/calendar/sync/route.ts       Phase 3
src/app/api/trips/[tripId]/calendar/overrides/route.ts  Phase 3
~15 mutation route files                 Phase 3 (add sync calls)
src/components/trips/TripEditForm.tsx    Phase 4
src/components/trips/TripMoreMenu.tsx    Phase 4
src/components/itinerary/BookingDetailSheet.tsx  Phase 4
src/components/itinerary/ItineraryDocument.tsx   Phase 4
src/app/trips/[tripId]/page.tsx          Phase 4
docs/google-calendar.md                  Phase 5 (user-facing doc)
```

Phase order: **1 → 2 → 3 → 4 → 5**. Phase 2 has no dependency on Phase 1 and may run in parallel with it; Phase 3 requires both.
