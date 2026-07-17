# Phase 3 — Sync engine + wiring (the core)

## Goal

The reconciler `syncTripCalendar` exists and is called from every mutation path, so any change in the app is reflected on the Google "Travel" calendar: creates, edits, deletions, booking-status changes, trip date changes, toggle on/off, overrides, trip deletion. Plus two new endpoints: "Sync now" and per-item overrides.

## Prerequisites

- **Phases 1 and 2 are complete** (`src/lib/calendar/google.ts` and `src/lib/calendar/mapping.ts` exist; migration applied; a Google account is connected via `/api/calendar/auth`).
- Read `docs/calendar-sync/ARCHITECTURE.md` completely — especially § "Core design", § "Sync wiring", and the edge-case table.
- Read `AGENTS.md` (repo root).

## Read first

- `src/lib/calendar/google.ts` and `src/lib/calendar/mapping.ts` (Phase 1/2 outputs).
- `src/app/api/trips/[tripId]/route.ts` — trip PATCH (note the existing trip_days reconciliation on date change) and DELETE.
- One entity route pair to learn the pattern, e.g. `src/app/api/trips/[tripId]/hotels/route.ts` + `hotels/[hotelId]/route.ts`.
- `src/app/api/trips/[tripId]/assistant/apply/route.ts` — the bulk-insert path.
- `src/app/api/trips/[tripId]/duplicate/route.ts`.
- `src/lib/api-helpers.ts` — `withErrorHandling`.

## Work items

### 1. Create `src/lib/calendar/sync.ts`

```ts
export async function syncTripCalendar(userId: string, tripId: string): Promise<void>; // never throws
export async function cleanupOrphanLinks(userId: string): Promise<void>;               // never throws
```

`syncTripCalendar` — implement the algorithm from ARCHITECTURE.md § "Core design" exactly:

