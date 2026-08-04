@AGENTS.md

## Operational docs

- `RUNBOOK.md` — production operations on the Hetzner VPS (PM2 `start.sh` wrapper,
  nginx, backups, rollback, Next.js standalone quirks like `DB_PATH` and the
  static-asset copy steps).
- `DEPLOY.md` (gitignored) — first-time VPS setup checklist.
- `TESTING.md` — test strategy and commands.
- Deploys: commit + push, then run `Deploy-Travel` from PowerShell (`$PROFILE`).

**Backing up `local.db`: never `cp`.** SQLite runs in WAL mode here, so recent commits live
in `local.db-wal` until a checkpoint and a plain `cp` of the main file silently omits them
(measured 2026-08-01: three weeks of data missing from such a copy). Use
`sqlite3 local.db ".backup 'local.db.bak'"`, or without the CLI:
`node -e "require('better-sqlite3')('local.db',{readonly:true}).prepare(\"VACUUM INTO 'local.db.bak'\").run()"`.
The production backup cron had the same flaw and was silently losing data; fixed 2026-08-01
to use `sqlite3 .backup` — see the history note in `RUNBOOK.md`.

## Per-user read-only role

`ADMIN_EMAILS` (comma-separated, case-insensitive) gates writes: any authenticated
Cloudflare Access email not in the list gets 403 `{"error":"read_only"}` on unsafe
`/api` methods (checked in `src/proxy.ts`, sharing `parseAdminEmails()` from
`src/lib/admin-emails.ts`) and has write controls hidden client-side. Unset/empty =>
everyone is admin (fail-open). `getAccessInfo()` in `src/lib/auth.ts` reads the role
server-side for the root layout, which wraps the app in `ReadOnlyProvider`
(`src/lib/read-only.tsx`); components call `useReadOnly()`. No `/api/me` endpoint is
needed — this app has no client-side auth fetch, everything comes from server
components reading `headers()`. See `docs/plans/2026-07-per-user-read-only/04-travel.md`
(Phase 4 of the cross-app program) for the full design.

## Plans that need no booking

Not every plan is bookable: a restaurant may not take reservations, an activity may be a
walk-up (a stroll, a self-guided walking tour), a note is rarely booked at all, parking may
be a metered kerbside space, a transit leg may be a metro ride paid at the gate. All of them
share one column name — `takes_reservations` (`1` = needs booking, the default) — on three
tables: `trip_events` (migration `005_restaurant_event_fields`) and `trip_parking` /
`trip_transit` (migration `012_optional_booking_parking_transit`). The name predates
everything but the restaurant case; read it as **"does this need booking?"**.

Helpers live in `src/lib/bookings.ts`. Use them rather than re-testing the column inline:

- `bookingIsOptional(category)` — the **event categories** that offer the toggle: restaurant,
  activity, note. Flights, hotels and rental cars are always bookings and never get it.
- `skipsBooking(item)` — "this plan needs nothing booked". **One predicate for both shapes**:
  pass a `trip_events` row (gated on category as well) or a `trip_parking` / `trip_transit`
  row, which has no `category` and is decided by the flag alone — every parking space or
  transit leg may be a walk-up. Structural typing picks the branch; do not split it in two.
- `noBookingLabel(category?)` — the wording. Only restaurants say "No reservations"; everything
  else, including the category-less kinds, says "No booking needed".

When the flag is off the item carries no booking status: the form hides the confirmation /
vendor / seat / cancellation fields and **nulls them on save**, the card, `KeyBookings` row and
detail sheet show a grey badge instead of the red "Needs Booking" one, `CancellationDeadlines`
leaves it out of the "Needs Booking" list, and the calendar feed sets `noBookingNeeded` so the
item answers to the feed's `includeNoBookingNeeded` toggle rather than its booking-status list.

Hikes are separate — they never have a booking status at all, whatever the flag says.

## Trip brief

