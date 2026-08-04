# Phase 1 — Schema and shared normalizer

**Read `00-overview.md` first.** This doc assumes the data contract, the predicate semantics and
the conventions in it.

Phase 1 adds the two migrations, the four new `src/lib/calendar/` modules with real unit tests,
and refactors the existing per-trip export route to consume them. **No feed route, no UI, no
proxy change** — those are Phases 2 and 3. When this phase is done the app looks identical in a
browser, and the only externally visible change is to the `.ics` download.

---

## 1. Migrations

Append two entries to the `migrations` array in `src/db/migrations.ts`, after `008_trip_geocode`.
Check nothing newer than `008` exists first.

### `009_calendar_feed` — CREATE only, **no** `runCustomMigration` branch

```sql
-- Subscribe-able ICS feeds. One row today (slug 'shared'); the (user_id, slug) unique
-- index means a second feed needs no migration, only a new row.
CREATE TABLE IF NOT EXISTS calendar_feeds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL DEFAULT 'shared',
  name TEXT NOT NULL DEFAULT 'Zo Travel',
  -- The ONLY credential. 32 random bytes, base64url. Rotating it revokes every
  -- subscription: the old URL 404s and subscribers' copies stop updating.
  token TEXT NOT NULL,
  -- One JSON object; parseFeedFilters() in src/lib/calendar/filters.ts owns the schema,
  -- the defaults, and the tolerance for unknown/missing keys.
  filters TEXT NOT NULL DEFAULT '{}',
  last_fetched_at TEXT,
  last_fetched_user_agent TEXT,
  token_rotated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feeds_token ON calendar_feeds (token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feeds_user_slug ON calendar_feeds (user_id, slug);
```

`CREATE TABLE IF NOT EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS` are already idempotent —
that is exactly why `003_cover_images` and `007_trip_legs` have no custom branch. Do not add one.

**No seed row here.** `migrations.ts` has never generated data, and generating a token needs
`node:crypto`. `ensureFeed()` (Phase 2) inserts lazily on first use.

### `010_hide_from_calendar` — ALTERs **with** a custom branch

```sql
ALTER TABLE trips            ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_events      ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_flights     ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_hotels      ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_rental_cars ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_parking     ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_transit     ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
```

And in `runCustomMigration`, after the `008_trip_geocode` branch:

```ts
if (name === '010_hide_from_calendar') {
  // Global "never put this on a calendar" flag, not per-feed: a hidden item is hidden
  // from every feed AND from the per-trip .ics download.
  for (const table of [
    'trips', 'trip_events', 'trip_flights', 'trip_hotels',
    'trip_rental_cars', 'trip_parking', 'trip_transit',
  ]) {
    addColumnIfMissing(db, table, 'hide_from_calendar', 'INTEGER NOT NULL DEFAULT 0');
  }
  return true;
}
```

**Seven tables, including `trips`.** Without the trip-level column there is no way to keep one
whole trip off the calendar except by unchecking a status that also hides unrelated trips. It
cascades: a hidden trip hides its span event and every item beneath it.

---

## 2. Types

`src/types/travel.ts` — add `hideFromCalendar: number` (SQLite boolean, `0`/`1`, matching
`takesReservations`) to `Trip`, `TripEvent`, `TripFlight`, `TripHotel`, `TripRentalCar`,
`TripParking`, `TripTransit`.

Add `'hideFromCalendar'` to the writable `colMap` in each of:

- `src/app/api/trips/[tripId]/route.ts` (the trip PATCH)
- `src/app/api/trips/[tripId]/events/[eventId]/route.ts`
- `.../flights/[flightId]/route.ts`, `.../hotels/[hotelId]/route.ts`,
  `.../rental-cars/[rentalCarId]/route.ts`, `.../parking-bookings/[parkingId]/route.ts`,
  `.../transit/[transitId]/route.ts`

Also accept it on the corresponding POST routes if they build an explicit column list.

**And update `mcp-server/travel-write.js` in the same session** — that repo mirrors these field
lists, and per `travel-app/CLAUDE.md` ("Downstream MCP write registry") a new writable column
that is not registered there makes Claude's travel write tools reject it as unknown. Add
`'hideFromCalendar'` to `TRIP_FIELDS.fields` and to the `fields` of the `event`, `flight`,
`hotel`, `rental_car`, `parking` and `transit` kinds in `TRAVEL_KINDS`. Do **not** expose
`calendar_feeds` — feed config is not a trip write. Note `mcp-server` is a **separate git repo**
and uses **Zod v3**, not v4.