1. **Mutex**: module-level `const locks = new Map<string, Promise<void>>()`; chain this run onto any in-flight promise for the same `tripId` so overlapping syncs serialize; clean the map entry when the chain settles.
2. Guards: no `calendar_tokens` row or `needs_reauth = 1` → return.
3. Desired state: `built = buildTripCalendarItems(tripId, userId)`. If `built` is null (trip deleted) or `!built.trip.calendarSyncEnabled` → `desired = []`. Else load `calendar_item_overrides` for the trip into a `Map<'{itemType}:{itemId}', mode>` and `desired = built.items.filter(i => isItemDesired(i, overrides))`.
4. Recorded state: `SELECT * FROM calendar_event_links WHERE trip_id = ?`.
5. **Short-circuit**: if `desired` and `links` are both empty → clear `calendar_sync_error` if set (and only if the trip exists) → return. No token refresh, no Google calls.
6. `accessToken = await getCalendarAccessToken(userId)`; `calId = await ensureTravelCalendar(userId, accessToken)`. A `CalendarAuthError` here → record `calendar_sync_error = 'Reconnect Google Calendar'` on the trip (if it exists) and return.
7. `tz = built?.trip.timezone ?? defaultTimezone()`. For each desired item: `payload = toGoogleEvent(item, tz, tripId)`, `fp = fingerprintEvent(payload)`.
8. Diff by `(item_type, item_id)` and act sequentially:
   - **Create** (desired, no link): `insertEvent` → INSERT link row (fresh id via the app's id convention — check how other routes generate ids, e.g. `crypto.randomUUID()`).
   - **Update** (link exists, `fp !== link.fingerprint`): `patchEvent`; if it throws with `status` 404/410, `insertEvent` instead and update the link's `google_event_id`. Then UPDATE the link's `fingerprint` + `updated_at`.
   - **Delete** (link exists, item not desired): `deleteEvent` (404/410 = success inside the google lib) → DELETE the link row.
   - Equal fingerprints: skip.
   - Wrap each item's operation in try/catch: remember the first error message, continue with remaining items.
9. If the trip row still exists: `UPDATE trips SET calendar_last_synced_at = ?, calendar_sync_error = ? WHERE id = ?` (error message or NULL).
10. The entire body is inside a try/catch — nothing escapes.

**Calendar-gone recovery**: if event calls consistently 404 because the *calendar* was deleted (Google returns 404 for inserts too in that case), handle per ARCHITECTURE.md: clear `calendar_tokens.google_calendar_id`, delete all `calendar_event_links` rows whose `google_calendar_id` is the dead id, re-`ensureTravelCalendar`, and let this or the next sync recreate events. A pragmatic detection: an **insert** failing with 404 means the calendar itself is gone.

`cleanupOrphanLinks(userId)`:
- `SELECT * FROM calendar_event_links WHERE user_id = ? AND trip_id NOT IN (SELECT id FROM trips)`.
- For each: `deleteEvent` best-effort; delete the link row on success (or on 404/410). Skip entirely when there are no tokens. Never throws.

**better-sqlite3 constraint**: all DB access in this module is synchronous — that's fine — but never open a `db.transaction(...)` that spans an `await`. Do reads, then await Google, then do writes, stepwise per item.

### 2. New route: `POST /api/trips/[tripId]/calendar/sync`

`src/app/api/trips/[tripId]/calendar/sync/route.ts` — wrapped in `withErrorHandling`:
1. Verify the trip belongs to the user (404 otherwise — copy the guard from an existing `[tripId]` route).
2. `await cleanupOrphanLinks(userId)`; `await syncTripCalendar(userId, tripId)`.
3. Re-read the trip; return `{ lastSyncedAt: trip.calendarLastSyncedAt, error: trip.calendarSyncError }`.

### 3. New route: `/api/trips/[tripId]/calendar/overrides`

`src/app/api/trips/[tripId]/calendar/overrides/route.ts`:
- **GET**: all override rows for the trip → `[{ itemType, itemId, mode }]`.
- **PUT**: body `{ itemType: string, itemId: string, mode: 'include' | 'exclude' | null }`.
  - Map UI kind `rentalCar` → `car`; validate `itemType` ∈ `event|flight|hotel|car|parking|transit` (accepting `rentalCar` as an alias) and `mode` ∈ include/exclude/null → 400 otherwise.
  - Verify the trip belongs to the user; optionally verify the item exists in its table.
  - `mode === null` → DELETE the override row; else upsert (`ON CONFLICT(item_type, item_id) DO UPDATE SET mode = excluded.mode`).
  - `await syncTripCalendar(userId, tripId)`; return the updated override list.

### 4. Wire `syncTripCalendar` into every mutation handler

Add `await syncTripCalendar(userId, tripId);` **after all DB writes, before the response return**. No try/catch needed (it never throws). Files:

| File | Handlers |
|---|---|
| `src/app/api/trips/[tripId]/route.ts` | PATCH; DELETE (**after** `DELETE FROM trips` executes) |
| `src/app/api/trips/[tripId]/flights/route.ts` | POST |
| `src/app/api/trips/[tripId]/flights/[flightId]/route.ts` | PATCH, DELETE |
| `src/app/api/trips/[tripId]/hotels/route.ts` + `hotels/[hotelId]/route.ts` | POST; PATCH, DELETE |
| `src/app/api/trips/[tripId]/rental-cars/route.ts` + `rental-cars/[rentalCarId]/route.ts` | POST; PATCH, DELETE |
| `src/app/api/trips/[tripId]/parking-bookings/route.ts` + `parking-bookings/[parkingId]/route.ts` | POST; PATCH, DELETE |
| `src/app/api/trips/[tripId]/transit/route.ts` + `transit/[transitId]/route.ts` | POST; PATCH, DELETE |
| `src/app/api/trips/[tripId]/events/route.ts` + `events/[eventId]/route.ts` | POST; PATCH, DELETE |
| `src/app/api/trips/[tripId]/assistant/apply/route.ts` | once, after the bulk insert completes |

Also:
- Trip PATCH must accept `calendarSyncEnabled` and `timezone` in its body → column map (`calendar_sync_enabled`, `timezone`) — check how `digestEnabled` flows through the existing `colMap` and mirror it.
- `src/app/api/trips/[tripId]/duplicate/route.ts`: add `timezone` to the INSERT…SELECT column list for the trips copy. Do **not** copy `calendar_sync_enabled` (defaults 0), `calendar_last_synced_at`, `calendar_sync_error`, links, or overrides.
- Entity DELETE handlers: optionally also `DELETE FROM calendar_item_overrides WHERE item_type = ? AND item_id = ?` (orphan overrides are harmless but tidy).
- `src/app/api/calendar/callback/route.ts`: replace the Phase 1 `// Phase 3: cleanupOrphanLinks` comment with a real best-effort call.
- Check `src/app/api/trips/[tripId]/days/[dayId]/route.ts`: if it can mutate anything that affects events (delete a day, move events), wire sync there too; if it's cosmetic only, skip it and note that in the commit message.

## Gotchas

- The response payload of each handler must be computed from the DB state **before** the sync call only in the sense that sync doesn't change entity rows — it only touches `calendar_*` tables and the trips sync-status columns. Returning the entity row then awaiting sync is fine; just keep the existing response shapes unchanged.
- Latency: every mutation now awaits up to a few Google round-trips. Acceptable by design (single user). Do NOT "optimize" with fire-and-forget — Next.js can kill the handler after the response.
- When tokens are absent, sync returns instantly — non-connected usage stays zero-overhead.
- `assistant/apply` inserts inside a better-sqlite3 transaction — the sync call goes **after** the transaction completes.

## Definition of done / verification (curl-driven, against a real Google calendar)

Prereq: connected via Phase 1; a test trip with a confirmed flight (round-trip), a confirmed hotel, an unbooked activity event, and a pending rental car. Keep calendar.google.com open (Travel calendar visible) and refresh between steps. Base URL `http://localhost:3000`.

1. **Toggle on**: `curl -X PATCH .../api/trips/{id} -H 'Content-Type: application/json' -d '{"calendarSyncEnabled":true}'` → Travel calendar shows: trip-span all-day event, 2 flight events (both legs), hotel all-day span. NOT shown: unbooked activity, pending car. `trips.calendar_last_synced_at` set, `calendar_sync_error` NULL, `calendar_event_links` has 4 rows.
2. **No-op**: re-PATCH something cosmetic that doesn't change payloads (e.g. `{"notes":"x"}`) → sync runs but issues zero Google event calls (verify: link fingerprints unchanged, no new event ids; optionally add temporary logging).
3. **Edit**: PATCH the flight's `departureTime` → outbound event moves in Google; return leg untouched.
4. **Status change up**: PATCH the rental car to `bookingStatus: "confirmed"` → car event appears.
5. **Status change down**: PATCH the hotel to `"pending"` → hotel event disappears.
6. **Override include**: `curl -X PUT .../calendar/overrides -d '{"itemType":"event","itemId":"...","mode":"include"}'` → unbooked activity appears. `mode: null` → disappears again.
7. **Override exclude**: exclude the confirmed flight → BOTH legs disappear (one override, two events). Remove → both return.
8. **Trip dates change**: PATCH trip `startDate`/`endDate` → trip-span shifts; any day events on removed days disappear from Google.
9. **Item delete**: DELETE the hotel (re-confirm it first) → event gone from Google, link row gone.
10. **Sync now**: `curl -X POST .../calendar/sync` → `{ lastSyncedAt, error: null }`.
11. **Toggle off**: `{"calendarSyncEnabled":false}` → ALL the trip's events gone from Google (including trip span); links empty for the trip; overrides still in DB.
12. **Trip delete**: re-enable + sync, then DELETE the trip → all its events gone from Google; no orphan links remain.
13. **Orphan sweep**: create a small synced trip, stop being able to reach Google (disconnect Wi-Fi or temporarily break the token by setting `expires_at` past and `refresh_token` to garbage — then restore), delete the trip, confirm links remain; fix connectivity, `POST /api/trips/{otherTripId}/calendar/sync` → orphans swept, Google events gone.
14. **Auth failure**: set `needs_reauth = 1` manually in `calendar_tokens` → mutations still succeed instantly, no Google calls; clear the flag.
15. `npx tsc --noEmit` and `npm run lint` pass.

Commit with a message describing the phase.
