# Calendar Feed — Overview

**Every phase agent reads this file first.** It carries the problem, the settled design
decisions, the data contract, and the conventions each phase must honour. The per-phase docs
assume you have read it and do not repeat it.

---

## The problem

The app can already produce an `.ics` file: `GET /api/trips/{tripId}/export`, linked from
`TripMoreMenu.tsx` and from the Settings "Data" card. It is a **download** —
`Content-Disposition: attachment`.

Importing a downloaded `.ics` into Google Calendar copies the events in **once** and then
freezes them. Change a restaurant time in travel-app and the calendar still shows the old one.
There is no way to remove the imported events short of deleting each one by hand. And the
export has no filtering at all, so every half-formed unbooked idea lands in the calendar looking
exactly like a confirmed reservation.

Chris and Kate both want trips on their own Google Calendar, kept current.

## The feature

**A subscribe-able feed**: one URL, added once via Google Calendar's *Other calendars → From
URL*. Google re-fetches it on its own schedule. Filters live server-side in the database and are
edited on the Settings page, so what appears in the calendar can change without anyone
re-subscribing.

**One shared feed, two subscribers.** Chris and Kate use the same URL and see the identical
filtered view.

---

## The defining constraint — read this twice

**The whole VCALENDAR body IS the state.** A subscribed calendar is replaced wholesale on every
fetch. A `UID` present last time and absent this time is **deleted from the subscriber's
calendar**.

That is the feature's core mechanic and its sharpest edge. Three things in this design exist
solely because of it:

1. `DEFAULT_FILTERS` is **maximal** — everything on. A default like "only the last 90 days"
   would silently erase last year's trips from both calendars the moment the feed went live.
2. The Save button in Settings carries an explicit warning that turning a filter off *removes*
   those events from every subscribed calendar.
3. A feed that matches zero items emits a placeholder VEVENT rather than an empty calendar.

Never "tidy up" the feed by dropping past items. Narrowing is always the user's deliberate act.

---

## Settled design decisions

These were decided with Chris during planning. **Do not revisit them.** If a phase doc seems to
contradict one, the phase doc is wrong — flag it rather than silently changing course.

| Decision | Choice | Why |
|---|---|---|
| Delivery | Subscribe-able ICS feed | One URL, kept current by Google's own polling. The alternative — OAuth push into a secondary Google calendar — is far more machinery (token refresh, event-link table, fingerprints, a reconciler) for a result nobody can subscribe to. See "Relationship to docs/calendar-sync" below |
| Number of feeds | **Exactly one**, shared by both subscribers | Both want essentially the same view. The table is row-per-feed with a unique `(user_id, slug)` and a unique token, so a second feed later is a row plus UI — but the UI deliberately does not offer one now |
| Filter storage | One `filters` JSON column on `calendar_feeds` | Four of the filters are sets over closed enums (4+8+8+3 values). As columns that is 23 booleans plus a migration every time `EventCategory` grows — and it has grown twice already (`004`, `005`). Nothing filters in SQL, so no index would ever exist on them, and the form PUTs the whole object atomically. The untyped-JSON risk is contained by exactly one function, `parseFeedFilters()` |
| Per-item exclusion | A **global** `hide_from_calendar` column, not per-feed overrides | One boolean, one line in the predicate, no join. It means "this does not belong on a calendar", not "hide this from Kate" |
| Credential | A random token in the **URL path** | Google's fetcher sends no cookies, no Access JWT, and no header we control. The token is the whole credential — the same model as Google's own "secret address in iCal format". Path, not query string, because Cloudflare Access application matching is hostname + path only (see Phase 2) |
| Times | ~~Floating local, exactly as the existing export emits them~~ **SUPERSEDED 2026-08-03 — see Phase 5.** Absolute UTC instants (`...Z`) | The original reasoning assumed RFC 5545 floating semantics ("local wherever viewed") hold in practice. **They do not in Google Calendar**: a subscribed feed with zone-less datetimes is normalised to UTC, so every timed event rendered hours off. Confirmed in production. Times are now converted to absolute instants from the destination's IANA zone. `X-WR-TIMEZONE` is still omitted, but now because it would override each subscriber's own display zone |
| ICS building | Extract the existing helpers into `src/lib/calendar/ics.ts` and share them | `escapeText`, `fold`, `dtProperty`, `buildVEvent` are already written and correct in `export/route.ts`. Two implementations of RFC 5545 folding is one too many |
| Normalization | One `buildCalendarItems()` shared by the feed and the per-trip download | The six item tables are normalized in exactly one place. A second copy will drift |

### Explicitly out of scope

Real follow-ups, deliberately not in this program. Do not build them; do not let them creep in.

- **Per-subscriber views / per-feed item overrides.** One feed, one view, one global hide flag.
  If you find yourself adding a `calendar_item_overrides` table, stop — that was the superseded
  design.