A free-text planning memory per trip: the traveller's stated goals, must-dos, constraints,
open questions and rejected ideas — the intent behind an itinerary, which the itinerary
itself does not record. Four columns on `trips` (migration `006_trip_brief`):
`planning_notes` (the brief; `NULL` when unset, never `''`), `planning_notes_previous`
(the value displaced by the most recent write), `planning_notes_updated_at`,
`planning_notes_updated_by` (`'you'` or `'assistant'`).

- **One write path.** `planningNotes` is deliberately **absent** from the `colMap` in
  `src/app/api/trips/[tripId]/route.ts`, and from `TRIP_FIELDS` in
  `mcp-server/travel-write.js`. The brief is writable only through
  `PUT /api/trips/{tripId}/brief`. A second write path would bypass the snapshot and the
  attribution, and the Undo button would then lie. Both exclusions carry comments saying so.
- **Authorship is server-derived**, never from the request body: a request whose
  `x-internal-token` matches `INTERNAL_API_TOKEN` is `'assistant'`, everything else is
  `'you'`. A client cannot claim to be Claude.
- **Undo is a self-inverting swap**, one level deep. Every write snapshots the outgoing
  content into `planning_notes_previous` in the same `UPDATE`; undo swaps the two columns,
  so undoing twice returns you to where you started and a mis-clicked undo costs nothing.
  Do not "improve" this by clearing `previous`.
- The panel never bumps `trips.updated_at` — `src/app/trips/[tripId]/page.tsx` passes it as
  `key` to `<ItineraryDocument>`, so bumping it would remount the whole client tree.
- Claude reaches it over MCP through `travel_get_trip_brief` / `travel_update_trip_brief`.

Full design in `docs/trip-brief/`.

## Trip legs

A trip leg is one stay within a trip: `trip_legs.place` plus an inclusive `start_date` / `end_date`. `trips.destination` is unchanged and remains the trip headline plus the fallback location when no leg covers a date.

- **One resolver.** `src/lib/legs.ts` is the single answer to "where am I on date X?". Gaps fall back to `trips.destination`. Overlaps are allowed; the leg with the later `startDate` wins, with `sortOrder` and then `id` as deterministic tiebreakers. Weather and UI warnings must call this helper instead of reimplementing the rule.
- **Place changes invalidate geocodes.** Any path that changes `trip_legs.place` must clear `latitude`, `longitude`, and `resolved_name` in the same write. The PATCH route enforces this; the weather route is the only code that fills those derived cache columns.
- **Leg writes never bump `trips.updated_at`.** The trip page keys `<ItineraryDocument>` by `trip.updatedAt`; changing it remounts the client tree and drops open panels/forms. Weather refreshes through `legsVersion` (`MAX(trip_legs.updated_at)` in `src/app/trips/[tripId]/page.tsx`) plus `router.refresh()` after successful leg edits.
- Overlaps, gaps, and legs outside the trip range are deliberately legal. The editor warns about them but does not block saving. Only reversed ranges (`endDate < startDate`) are rejected.
## Calendar feed

A subscribe-able ICS feed at `/api/calendar/feed/{token}.ics` that Chris and Kate each add to
their own Google Calendar via "From URL". It replaced a Google OAuth push-sync design (see
`docs/calendar-sync/`, superseded) because a feed gives each person their own subscription with
no OAuth, no token refresh and no drift reconciliation. Full design in `docs/calendar-feed/`.

- **One shared feed, many subscribers, one view.** `calendar_feeds` is row-per-feed and the
  `(user_id, slug)` unique index means a second feed needs only a new row — but the UI offers
  exactly one, so everyone subscribed sees the same filtered view. Per-subscriber feeds were
  considered and deliberately declined.
- **The token in the path is the whole credential.** `/api/calendar/feed/` is the single entry in
  `PUBLIC_PATH_PREFIXES` in `src/proxy.ts` and is bypassed at Cloudflare Access (`RUNBOOK.md`
  §12a). That is safe only because the route file exports **nothing but `GET`** — Next answers
  405 to everything else, so the bypass has no write path to open. Never add another method to
  that file, and never widen the prefix. Feed management lives at `/api/calendar/config`,
  deliberately outside the prefix so it stays behind Access and the `ADMIN_EMAILS` write gate.