---

## 3. `src/lib/calendar/ics.ts` — zero imports

A **verbatim move** of the helpers currently at `src/app/api/trips/[tripId]/export/route.ts`
lines 9-88: `escapeText`, `fold`, `toDateStamp`, `dtProperty`, `nextDay`, `buildVEvent`, and the
`EventInput` interface. Export them all.

Two changes, and only two:

1. **`nextDay` moves to the noon-UTC anchor** used by `src/lib/dates.ts:1-8`. The current local
   copy anchors at midnight UTC. Both give the same answer for +1 day, but the codebase should
   have one rule. Do not `import` from `dates.ts` — that would break `node --test`; copy the
   three-line body and comment where it came from.
2. **`buildVEvent` takes the item, not a shared dtstamp.** Signature becomes
   `buildVEvent(item: EventInput & { updatedAt: string }): string | null`, and it emits
   `DTSTAMP` **and** `LAST-MODIFIED` from `toDateStamp(new Date(item.updatedAt))`. See
   `00-overview.md` for why. If `updatedAt` is missing or unparseable, fall back to the epoch
   rather than to `now` — a stable wrong value is better than an unstable one, and it shows up
   as an obvious `19700101T000000` in the output rather than hiding.

Add one new export:

```ts
export function buildCalendar(name: string, vevents: string[]): string
```

It wraps the VEVENTs in the VCALENDAR envelope currently at `export/route.ts:188-197`, plus:

- `X-WR-CALDESC` — a short fixed description.
- `X-PUBLISHED-TTL:PT12H` and `REFRESH-INTERVAL;VALUE=DURATION:PT12H`. Google ignores both;
  Apple Calendar and Outlook honour them. Free, and it makes the feed behave if anyone
  subscribes on an iPhone directly.
- **No `X-WR-TIMEZONE`.** This is load-bearing — see `00-overview.md`. Comment the omission in
  the code so it is not "fixed" later.
- If `vevents` is empty, emit **one placeholder VEVENT**: a fixed UID
  (`empty-placeholder@travel.zo-bot.com`), an all-day date far in the past, summary
  "No trips match your calendar filters". A zero-VEVENT VCALENDAR is legal but Google has been
  observed to reject it as "Could not fetch the URL", and the placeholder also explains an empty
  calendar to the subscriber.

Lines are joined with CRLF, as today.

### `src/lib/calendar/ics.test.mjs`

At minimum:

- `escapeText` escapes `\`, `;`, `,` and newlines, in that precedence.
- `fold` breaks at 75 octets with continuation lines starting with a single space, and leaves a
  74-char line alone. Include one line of exactly 75 and one of 76.
- `dtProperty` emits `;VALUE=DATE:YYYYMMDD` with no time and `:YYYYMMDDTHHMM00` with one, and
  zero-pads a single-digit hour.
- `nextDay('2026-02-28')` → `'2026-02-29'` in 2028 (leap year) and `'2026-03-01'` in 2026;
  `nextDay('2026-12-31')` → `'2027-01-01'`.
- An all-day `buildVEvent` produces an **exclusive** DTEND one day after the end date.
- A timed item with an end time produces a timed DTEND, not a date one.
- `DTSTAMP` and `LAST-MODIFIED` both reflect `updatedAt` and are equal.
- `buildCalendar([])` contains exactly one `BEGIN:VEVENT` (the placeholder).

---

## 4. `src/lib/calendar/filters.ts` — `import type` only

Everything in the Data contract section of `00-overview.md`: `CalendarItemKind`, `CalendarItem`,
`CalendarFeedFilters`, `DEFAULT_FILTERS`, `EXPORT_PRESET`, `includeItem`, `filterItems`,
`countByKind`, plus:

```ts
/** Never throws. Malformed JSON, wrong types and unknown keys all degrade to defaults. */
export function parseFeedFilters(raw: string | null | undefined): CalendarFeedFilters;
export function serializeFeedFilters(f: CalendarFeedFilters): string;
```

`parseFeedFilters` is **the validator** — the management API in Phase 2 uses no other. Rules:

- Malformed JSON, `null`, or a non-object → `DEFAULT_FILTERS` entire.
- An absent key → that key's default.
- An array key that is not an array → that key's default. Members not in the closed enum are
  **dropped**, not rejected.
- An **empty array is meaningful and must be preserved** — "no event categories" is a legitimate
  choice meaning no day events. Do not treat `[]` as absent and substitute the default; that
  would make it impossible to turn a whole class off.
- `includeNoBookingNeeded` coerced to a real boolean.
- Window values: a non-negative finite integer or `null`. Anything else → `null` (unbounded).
  Never a negative window.
- Unknown keys dropped.

The only import in the file is
`import type { TripStatus, BookingStatus, EventCategory } from '@/types/travel'`. Type-only, so
it is erased and `node --test` can load the file — and so the Phase 3 client component can import
from here without dragging `node:crypto` into the browser bundle.

`addDays(ymd, delta)` for the window gate lives here as a small local helper (noon-UTC anchor);
it cannot import from `dates.ts` for the same reason as `ics.ts`.

### `src/lib/calendar/filters.test.mjs`

The predicate is the heart of the program and the thing most likely to be "simplified" later.
Cover, at minimum:

1. `hidden` beats every other gate, including a filter set that would otherwise include it.
2. A hike (`eventCategory: 'hike'`, `bookingStatus: null`) **survives** `bookingStatuses:
   ['confirmed']`, and disappears when `hike` is removed from `eventCategories`. This is the
   regression that matters most.
3. `noBookingNeeded: true` is governed by `includeNoBookingNeeded` and **ignores**
   `bookingStatuses` entirely — including when `bookingStatuses` is `[]`.
4. `tripSpan` ignores `eventCategories` and `bookingStatuses`, and is controlled only by `kinds`.
5. `eventCategories` is ignored for non-`event` kinds — a hotel is not filtered by it.
6. Window gates use overlap: an item that started before the past cutoff but ends after it is
   **kept**; `windowPastDays: null` keeps everything.
7. `parseFeedFilters('')`, `'{'`, `'null'`, `'[]'` and `'{"kinds":"flight"}'` all return usable
   defaults and never throw.
8. `parseFeedFilters('{"eventCategories":[]}')` preserves the empty array.
9. `parseFeedFilters('{"eventCategories":["restaurant","bogus"]}')` drops only `bogus`.
10. `serializeFeedFilters(parseFeedFilters(x))` round-trips.

---

## 5. `src/lib/calendar/token.ts` — `node:crypto` only

```ts
import { randomBytes } from 'node:crypto';

/** 32 bytes → 43 base64url chars. No padding, no '+' or '/', safe in a path segment. */
export function newFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export function isValidTokenShape(t: string): boolean { return TOKEN_RE.test(t); }