- **Two-way sync.** The feed is read-only in every calendar client. Editing an event in Google
  changes nothing here, and nothing should try to read it back.
- **Google OAuth push.** That was `docs/calendar-sync/`, now superseded.
- ~~**Per-event or per-trip timezones.** Times stay floating. A `trips.timezone` column is not
  part of this program.~~ **SUPERSEDED 2026-08-03 by Phase 5.** This exclusion rested on the
  floating-time premise above, which turned out to be wrong. `trips.timezone` (an explicit
  override) and `trips.resolved_timezone` / `trip_legs.resolved_timezone` (geocoder-derived
  cache) now exist — migration `011_location_timezones`. Per-*event* timezones are still out of
  scope: an event's zone comes from its trip or leg, and a flight's from its airport codes.
- **`VALARM` / reminders.** No alarms are emitted. Subscribers set their own in Google.
- **Per-leg or per-day calendar entries.** `trip_legs` are not calendar items.

### Relationship to `docs/calendar-sync/`

That folder specified the other approach — OAuth push into a Google secondary calendar — and was
never started. It is now marked **superseded** and archived in the root `projects.config.json`.

It is kept, not deleted, for one reason: its `ARCHITECTURE.md` mapping tables (lines 185-205) are
the best written record of how the six item tables map onto calendar events, and this program's
normalizer implements substantially the same rules. Cite it; do not follow its schema. Note its
migration is numbered `004_google_calendar`, which collides with the real `004_hike_event_fields`
— stale numbering, another reason it is not actionable.

---

## Data contract

### `CalendarItem`

The normalized shape every source row becomes. It is a structural **superset** of the
`EventInput` interface already in `export/route.ts`, so `buildVEvent` needs no signature change.

```ts
export interface CalendarItem {
  /** `${prefix}-${id}@travel.zo-bot.com`. Stable forever — see UID stability below. */
  uid: string;
  kind: CalendarItemKind;
  /** Source row id. The trip id for 'tripSpan'; the flight row id for BOTH flight legs. */
  id: string;
  tripId: string;
  tripTitle: string;
  tripStatus: TripStatus;
  /** null when the app deliberately shows no status: 'tripSpan' and hikes. */
  bookingStatus: BookingStatus | null;
  /** true only for trip_events where skipsBooking() holds. */
  noBookingNeeded: boolean;
  /** Only set when kind === 'event'. */
  eventCategory: EventCategory | null;
  /** The row's hide_from_calendar, OR'd with its trip's. */
  hidden: boolean;

  // --- structurally a superset of the existing EventInput ---
  summary: string;
  start: { date: string; time?: string | null };
  end?: { date: string; time?: string | null } | null;
  location?: string | null;
  description?: string | null;

  /** The source row's updated_at (ISO). Drives DTSTAMP and LAST-MODIFIED. */
  updatedAt: string;
}
```

### `CalendarItemKind` and UID prefixes

```ts
export type CalendarItemKind =
  | 'tripSpan' | 'event' | 'flight' | 'flightReturn'
  | 'hotel' | 'car' | 'parking' | 'transit';
```

| Kind | Source | UID prefix | Notes |
|---|---|---|---|
| `tripSpan` | `trips` | `trip-` | **New.** All-day banner across the trip |
| `event` | `trip_events` | `event-` | Date from `trip_days.date` via `trip_day_id` |
| `flight` | `trip_flights` | `flight-` | Outbound leg |
| `flightReturn` | `trip_flights` | `flight-return-` | **New.** See the bug note below |
| `hotel` | `trip_hotels` | `hotel-` | |
| `car` | `trip_rental_cars` | `car-` | |
| `parking` | `trip_parking` | `parking-` | |
| `transit` | `trip_transit` | `transit-` | |

The six existing prefixes are **unchanged from the current export route on purpose** — anyone who
already imported a `.ics` keeps matching UIDs rather than getting a duplicate set.

> **Bug this program fixes.** `export/route.ts:126-137` reads only `departureDate` /
> `arrivalDate` and never emits `returnDepartureDate` et al. A round-trip flight currently
> produces no return-leg event at all — nobody sees the flight home. The normalizer emits both
> legs from the one `trip_flights` row.

### `CalendarFeedFilters`

```ts
export interface CalendarFeedFilters {
  /** Trip-level gate. A trip whose status is not listed contributes nothing at all. */
  tripStatuses: TripStatus[];
  /** Item kinds to emit. 'tripSpan' is the all-day trip banner — just another kind. */
  kinds: CalendarItemKind[];
  /** Only consulted for kind 'event'. */
  eventCategories: EventCategory[];
  /** Only consulted for items that actually carry a booking status. */
  bookingStatuses: BookingStatus[];
  /** Events where skipsBooking() is true (walk-in restaurant, walk-up activity). */
  includeNoBookingNeeded: boolean;
  /** Days before today an item may end and still appear. null = unbounded. */
  windowPastDays: number | null;
  /** Days after today an item may start and still appear. null = unbounded. */
  windowFutureDays: number | null;
}
```

