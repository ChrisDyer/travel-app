# Phase 2 — Overview page

**Repo:** travel-app. **Read `00-overview.md` first.**

Turns `/` from a one-line redirect into the app's front door, and extracts the cross-trip
aggregation that makes it possible into a shared module that `/api/summary` also uses.
**No schema. No new npm dependency.**

---

## 1. `src/lib/agenda.ts` — the aggregation layer

Server-only (it imports `@/db`). This is the single source of "what needs my attention across
all trips". Today the only aggregation of this kind is private to
`src/app/api/summary/route.ts`: `daysUntil()` at line 21 and `cancellationsForTrip()` at
line 33. **Extract and generalize those rather than writing a second copy.**

Export at least:

```ts
export interface AgendaTripRef { id: string; title: string; }

/** Trips whose end_date >= today, soonest first. */
export function upcomingTrips(userId: string, today: string, limit?: number): Trip[];

/** Dated hotel + event cancellation deadlines across all trips, soonest first. */
export function cancellationDeadlines(
  userId: string,
  today: string,
): { trip: AgendaTripRef; type: 'hotel' | 'event'; label: string; deadline: string; daysUntil: number }[];

/** Everything still awaiting a booking, across all upcoming trips. */
export function needsBooking(
  userId: string,
  today: string,
): { trip: AgendaTripRef; kind: 'event' | 'flight' | 'hotel' | 'rentalCar' | 'parking' | 'transit'; label: string; date: string | null }[];

/** Upcoming trips with zero trip_events — planned but not filled in. */
export function emptyItineraries(userId: string, today: string): AgendaTripRef[];
```

`today` is passed in rather than read inside, so the functions stay testable and every caller
in one request agrees on the date. Callers get it from `localToday()` in
`src/lib/trip-status.ts`.

### `cancellationDeadlines`

The existing query is the right one — hotels UNION events, `cancellation_deadline IS NOT NULL
AND trim(...) != ''`, then filtered by `/^\d{4}-\d{2}-\d{2}$/` in JS. Generalize it from one
`trip_id` to all trips owned by `userId`, joining `trips` so each row carries its trip's id
and title. Keep returning **all** dated deadlines including past ones — the caller decides the
window (see §2).

### `needsBooking`

- `trip_events`: `booking_status = 'unbooked'`, **filtered through `skipsBooking()` from
  `src/lib/bookings.ts`**, and excluding `category = 'hike'` (hikes carry no booking status at
  all). Do **not** re-test `takes_reservations` inline — the app's `CLAUDE.md` is explicit,
  and the column's name does not mean what it says.
- `trip_flights`, `trip_hotels`, `trip_rental_cars`, `trip_parking`, `trip_transit`:
  `booking_status = 'unbooked'` or `IS NULL`. Each has a different natural label column
  (`airline`/`flight_number`, `name`, `company`, `location`, `operator`) and a different
  natural date column — normalize both in this module so the page renders one uniform list.
- Scope to upcoming trips only. A trip that ended last month with an unbooked hotel is noise,
  not an action.

Because `skipsBooking()` is a JS predicate over a row, the event query fetches candidates and
filters in JS. That is fine at this data size (9 events today); do not push it into SQL by
re-implementing the rule.

### `emptyItineraries`

Upcoming trips where `(SELECT COUNT(*) FROM trip_events WHERE trip_id = trips.id) = 0`.
All five trips in the local DB will match some of these — that is the point, and it makes the
page easy to verify.

## 2. Refactor `/api/summary` onto it

`src/app/api/summary/route.ts` feeds the **cross-app homepage dashboard, in a different
repo**. Rule 4 in `00-overview.md`: **its JSON must not change.**

Specifically, preserve the semantics documented in its own comment at line 51:

- `cancellations.count` and `cancellations.next` — computed over **all** dated deadlines for
  that trip, including past ones, for backward compatibility.
- `cancellations.upcoming` — only `daysUntil >= 0 && daysUntil <= 30`, `.slice(0, 10)`, and
  each entry has exactly `{ type, label, deadline, daysUntil }` — **no `trip` key**.

So `agenda.cancellationDeadlines()` returns trip-tagged rows, and this route filters to one
trip and strips the tag. If that feels redundant, it is the price of one query instead of two.

Everything else in the route — `homepageCoverUrl()`, the `nextTrip` shape, the `/travel/api/...`
absolute cover URL — stays exactly as it is.

**Capture the current response before you start** (`curl -s localhost:3000/travel/api/summary
> /tmp/summary-before.json`) and diff it at the end. That diff is the verification.

## 3. The page — `src/app/page.tsx`

Replace `redirect('/trips')` with a server component wrapped in `<TravelShell title="Overview"
…>`. Add its own nav row? No — Phase 1 already shipped the Overview row; this phase just makes
the destination real.

Sections, top to bottom:

**Next trip hero.** The soonest trip with `end_date >= today`.
- Cover image via `/api/trips/{id}/cover-image` (through `apiUrl()`), with a graceful fallback
  when the trip has no blob — `homepageCoverUrl()` in the summary route shows how to test for
  one.