- **Rotation is the only revocation, and it breaks every subscription.** The old URL 404s and
  each subscriber's calendar silently freezes at its last successful fetch — Google does not
  delete a calendar that stops resolving. Everyone must delete and re-add.
- **Narrowing a filter deletes events from every subscribed calendar.** The feed body *is* the
  state; Google replaces the whole calendar on each poll. There is no "unpublish just for me".
- **Booking details are withheld by default.** `includeBookingDetails` defaults to `false` and
  `redactItems()` drops the whole `DESCRIPTION` — not a pattern-match, because card fragments and
  loyalty numbers live in hand-written `notes` and a redactor that is 90% right on secrets is
  worse than useless. `EXPORT_PRESET` sets it `true`: the per-trip download is authenticated and
  goes to your own machine, so the reasoning does not apply there. Both callers go through the
  single `prepareItems()` (filter **and** redact) — a route that called `filterItems` alone would
  silently publish confirmation numbers to a public URL.
- **`hide_from_calendar` is global, not per-feed**, on seven tables including `trips`. A hidden
  item is hidden from every feed *and* from the per-trip download; the trip-level column cascades
  to everything beneath it. It is not a per-person control.
- **`src/lib/calendar/filters.ts` owns the only predicate (`includeItem`) and the only filter
  validator (`parseFeedFilters`).** Do not add a Zod schema beside it and do not re-test these
  columns inline anywhere else. `DEFAULT_FILTERS` and its arrays are frozen, and
  `parseFeedFilters` returns fresh arrays, because the settings UI and management API both
  parse-then-modify.
- **Hikes carry `bookingStatus: null` into the feed on purpose** (the app never shows a status for
  one), so a feed set to "confirmed only" does not silently drop every hike. A hike is governed
  only by the `hike` checkbox in `eventCategories`.
- **An event whose category is outside `EventCategory` fails open** and is included. The settings
  UI renders one checkbox per known category, so an unknown one has no checkbox and could never
  be switched back on; a real booked event silently missing from a calendar is the worse failure.
  There is a live `'sports'` row that this rule rescues.
- **`ics.ts`, `filters.ts` and `token.ts` must stay free of runtime imports** (type-only is fine)
  so `node --test` can load them — it resolves neither the `@/` alias nor extensionless relative
  imports. `token.ts` is separate from `filters.ts` so the client component can import filter
  types without dragging `node:crypto` into the browser bundle.
- **`fold()` measures octets, not JavaScript string length**, and walks whole code points. Em
  dashes and the emoji summary prefixes make those differ; the old length-based version emitted
  over-long lines and could split a surrogate pair.
- **`DTSTAMP`/`LAST-MODIFIED` come from each row's `updated_at`, never `now`**, so two fetches with
  no edits are byte-identical — within a deploy. A Node upgrade shipping new tzdata can legitimately
  change a future instant with no edit; that is correct, not a regression.
- **Times are absolute UTC instants (`...Z`), never floating.** This reversed a Phase 1–4 decision:
  RFC 5545 says a zone-less datetime is "local wherever viewed", but Google normalises it to UTC in
  a subscribed feed, so every timed event rendered hours off. `dtProperty` has no floating branch
  left — the only two outputs are a `Z` instant and an all-day `VALUE=DATE`, which makes the
  regression unrepresentable. `X-WR-TIMEZONE` is still absent, but now because Google reads it as
  the calendar's *display* zone and it would override each subscriber's own preference.
- **A wall time is resolved to a zone by `items.ts`, not by `ics.ts`** — that is what keeps `ics.ts`
  import-free. Chain, first hit wins: the endpoint's airport (`extractIata` → `airportTimeZone`,
  flights only) → the leg covering that endpoint's date → `trips.timezone` (user override) →
  `trips.resolved_timezone` (geocoder cache) → the other endpoint's zone. **Flights resolve each end
  separately and `flightReturn` swaps them** — the return leg departs from the arrival airport.