```ts
export const DEFAULT_FILTERS: CalendarFeedFilters = {
  tripStatuses: ['planning', 'confirmed', 'in-progress', 'completed'],
  kinds: ['tripSpan', 'event', 'flight', 'flightReturn', 'hotel', 'car', 'parking', 'transit'],
  eventCategories: ['flight', 'hotel', 'restaurant', 'activity', 'hike', 'transport', 'parking', 'note'],
  bookingStatuses: ['unbooked', 'pending', 'confirmed'],
  includeNoBookingNeeded: true,
  windowPastDays: null,
  windowFutureDays: null,
};
```

`EXPORT_PRESET` is the same object, used by the per-trip download so it keeps showing everything.

### The one predicate

`includeItem()` in `src/lib/calendar/filters.ts` is **the single answer** to "does this item
belong in this feed?". Both the feed route and the per-trip download call it. Do not re-test
these columns inline anywhere else.

```ts
/** `today` is 'YYYY-MM-DD', injected so this stays pure and testable. */
export function includeItem(item: CalendarItem, f: CalendarFeedFilters, today: string): boolean {
  // 1. Global per-item / per-trip hide. Wins over every filter.
  if (item.hidden) return false;

  // 2. Trip status.
  if (!f.tripStatuses.includes(item.tripStatus)) return false;

  // 3. Item kind (the only gate the trip-span banner answers to).
  if (!f.kinds.includes(item.kind)) return false;

  // 4. Event category — only meaningful for kind 'event'.
  if (item.kind === 'event' && !f.eventCategories.includes(item.eventCategory!)) return false;

  // 5. Booking gate. Three disjoint cases, no overlap:
  //    - noBookingNeeded        -> its own toggle, never the status list.
  //    - bookingStatus === null -> carries no status by design (trip span, hikes). Pass.
  //    - otherwise              -> must be in the chosen statuses.
  if (item.noBookingNeeded) {
    if (!f.includeNoBookingNeeded) return false;
  } else if (item.bookingStatus !== null) {
    if (!f.bookingStatuses.includes(item.bookingStatus)) return false;
  }

  // 6. Date window, on overlap (an item spanning today is always in).
  const lastDay = item.end?.date ?? item.start.date;
  if (f.windowPastDays !== null && lastDay < addDays(today, -f.windowPastDays)) return false;
  if (f.windowFutureDays !== null && item.start.date > addDays(today, f.windowFutureDays)) return false;

  return true;
}
```

**Three semantics that keep it from surprising people:**

- **Hikes emit `bookingStatus: null`.** The DB column is `NOT NULL DEFAULT 'unbooked'`, but the
  app never shows a status for a hike (`CLAUDE.md`, "Plans that need no booking";
  `EventCard.tsx:39`). Without this rule, a feed set to "only confirmed" would silently drop
  every hike. A hike is governed **only** by the `hike` checkbox in `eventCategories`.
- **"No booking needed" is a toggle, not a status.** `skipsBooking()` from `src/lib/bookings.ts`
  decides it; such an item never consults `bookingStatuses`. That makes "only confirmed
  bookings, but keep the walk-up stuff" expressible, which is the setting most people actually
  want.
- **The trip-span banner is not special-cased.** It is `kind: 'tripSpan'` with
  `bookingStatus: null` and `eventCategory: null`, and runs the identical predicate; gates 4 and
  5 are simply no-ops for it.

### UID stability, DTSTAMP, and SEQUENCE

- **UIDs are stable.** All ids are `crypto.randomUUID()` written once at insert
  (`src/app/api/trips/route.ts:31`) and never rewritten — every `colMap` omits `id`. So
  `event-<uuid>@travel.zo-bot.com` is stable for the life of the row.
- **`DTSTAMP` is the item's own `updated_at`, not "now".** The current export stamps every
  VEVENT with a single `toDateStamp()` at request time (`export/route.ts:109`). In a *polled*
  feed that makes every fetch byte-different even when nothing changed, which (a) makes an
  `ETag`/`304` impossible, (b) makes "did my edit land?" undiagnosable by diffing two fetches,
  and (c) is wrong per RFC 5545 §3.8.7.2, where DTSTAMP under `METHOD:PUBLISH` means *last
  revised*. Apple Calendar and Outlook key change-detection off it and will rewrite every event
  on every poll — with Outlook raising "updated" notifications for events nobody touched.
- **Emit `LAST-MODIFIED` with the same value.** One line; it is what Apple and Outlook actually
  read.