- Title, destination, formatted date range (`formatDateRange` in `src/lib/dates.ts`).
- The timing line from `tripTiming()` in `src/lib/trip-status.ts` — "In 5 days" / "Day 2 of 8"
  / "Ended Aug 15". Do not re-derive this.
- Status badge using `statusColors` / `statusLabel` from the same module.
- Whole card links to `/trips/{id}`.
- If the trip is **in progress**, list today's `trip_events` under it, ordered the way the
  itinerary orders them (timed first by `start_time`, then untimed by `sort_order`).

**Weather.** Reuse the existing `<TripWeather>` client component **as-is**, pointed at the
next trip. It is already leg-aware and handles its own `available: false` states
(`too_far_out`, `location_not_found`, `no_forecast`). Pass `legsVersion` the same way
`src/app/trips/[tripId]/page.tsx` does — `MAX(trip_legs.updated_at)`, `''` if none. Do not
fork or reimplement it.

**Action list.** Three groups, each collapsible-free and each row linking into its trip:
- *Cancellation deadlines* — next 30 days, soonest first, showing the trip name and a relative
  phrase ("in 3 days").
- *Needs booking* — grouped by trip.
- *Nothing planned yet* — trips from `emptyItineraries()`.

If all three are empty, show one calm "Nothing needs attention" state rather than three empty
sections.

**Next trips strip.** The following three upcoming trips as compact cards. Reuse the card
treatment from `src/components/trips/TripsClient.tsx` if it factors out cleanly; if it does
not, write a small local card rather than refactoring the trips list — that page is not in
scope.

**Empty state.** No upcoming trips at all → a single panel with a short line and a "Plan a
trip" button linking to `/trips/new`, hidden for read-only users via `useReadOnly()`. This is
the app's front door and cannot render as a blank page.

### Composition notes

- This is a **server component**: query once, pass plain data down. `TripWeather` is the only
  client island; do not make the page `"use client"`.
- Palette is `slate-*` (rule in `00-overview.md`). Do not copy stone classes out of
  `ItineraryDocument`.
- The page must be readable at 375px — the action list is the part most likely to overflow.
- `no-print` is unnecessary here; the page is not part of the print flow.

## 4. What this phase must NOT touch

- `src/db/` — no schema.
- The `nextTrip` JSON contract in `/api/summary` (§2).
- `src/components/itinerary/TripWeather.tsx` — reuse, do not modify.
- `src/components/trips/TripsClient.tsx` — read it, do not refactor it.
- Anything under `src/appShell/` — Phase 1 finished the shell.
- `src/lib/bookings.ts`, `dates.ts`, `trip-status.ts` — consume them; if one is genuinely
  missing a helper, add it there rather than inlining a variant on the page.

---

## Verification

Back up first — see the WAL-safe backup command in `00-overview.md`; **not** `cp`. This phase
only reads, but the next one writes.

Run `npm run dev` (port **3000**, base path `/travel`).

1. **The frozen contract:** `curl -s localhost:3000/travel/api/summary | python -m json.tool`
   and diff against the capture you took before starting. **Byte-identical apart from key
   order.** If `upcoming` gained a `trip` key, you broke the homepage.
2. `curl` the same endpoint on a trip whose only deadline is in the past → `count` is still
   non-zero and `next` is still populated, while `upcoming` is `[]`. This is the
   backward-compatibility case the comment at `route.ts:51` protects.
3. `/travel/` renders the Overview, not a redirect. Confirm there is no redirect in the network
   tab.
4. The hero shows the soonest trip with `end_date >= today`. Cross-check against
   `SELECT id, title, start_date, end_date FROM trips ORDER BY start_date` — the local DB has
   Washington (Aug 8–15 2026) and Paris (Dec 27 2026 – Jan 3 2027) among five.
5. Temporarily edit a trip's dates so it spans today → the hero shows "Day N of M" and today's
   events appear. Change it back.
6. A trip with no cover image renders the hero without a broken image.
7. The weather strip appears and matches what `/travel/trips/{id}` shows for the same trip.
8. Action list: the local DB has hotels with `cancellation_deadline` set and unbooked rows —
   confirm at least one row in each of the three groups, and that **every row's link lands on
   the right trip**.
9. Add an activity with "Needs booking? = No" → it does **not** appear under Needs booking.
   Add a hike → it does not appear either. This is `skipsBooking()` doing its job; prove it in
   the UI, not by reading the code.
10. Mark everything booked in a scratch trip and confirm the group disappears rather than
    rendering an empty heading.
11. 375px: no horizontal scroll, action rows wrap, hero image does not overflow.
12. Read-only (`ADMIN_EMAILS` set to another address): the page renders fully and the "Plan a
    trip" button is hidden.
13. `npm run build` and `npm run lint` clean.
14. Undo any test edits; leave `local.db` as you found it.

**Done when:** the summary diff is empty and every action row links to the correct trip.

Then append a Phase 2 report to `PROGRESS.md`, update its Status blockquote, and run
`node tools/project-status.mjs` from `C:\Users\chris\OneDrive\Apps\zo-bot.com`.