/** '<token>.ics' and '<token>' both resolve to '<token>'. */
export function stripIcsSuffix(seg: string): string {
  return seg.endsWith('.ics') ? seg.slice(0, -4) : seg;
}
```

`crypto.randomBytes` is **not** on the global `crypto` (that is WebCrypto) — the explicit
`node:crypto` import is required, as in `src/app/api/gmail/auth/route.ts:2`.

Kept in its own file, separate from `filters.ts`, precisely so the client component can import
filter types without pulling `node:crypto`.

The length range in the regex is deliberately wider than 43 so an older or future token length
still resolves. Its job is to keep junk out of SQL and the logs, not to authenticate.

### `src/lib/calendar/token.test.mjs`

Tokens are 43 chars and match the regex; two calls differ; `isValidTokenShape` rejects `''`, a
31-char string, and one containing `/`, `+` or `=`; `stripIcsSuffix` handles both forms and does
not mangle a token containing the letters `ics` mid-string.

---

## 6. `src/lib/calendar/items.ts` — the single normalizer

```ts
export function buildCalendarItems(opts: { userId: string; tripId?: string }): CalendarItem[]
```

One query per source table. With `tripId`, scope by `trip_id` after verifying the trip belongs to
`userId`; without it, join `trips` on `user_id` so a feed only ever sees its owner's data.

Build the `trip_days` id→date map exactly as `export/route.ts:100-101` does. Reuse
`skipsBooking()` from `src/lib/bookings.ts` for `noBookingNeeded` — do not re-test
`takes_reservations` inline.

Carry over the existing summary/description formatting verbatim from `export/route.ts:113-186`,
including the emoji prefixes (`✈️`, `🏨`, `🚗`, `🅿️`, `🚆`) and the `Conf: …` description lines.

Three additions:

- **`tripSpan`** from the `trips` row: all-day `startDate` → `endDate`, summary the trip title,
  location `trip.destination`, `bookingStatus: null`, `eventCategory: null`,
  `updatedAt: trip.updatedAt`.
- **`flightReturn`** when the flight row has a `returnDepartureDate`. Use the `return*` columns,
  reverse the route in the summary (arrival airport → departure airport), and use
  `returnConfirmationNumber` / `returnSeats` in the description. UID prefix `flight-return-`,
  same row id.
- **`hidden`** = the row's `hide_from_calendar` OR'd with its trip's.

Set `bookingStatus: null` for `category === 'hike'`. Every other item passes its
`booking_status` through.

Sort the result by `(start.date, start.time ?? '', uid)` so the output body is deterministic —
that is what makes "two fetches with no edits are byte-identical" checkable, and what an `ETag`
would later depend on.

This module touches the DB, so it gets no `.mjs` test. Its correctness is verified by the export
diff in step 7 below.

---

## 7. Refactor the export route

`src/app/api/trips/[tripId]/export/route.ts` collapses to roughly:

```ts
const items = buildCalendarItems({ userId, tripId });
const kept  = filterItems(items, EXPORT_PRESET, localToday());
const body  = buildCalendar(trip.title, kept.map(buildVEvent).filter(Boolean));
```

**Keep** its `Content-Disposition: attachment`, its `safeName` filename slug, and its 404 for an
unknown trip. Delete the local helper definitions now living in `ics.ts`.

**Three deliberate behaviour changes to the download**, all improvements. Name all three in the
phase report:

1. It now honours `hide_from_calendar` — that is what "global" means.
2. It now includes the trip-span banner and the return flight leg (the latter is a bug fix).
3. `DTSTAMP` is now per-item, and `LAST-MODIFIED` is new.

---

## Verification

Capture `curl -s "http://localhost:3000/travel/api/trips/<id>/export" > before.ics` **before**
touching anything. Use a trip that has a round-trip flight, a hotel, a hike, and at least one
unbooked restaurant.

1. `node --test "src/lib/calendar/*.test.mjs"` — all pass.
2. `node --test "src/lib/*.test.mjs"` — still 13 passing. You have not broken `legs`,
   `admin-emails` or `destinations`.
3. `npm run build` clean.
4. `npm run lint` — 11 pre-existing warnings, no new ones.
5. Restart the dev server twice. Both migrations apply once and are idempotent:
   `sqlite3 local.db "SELECT name FROM schema_migrations ORDER BY name"` lists `009` and `010`
   exactly once each.
6. `sqlite3 local.db ".schema calendar_feeds"` shows both unique indexes.
7. `sqlite3 local.db "PRAGMA table_info(trip_transit)"` (and one more table) shows
   `hide_from_calendar` with `notnull=1`, `dflt_value=0`.
8. `curl -s ... > after.ics` and **diff it against `before.ics`**. Only these may differ:
   `DTSTAMP` lines, new `LAST-MODIFIED` lines, one new `BEGIN:VEVENT` with `UID:trip-…`, and one
   with `UID:flight-return-…`. **Every pre-existing UID must still be present and unchanged.**
   If any `event-`/`hotel-`/`car-` UID moved or vanished, stop and fix it — that would orphan
   already-imported events.
9. `PATCH` an event with `{"hideFromCalendar":1}`, re-GET the export, and confirm that VEVENT is
   gone. Then set it back to `0` and confirm it returns. Assert on the re-GET, not the status
   code.
10. Set `hide_from_calendar = 1` on the **trip** row directly in sqlite and confirm the export
    drops to just the placeholder VEVENT — the cascade works. Set it back.
11. Two consecutive `curl`s with no edits in between are **byte-identical**
    (`diff a.ics b.ics` empty). This is the per-item DTSTAMP contract; if it fails, something is
    still stamping with `now`.
12. Feed `after.ics` to an ICS validator (e.g. `icalendar.org/validator.html`) — no errors.
13. The app is visually unchanged in a browser. Trip page, settings page, trip menu all work.

**Done when:** all 13 pass, both migrations are idempotent, and the only export changes are the
four expected kinds of line.

Append a Phase 1 report to `PROGRESS.md`, listing the three download behaviour changes
explicitly, and update the Status blockquote. Then run `node tools/project-status.mjs` from
`C:\Users\chris\OneDrive\Apps\zo-bot.com`.