- **Nothing falls back to a default or "home" zone.** An item whose zone cannot be resolved is
  published as **all-day with the wall time prepended to its SUMMARY**, tagged `X-ZO-TZ:unresolved`,
  UID unchanged. A plausible-looking wrong zone (a Paris dinner rendered in Chicago) *looks*
  correct, which is exactly the silent failure this replaced. The count is surfaced in Settings.
- **`trips.timezone` survives a destination edit; `resolved_timezone` does not.** The derived cache
  is cleared alongside `latitude`/`longitude`/`resolved_name`; the override is the user's and is
  never cleared. This matters for ambiguous names — "Washington" geocodes to DC, not Seattle.
- **`fold()`, `wallTimeToInstant` and `isValidTimeZone` are the three easy things to "simplify"
  wrongly.** `fold` measures octets and walks code points. `wallTimeToInstant` brackets and
  validates — the common guess-then-correct-once form walks *backwards* through a spring-forward
  gap. `isValidTimeZone` must try/catch `Intl.DateTimeFormat`, never look in
  `Intl.supportedValuesOf('timeZone')`: those disagree (`Asia/Kolkata` is accepted but unlisted).
- `src/lib/calendar/airport-timezones.ts` is **generated** by `tools/build-airport-timezones.mjs`
  (OurAirports + `tz-lookup`, a devDependency). Do not hand-edit. Regenerate only when the picker
  gains airports — zone *renames* are absorbed by tzdata links.

## Plan folders

New multi-phase plans go under `docs/<slug>/` (see `docs/redesign`, `docs/fixes`,
`docs/calendar-sync`) with a `PROGRESS.md` per the convention in the root `CLAUDE.md`.
Register the folder in the root `projects.config.json` (path + `totalPhases`) and run
`node tools/project-status.mjs` from the repo root.

## App-level pages

Routes: `/` is the Overview dashboard, `/trips` lists trips, `/trips/new` creates one,
`/trips/{id}` is the itinerary, `/trips/{id}/print` is chrome-free print output, `/map`
plots trips, and `/settings` shows connections/access/exports.

Local nav active state comes from `usePathname()` via `matchNav()` in
`src/appShell/TravelShell.tsx`. There is no `activeLocalNav` prop; pages do not pass nav
state. Mobile local nav is `src/appShell/MobileNavDrawer.tsx` and renders the same nav model.

Trip destination geocodes are derived cache on `trips`: `latitude`, `longitude`, and
`resolved_name`. Any write that changes `trips.destination` must clear all three in the same
`UPDATE`; a write that resends the same destination must not clear them. `GET /api/map` is the
only code that fills them, and cache writes never bump `trips.updated_at` because the trip page
keys `<ItineraryDocument>` by that value.

`src/lib/agenda.ts` is the single cross-trip aggregation used by both the Overview page and
`/api/summary`. `/api/summary` is consumed by the homepage app; its JSON shape is frozen.
`src/lib/geocode.ts` is the one Open-Meteo geocoder shared by weather and `/api/map`.
## Downstream MCP write registry

`mcp-server/travel-write.js` mirrors the writable `colMap` field lists in
`src/app/api/trips/**`. When a migration or route change adds a writable column, update
that registry too, or Claude's travel write tools will reject the new field as unknown. The derived trip geocode columns (latitude, longitude, esolvedName) are deliberately excluded from TRIP_FIELDS.

`takesReservations` is registered for the `event`, `parking` and `transit` kinds — the three
tables carrying the column. `validateFields()` in that file coerces JS booleans to `0`/`1`
before the request goes out, because travel-app binds request values straight into
better-sqlite3, which rejects booleans outright. That is what makes the registry's documented
`booleans` convention true; don't remove it.

`hideFromCalendar` is registered there — in `TRIP_FIELDS.fields` and in the `fields` of the
`event`, `flight`, `hotel`, `rental_car`, `parking` and `transit` kinds — so Claude can hide an
item from the calendar feed. `calendar_feeds` is deliberately **not** exposed: feed configuration
is not a trip write.