- **Do not emit `SEQUENCE`.** It must be a monotonically increasing integer per UID and there is
  no counter for it. A timestamp-derived value can go *backwards* after a clock change or a
  database restore, and a decreasing SEQUENCE makes strict clients **ignore** the update —
  strictly worse than omitting it, which is legal under `METHOD:PUBLISH`.

---

## Conventions every phase must honour

**Read `AGENTS.md`.** This is not the Next.js in your training data — it is 16.2.6. Check
`node_modules/next/dist/docs/` before using any API you half-remember. `params` is a `Promise`.
`src/proxy.ts` is what used to be `middleware.ts`.

**Migrations.** `runCustomMigration()` returning `true` **skips `migration.sql` entirely**
(`src/db/migrations.ts:323`). Every existing custom branch is ALTER-only, because
`ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` form. `CREATE TABLE IF NOT EXISTS` is already
idempotent and needs no branch (the `003`/`007` idiom). This is why the schema work is **two**
migrations, not one — a single migration containing both would have to re-emit its `CREATE TABLE`
inside the custom branch and duplicate the DDL. Check the array for anything newer than `008`
before picking numbers.

**Unit-testable modules must have zero runtime imports except node builtins.** `node --test`
resolves neither `@/` path aliases nor extensionless relative imports (Node's ESM resolver does
no extension guessing, and `allowImportingTsExtensions` is not in `tsconfig.json`). `import type`
is fine — it is erased before Node sees the file. This is why `admin-emails.ts` has no imports
and `legs.ts` has only type imports. It applies to `ics.ts`, `filters.ts` and `token.ts`.

**No `export const dynamic`.** Route Handlers are already uncached by default
(`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`), and the route
segment config is removed under Cache Components in v16. There are zero in `src/` today. Leave a
one-line comment saying why it is absent, so nobody adds it as "future-proofing".

**Never build the feed URL from `NEXT_PUBLIC_APP_URL`.** It is pinned to the legacy
`travel.zo-bot.com`, which 301s cross-hostname into a *different* Cloudflare Access application.
Build it from the forwarded headers nginx sets. The canonical origin is `https://zo-bot.com`
with basePath `/travel`.

**Every client-side fetch goes through `apiUrl()`** from `src/lib/api.ts`. A bare `/api/...` URL
breaks in production because of `NEXT_PUBLIC_BASE_PATH`.

**Date math.** Use `src/lib/dates.ts` and read its header comment. Never
`new Date('YYYY-MM-DD').toISOString()` — anchor at noon UTC. `localToday()` is in
`src/lib/trip-status.ts:29`.

**Testing.** There is no test runner and no `npm test`. Verification is `node --test` for the
pure modules, `npm run build`, `npm run lint` (**11 pre-existing warnings is the clean
baseline**, not a regression), curl, and the browser. Manual checks are recorded in
`TESTING.md`.

**Palette.** The Settings page uses `slate-*`. The itinerary components use `stone-*`. Match the
file you are editing, not the other one.

---

## Two things that will look like bugs

Say these out loud in the UI and in the phase reports, or the feature will be reported broken in
its first week.

1. **Google's poll interval is not controllable.** Changes commonly take **8–24 hours** to
   appear. There is no ping, no push, and no supported way to force a refresh short of deleting
   and re-adding the calendar. `X-PUBLISHED-TTL` and `REFRESH-INTERVAL` are **ignored by Google**
   (Apple and Outlook honour them, which is why we still emit them). With two subscribers this
   is worse than it sounds: Google polls each subscription independently, so Chris's and Kate's
   calendars will legitimately disagree with each other for hours at a time.
2. **Cloudflare Access blocks Google's fetcher** until the Phase 4 bypass exists. Google gets a
   302 to `cloudflareaccess.com` and reports only "Could not fetch the URL". Nothing works before
   that manual dashboard step, and it cannot be verified from a browser that already holds an
   Access session.

---

## Acceptance test

Run end to end after Phase 4. This is the whole program working, not a phase check.

1. On the Settings page, copy the feed URL.
2. In Google Calendar → *Other calendars* → *From URL*, paste and subscribe. Trips appear.
3. Repeat from the second Google account. Both calendars show the same items.
4. In travel-app, add a restaurant event with booking status **unbooked**.
5. In Settings, uncheck **unbooked** under Bookings and Save. The included count drops.
6. `sqlite3 local.db "SELECT last_fetched_at, last_fetched_user_agent FROM calendar_feeds"`
   shows a recent fetch by `Google-Calendar-Importer`.
7. Within Google's poll window, the unbooked event is **gone from both calendars** — not merely
   absent from new fetches. That is the wholesale-replacement mechanic working.
8. Open a hike in the trip and confirm it is still present with "only confirmed" bookings
   selected — hikes are governed by their category, never by booking status.
9. Rotate the token in Settings. Both old URLs now 404; the new one 200s.
