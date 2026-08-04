# Calendar Feed — Progress

> **Status: Phase 3 complete — settings UI, the per-item hide control, and feed redaction
> (booking details withheld by default) are in. Next: Phase 4 (deploy, Cloudflare, docs).**
> Append one report per completed phase (format below). Never rewrite an earlier
> phase report; later corrections are new dated entries.

Plan folder: `docs/calendar-feed/`. Read `00-overview.md` before any phase.
Agent prompts: `prompts.md`.

Supersedes `docs/calendar-sync/` (Google OAuth push sync, never started).

Report format (copy the skeleton):

```markdown
## Phase N — <title> — YYYY-MM-DD

**Status:** complete | complete-with-deviations | blocked
**What was built/done:** …
**Deviations from spec (and why):** …
**Known gaps / follow-ups:** …
**Verification evidence:** …
```

## Phase 1 — Schema and shared normalizer — 2026-08-03

**Status:** complete

**What was built/done:**

- **Migrations.** `009_calendar_feed` creates `calendar_feeds` with the two unique indexes
  (`token`, and `(user_id, slug)`), CREATE-only with no `runCustomMigration` branch and no seed
  row. `010_hide_from_calendar` adds `hide_from_calendar INTEGER NOT NULL DEFAULT 0` to all seven
  tables (`trips` included) with a custom branch driving `addColumnIfMissing` over a shared
  `HIDE_FROM_CALENDAR_TABLES` list.
- **Types and write paths.** `hideFromCalendar: number` on `Trip`, `TripEvent`, `TripFlight`,
  `TripHotel`, `TripRentalCar`, `TripParking`, `TripTransit`; added to the `colMap` of the trip
  PATCH and all six item PATCH routes, and to the explicit column lists of the corresponding
  POST routes.
- **`mcp-server/travel-write.js`** updated in the same session per the "Downstream MCP write
  registry" rule: `hideFromCalendar` added to `TRIP_FIELDS.fields` and to the `fields` of the
  `event`, `flight`, `hotel`, `rental_car`, `parking` and `transit` kinds. `calendar_feeds` is
  deliberately not exposed. (Separate git repo — the edit is in its working tree, uncommitted,
  and needs its own commit alongside this one.)
- **`src/lib/calendar/ics.ts`** — the RFC 5545 helpers moved verbatim out of the export route,
  with the two specified changes: `nextDay` re-anchored to noon UTC, and `buildVEvent(item)`
  emitting `DTSTAMP` **and** `LAST-MODIFIED` from the item's own `updatedAt` (epoch fallback when
  missing/unparseable). New `buildCalendar()` adds `X-WR-CALDESC`, `X-PUBLISHED-TTL:PT12H` and
  `REFRESH-INTERVAL`, deliberately omits `X-WR-TIMEZONE` (commented so it is not "fixed" later),
  and emits the single placeholder VEVENT when the calendar is empty.
- **`src/lib/calendar/filters.ts`** — `CalendarItem`, `CalendarFeedFilters`, `DEFAULT_FILTERS`,
  `EXPORT_PRESET`, `includeItem`, `filterItems`, `countByKind`, `parseFeedFilters`,
  `serializeFeedFilters`. Type-only import, so `node --test` loads it and the Phase 3 client
  component can import from it.
- **`src/lib/calendar/token.ts`** — `newFeedToken`, `isValidTokenShape`, `stripIcsSuffix`, kept
  separate so `node:crypto` never reaches the browser bundle.
- **`src/lib/calendar/items.ts`** — the single normalizer. One query per source table, scoped by
  `trip_id` for a single trip or by `user_id` for a whole feed; summary/description formatting
  and emoji prefixes carried over verbatim; `skipsBooking()` reused for `noBookingNeeded`;
  hikes emit `bookingStatus: null`; adds the `tripSpan` banner and the `flightReturn` leg; `hidden`
  is the row flag OR'd with its trip's; result sorted by `(start.date, start.time ?? '', uid)`.
- **Export route refactored** to `buildCalendarItems` → `filterItems(EXPORT_PRESET, localToday())`
  → `buildCalendar`, keeping its `Content-Disposition: attachment`, `safeName` slug and 404.

**Three deliberate behaviour changes to the `.ics` download** (all improvements, as specified):

1. It now honours `hide_from_calendar` — both the per-item flag and the cascading trip-level one.
2. It now includes the trip-span banner (`UID:trip-…`) and the return flight leg
   (`UID:flight-return-…`); the latter is a **bug fix** — a round-trip flight previously produced
   no return-leg event at all, so nobody ever saw the flight home.
3. `DTSTAMP` is now per-item (from the row's `updated_at`) rather than request-time, and
   `LAST-MODIFIED` is new.

**Deviations from spec (and why):**

- **None functional.** One documentation correction: the spec's verification step 4 expects "11
  pre-existing lint warnings" as the clean baseline; `npm run lint` actually reports **12**, all
  in files this phase never touched (`src/app/page.tsx`, `src/components/**`, `src/lib/auth.ts`).
  `npx eslint` over only this phase's new and modified files exits 0, so this phase added zero
  warnings — the "11" figure in `00-overview.md` was already stale.
- Verification step 8 asks for a plain `diff` of before/after showing only four kinds of changed
  line. Because step 6 mandates sorting the normalizer's output, the raw `diff` is dominated by
  reordering. It was therefore verified **structurally instead**: VEVENT blocks unfolded and
  compared per UID, ignoring `DTSTAMP`/`LAST-MODIFIED`. Result: 2 UIDs added (`trip-…`,
  `flight-return-…`), **0 removed, 0 pre-existing bodies changed** — the stronger form of the
  same guarantee.

**Known gaps / follow-ups:**

- Verification step 12 (feed the output to `icalendar.org/validator.html`) was **not run**: the
  `.ics` contains real hotel confirmation numbers and a card fragment, so it should not be pasted
  into a third-party site without Chris's say-so. A local RFC 5545 structural check was run
  instead and passed (CRLF throughout, no line over 75 octets, BEGIN/END balanced, every VEVENT
  carrying UID/DTSTAMP/DTSTART, all date and UTC-stamp values well-formed, UIDs unique, no
  `X-WR-TIMEZONE`).
- Two fixture rows created during this phase are still on the real Washington (August 2026) trip:
  `CALFEED TEMP Hurricane Ridge hike` and `CALFEED TEMP Walk-in taco place`. They exist to give
  the export a hike and a walk-in restaurant to exercise. Delete them when they are no longer
  wanted.
- No UI exposes `hideFromCalendar` yet — it is API/MCP-writable only. That is Phase 3.

**Verification evidence:**

1. `node --test "src/lib/calendar/*.test.mjs"` — **66 pass, 0 fail** (ics 26, filters 29, token 11).
2. `node --test "src/lib/*.test.mjs"` — **13 pass, 0 fail**; `legs`, `admin-emails` and
   `destinations` unbroken.
3. `npm run build` — clean.
4. `npm run lint` — 12 warnings, 0 errors, none in this phase's files (see deviation above).
5. Dev server restarted twice more after the first migration run; `schema_migrations` holds
   `009_calendar_feed` and `010_hide_from_calendar` exactly once each. No migration errors logged.
6. `.schema calendar_feeds` shows `idx_calendar_feeds_token` and `idx_calendar_feeds_user_slug`.
7. `PRAGMA table_info(trip_transit)` shows `hide_from_calendar` with `notnull=1`, `dflt_value=0`.
8. Structural before/after comparison on trip `3b2ba202` (round-trip flight, 2 hotels, hike,
   walk-in restaurant): 6 VEVENTs → 8. Added `UID:trip-3b2ba202…` and
   `UID:flight-return-ad2ba979…`; **no UID removed or altered**; every pre-existing VEVENT body
   byte-identical apart from `DTSTAMP` and the new `LAST-MODIFIED`.
9. `PATCH {"hideFromCalendar":1}` on event `946b8b9b` → that VEVENT gone, 8 → 7 VEVENTs; set back
   to `0` → returns, 7 → 8. Asserted on the re-GET, not the status code.
10. `hide_from_calendar = 1` on the **trip** row → export collapses to the single
    `empty-placeholder@travel.zo-bot.com` VEVENT; cascade confirmed. Restored to `0`; both hide
    columns verified back at zero rows set.
11. Two consecutive `curl`s with no edits between them are **byte-identical** (`diff` empty) —
    the per-item DTSTAMP contract holds.
12. Local RFC 5545 structural validation passed (see gaps above for the online validator).
13. App unchanged in the browser: `/`, `/trips`, `/trips/{id}`, `/trips/{id}/print`, `/settings`
    and `/map` all return 200; export keeps `Content-Type: text/calendar; charset=utf-8`,
    `Content-Disposition: attachment; filename="washington-august-2026.ics"`, and an unknown trip
    still 404s.

## Phase 1 — Correction: two latent bugs fixed before Phase 2 — 2026-08-03

**Status:** complete

Reviewing Phase 1 before starting Phase 2 surfaced two real defects in the shared modules. Both
were fixed in place; the Phase 1 report above stands as written.

**1. `parseFeedFilters` handed out the module's own default arrays** (`filters.ts`).

`parseFeedFilters('{}').kinds === DEFAULT_FILTERS.kinds` was `true`, so any caller that mutated
what it was given silently redefined the defaults for every later parse in the process. That is
precisely the access pattern of Phase 2's management API and Phase 3's settings UI, both of which
parse-then-modify, and the symptom would have appeared nowhere near the cause. The existing test
asserted only that the top-level object was fresh, which gave false confidence.

Fixed by returning a copy of the fallback from `parseEnumArray`, and by `Object.freeze`-ing
`DEFAULT_FILTERS` and each of its four arrays so a stray write throws instead of corrupting
state. `EXPORT_PRESET` keeps its documented identity with `DEFAULT_FILTERS`, which is now safe
because both are frozen. Five tests added, including one asserting no array is shared and one
asserting two parses are independent.

**2. `fold()` measured UTF-16 code units instead of octets** (`ics.ts`).

RFC 5545 limits a content line to 75 **octets**. The helper — moved verbatim from the old export
route, so this is pre-existing rather than introduced here — sliced by JavaScript string length,
which differs for every non-ASCII character. Two consequences:

- **Already happening in live data:** 2 lines across the 5 local trips exceeded the limit at 77
  octets each, both because an em dash costs 3 bytes but counts as 1 character.
- **Reachable corruption:** slicing by code unit can cut a surrogate pair in half and emit a lone
  surrogate on each side of the fold — not valid UTF-8. Not triggered by current data only
  because the ✈️🏨🚗🅿️🚆 summary prefixes sit at position 0, far from the boundary.

Fixed by measuring with `TextEncoder` and accumulating with `for...of`, which walks whole code
points so a character is never split; the continuation-line budget drops to 74 because the
leading space counts toward its own 75. Four tests added covering em-dash overflow, an emoji
swept across every boundary offset, fold/unfold round-tripping, and the ASCII cases.

**Deviations from spec (and why):**

- Fixing `fold()` goes beyond `01-schema-and-normalizer.md` §3, which said to move the helper
  verbatim with "two changes, and only two". The instruction assumed the helper was correct. It
  is not, and the feed amplifies the fault: it concatenates every trip into one document that
  Google and Apple parse strictly, where the download was a single-trip file a human opened.
  Deferring it would also mean subscribers ingest malformed lines before the fix lands.

**Known gaps / follow-ups:**

- Unchanged from the Phase 1 report: the online ICS validator still has not been run, and the two
  `CALFEED TEMP` fixture rows are still on the Washington trip.
- Two normalizer judgement calls remain open for Chris, neither a defect: the return leg falls
  back to the outbound `flightNumber` when `returnFlightNumber` is empty, and a flight row's
  `notes` appear on both legs.

**Verification evidence:**

1. `node --test "src/lib/calendar/*.test.mjs" "src/lib/*.test.mjs"` — **88 pass, 0 fail** (up from
   79; 9 regression tests added). The pre-existing 13 still pass.
2. Both original reproductions now fail correctly: a parsed result shares no array with the
   defaults, a later parse does not leak a mutation, and mutating `DEFAULT_FILTERS` throws
   `TypeError`.
3. Over-length lines across all 5 trips: **2 → 0**.
4. `npm run build` clean (after clearing `.next`; a stale dev server had locked it).
   `npm run lint` — 12 warnings, 0 errors, none in this phase's files. Unchanged.
5. **The Washington trip's export is byte-identical before and after the fix** — it had no
   over-length lines, so the change is genuinely confined to how long lines wrap.
6. For the 2 affected trips, the previously over-long text survives intact once unfolded
   (`folded.replace(/\r\n /g, '')` restores the original), and UID count and identity are
   unchanged: 6 and 12 VEVENTs, all unique.
7. Full structural revalidation of **all 5 trips individually** — every one clean: CRLF
   throughout, no line over 75 octets, BEGIN/END balanced, correct first and last lines, no
   U+FFFD (so no character was split), every VEVENT carrying UID/DTSTAMP/DTSTART, all stamps and
   date values well-formed. 33 VEVENTs, 33 unique UIDs.

## Phase 2 — Feed route, proxy allowlist, management API — 2026-08-03

**Status:** complete

**What was built/done:**

- **`src/lib/calendar/feeds.ts`** — the only module that reads or writes `calendar_feeds`.
  `ensureFeed` uses `INSERT ... ON CONFLICT(user_id, slug) DO NOTHING` then `SELECT`, so two
  concurrent first loads can neither create two rows nor throw. `recordFetch` caps the stored
  user agent at 200 chars (attacker-controlled text bound for the DB and later the Settings
  page). `rotateFeedToken` sets `token`, `token_rotated_at` and `updated_at` in one `UPDATE`.
- **`src/app/api/calendar/feed/[token]/route.ts`** — the public feed. Exports **only** `GET`.
  Serves `text/calendar; charset=utf-8` with `Cache-Control: private, no-store, max-age=0,
  must-revalidate` and `X-Robots-Tag: noindex, nofollow, noarchive`, and deliberately **no**
  `Content-Disposition` (`attachment` makes some clients download rather than subscribe).
  Every failure — malformed token, well-formed token with no row — returns an identical bare
  `text/plain` 404; never a 403, which would confirm the resource exists.
- **`src/proxy.ts`** — `PUBLIC_PATH_PREFIXES = ['/api/calendar/feed/']`, the `pathname`
  declaration hoisted to the top of the function, and `&& !isPublic` on the production block.
  The `ADMIN_EMAILS` write gate is otherwise **untouched**.
- **Management API**, all under `/api/calendar/config` and all wrapped in `withErrorHandling`:
  `PUT` (name + filters), `POST /rotate`, `POST /preview`. `parseFeedFilters` is the only
  validator — no Zod schema alongside it. `PUT` round-trips through parse + serialize, so the
  stored column is always well-formed however malformed the request was.

**What the proxy change allows, and why it cannot be used to write:**

The allowlist exempts exactly one prefix, `/api/calendar/feed/`, from the Cloudflare Access
identity check. It cannot open a write path, for three independent reasons:

1. **GET-only by construction.** The route file exports nothing but `GET`, so Next itself
   answers 405 to POST/PUT/PATCH/DELETE — the request never reaches handler code. Verified,
   not assumed (check 5).
2. **No ambient authority.** The handler resolves the path token to exactly one feed row and
   serves only that owner's trips. An unknown or malformed token is a bare 404.
3. **Management is outside the prefix.** `/api/calendar/config*` is deliberately not under
   `/api/calendar/feed/`, so it stays behind both Access and the `ADMIN_EMAILS` write gate.

Verified end-to-end against a real production build with `ALLOW_NO_ACCESS_HEADER` unset and no
identity header: the feed 200s while `/travel/settings`, `/travel/api/trips`, the per-trip
export, and all three management endpoints 403 (check 9).

**Deviations from spec (and why):**

- Verification step 9 says to run the production build with `npm start`. That build uses
  `output: standalone`, and Next warns that `next start` does not work with it. Used
  `node .next/standalone/server.js` with an absolute `DB_PATH` instead, per `RUNBOOK.md` — the
  faithful production path, and the one that actually exercises the compiled proxy.
- The route uses a hand-written `{ params: Promise<{ token: string }> }` rather than
  `RouteContext<'/api/calendar/feed/[token]'>`. The spec explicitly permits this, and it avoids
  depending on generated types.

**Known gaps / follow-ups:**

- Verification step 7 (`icalendar.org/validator.html`) still **not run**, and the case against
  it is now stronger than in Phase 1: the feed body aggregates *every* trip, so it carries all
  hotel confirmation numbers and a card fragment in one document. Pasting that into a
  third-party site needs Chris's explicit say-so. Local RFC 5545 structural validation of the
  feed body passed instead.
- Nothing calls `ensureFeed` from the UI yet, so the row is created lazily by the first
  management call. Phase 3's Settings page is the intended first caller.
- The token was rotated several times during verification. Harmless today — there are no
  subscribers yet — but after Phase 4 goes live, rotation is destructive (see below).
- **Rotation is the only revocation mechanism and it breaks every subscription.** The old URL
  404s and each subscriber's calendar silently freezes at its last successful fetch; Google
  does not delete a calendar that stops resolving. Everyone must delete and re-add. Phase 3's
  confirmation copy must say exactly this.

**Verification evidence:** all 15 steps, against local dev on port 3000 unless noted.

1. `GET /travel/api/calendar/feed/<token>.ics` → 200, `content-type: text/calendar;
   charset=utf-8`, body starts `BEGIN:VCALENDAR`.
2. The same URL without `.ics` → byte-identical body.
3. `curl -sI` shows `cache-control: private, no-store, max-age=0, must-revalidate`,
   `x-robots-tag: noindex, nofollow, noarchive`, and **no** `content-disposition`.
4. Unknown-but-well-formed token, `abc`, `abc.ics`, a 5-char token, a 70-char token and a token
   containing a slash → all **404**, all `text/plain; charset=utf-8`, all body `Not found`.
   Nothing 403s, nothing 500s.
5. `POST`/`PUT`/`PATCH`/`DELETE` on the feed URL → **405** for all four.
6. Two consecutive fetches byte-identical. The feed spans all trips: 33 VEVENTs, matching the
   per-trip totals (8+6+4+3+12).
7. Local RFC 5545 structural validation of the feed body clean — 33 VEVENTs, 33 unique UIDs, no
   line over 75 octets, no invalid UTF-8, `X-WR-CALNAME:Zo Travel`, no `X-WR-TIMEZONE`. Online
   validator deferred (see gaps).
8. `last_fetched_at` populated; a 500-char user agent is stored truncated to exactly 200.
9. **Production build, `ALLOW_NO_ACCESS_HEADER` unset, no identity header:** feed → 200;
   `/travel/settings`, `/travel/trips`, `/travel/api/trips`, the per-trip export, `PUT config`,
   `POST rotate` and `POST preview` → all **403**. Unknown token still 404 (not 403), POST to
   the feed still 405.
10. **`ADMIN_EMAILS` set to an address that is not the caller's**, acting as a different
    identity: feed → 200 and `GET /travel/settings` → 200 (reads allowed), while `PUT config`,
    `POST rotate`, `POST preview` and `PATCH` on a trip all return
    `403 {"error":"read_only"}`. The token in the DB was unchanged by the blocked rotate.
    Acting as the admin address, `PUT config` and `POST preview` → 200.
11. `PUT` filters excluding `unbooked` → 33 → 30 VEVENTs; exactly 3 UIDs removed, **0 added**,
    the rest unchanged.
12. `PUT` with a string instead of an object, `kinds` as a number, `null`, an array, an empty
    body, a negative window and an unknown enum member → all **200**, feed still 200 after
    each. Never a 500. Genuinely invalid JSON → a clean **400** from `withErrorHandling`.
13. `PUT` with an empty `kinds` array → the feed returns exactly **one** VEVENT,
    `empty-placeholder@travel.zo-bot.com`, and still validates.
14. `POST /rotate` → old URL **404**, new URL **200**, `token_rotated_at` set, new token 43
    chars, filters preserved, still exactly one row in `calendar_feeds`.
15. `npm run build` clean (all four new routes registered). `npm run lint` — 12 warnings,
    0 errors, unchanged; `npx eslint` over the Phase 2 files exits 0.

**Name handling** (spec section 4): trimmed, capped at 100 chars, and an empty or
whitespace-only name falls back to the existing one — all three verified.

**A note on how check 10 was reached.** It failed on the first attempt: a non-admin appeared to
rotate the token successfully. The cause was the test harness, not the code — the server for
that run had died with `EADDRINUSE` and the requests were being answered by the previous
server, which had no `ADMIN_EMAILS` set and was therefore correctly failing open. Re-run with
the port confirmed free and the new server confirmed to be the one answering (an
unauthenticated `/travel/settings` → 403 sanity probe), all of check 10 passes. Recorded here
because "the auth test passed on the second try" is exactly the kind of thing that deserves a
paper trail.

## Phase 2 — Correction and pre-Phase-3 review — 2026-08-03

**Status:** complete

A review of Phase 2 before starting Phase 3, probing rather than reading. One inconsistency
fixed; three properties confirmed sound; one item raised for Phase 4.

**Fixed: `POST /api/calendar/config/preview` swallowed JSON syntax errors.**

It parsed the body with `.catch(() => ({}))`, so a request whose JSON never parsed was answered
`200` with the counts for the DEFAULT filters — the preview would cheerfully report "33 events
will publish" for a request the server had failed to read, while its sibling `PUT` returned
`400` for the same input. A preview that lies is worse than one that errors, and Phase 3's UI is
about to depend on this contract. Now both endpoints return `400` for unparseable JSON, and both
still return `200` for well-formed JSON of the wrong shape (the documented tolerant path through
`parseFeedFilters`).

**Confirmed sound (each tested, not assumed):**

- **`ensureFeed` is genuinely race-safe.** 12 parallel `PUT`s against an empty `calendar_feeds`
  produced exactly **1 row with 1 token** and logged no unique-constraint error. The
  `INSERT ... ON CONFLICT DO NOTHING` + `SELECT` shape does what the spec claimed.
- **Cross-user isolation holds in both directions.** Tested against a throwaway `VACUUM INTO`
  copy of the DB (never `cp` — WAL) seeded with a second user owning a trip and a feed: the
  second user's feed returned only their own trip and none of the five belonging to `local`,
  and `local`'s feed contained no trace of theirs. This is the property that matters most for
  an unauthenticated public endpoint.
- **`HEAD` on the feed returns 200** with the right content type — Next derives it from the
  exported `GET`, and `HEAD` is already in the proxy's `SAFE_METHODS`.

**Raised for Phase 4 — the token will be written to the nginx access log.**

The token is the entire credential and it travels in the URL path. The production Node server
does **not** log request paths (verified: zero feed lines across two standalone production
runs), but `next dev` does, and nginx's default `combined` access-log format logs the full
request path for every request. Once the feed is live, every Google poll therefore appends the
live credential to a long-lived file on disk that rotates into archives and may be picked up by
backups. Phase 4 owns the nginx vhost and should decide deliberately: exclude this location
from `access_log`, or use a custom log format that masks the path. Flagging rather than fixing,
because the nginx config is not in this repo and is not this phase's to change.

**Known gaps / follow-ups:**

- The `calendar_feeds` row was deleted and recreated twice during this review's concurrency
  testing, so the token differs from the one in the Phase 2 report. Harmless — there are still
  no subscribers — but any URL copied before now is stale.
- `updateFeed`'s `patch.name === undefined` branch is currently unreachable: the `PUT` route
  always resolves a name (falling back to the existing one). Left in place as the honest
  signature for Phase 3, which may want a filters-only write.
- Unchanged from the Phase 2 report: the online ICS validator has still not been run, and
  `RUNBOOK.md` still needs the public-path note in Phase 4.

**Verification evidence:**

1. Malformed JSON now consistent: `PUT` → 400 and `preview` → 400; an absent body → 400 on
   both. Well-formed JSON of the wrong shape (`{"filters":"junk"}`), `{}`, and
   `{"filters":{}}` all still → 200 with correct counts.
2. 12 concurrent `PUT`s against an empty table → 1 row, 1 distinct token, 0 errors logged.
3. Two-user isolation test on a disposable DB copy: other user's feed = 1 VEVENT, their own
   trip only, `X-WR-CALNAME:Mallory Feed`; zero overlap with `local`'s 33 VEVENTs in either
   direction. Test DB and its server removed afterwards; `local.db` never touched.
4. `HEAD` on the feed → 200, `content-type: text/calendar; charset=utf-8`.
5. Token appears in `next dev` request logs; **zero** occurrences in either production
   standalone log.
6. `node --test` — **88 pass, 0 fail**. `npx eslint` over the Phase 2 files exits 0. Feed still
   serves 200 with 33 VEVENTs.

## Phase 3 — Settings UI (plus feed redaction) — 2026-08-03

**Status:** complete-with-deviations

**Scope change agreed before starting:** Chris asked for recommendation #1 from the security
review (withhold booking credentials from the feed) to be folded into this phase, and declined
#2 (per-subscriber tokens). Both are reflected below.

**What was built/done:**

- **Feed redaction (folded in).** New `includeBookingDetails` filter, **default `false`**. When
  off, `redactItems()` drops each item's `DESCRIPTION` entirely — SUMMARY, LOCATION and the
  times are untouched, so where-and-when survives and confirmation numbers, order numbers,
  loyalty numbers and free-text notes do not. The whole field goes rather than a pattern-match:
  card fragments and loyalty numbers live in hand-written `notes`, and a redactor that is 90%
  right on secrets is worse than useless. `EXPORT_PRESET` sets it `true`, so the authenticated
  per-trip download is unchanged — it is a download to your own machine, not a public URL.
  Both callers now go through one `prepareItems()` (filter + redact) rather than `filterItems`,
  because a route that remembered to filter but forgot to redact would silently publish
  credentials.
- **`src/app/settings/page.tsx`** — "Calendar feed" card spanning `lg:col-span-2`, with the
  included/total pill, last-fetched line, and a note when booking details are withheld. Feed URL
  built server-side from the forwarded headers. `Card` gained an optional `className`.
- **`src/components/settings/CalendarFeedActions.tsx`** — read-only URL field + Copy (with an
  `execCommand` fallback for non-secure contexts), the three required pieces of copy plus the
  rename caveat, six filter fieldsets, debounced live counts, explicit Save, and an inline
  rotate confirm carrying the "everyone must re-subscribe" warning.
- **`src/components/itinerary/BookingDetailSheet.tsx`** — "Hide from all calendar feeds"
  checkbox with the global-scope helper text, optimistic with rollback on failure, hidden for
  read-only users. `deleteEndpoint` renamed `itemEndpoint` since PATCH now shares it.

**A latent bug this phase surfaced and fixed:**

Building the settings count exposed a mismatch — 33 of 34 items were included under filters that
exclude nothing. The missing item was a **confirmed** event, "FIFA World Cup 2026 Match 100",
whose `category` is `'sports'` — a value that appears nowhere in `EventCategory` or anywhere else
in the codebase. Gate 4 dropped it, and because the settings UI renders one checkbox per *known*
category, there was no control that could ever bring it back: a real booked event, permanently
and silently absent from the calendar with no way to diagnose it.

`includeItem` now **fails open** on an unrecognised event category — such an item is included and
still answers to every other gate (hidden, kind, trip status, booking status, windows). An
unexpected event on a calendar is a far cheaper mistake than a missing one. The count is now
34 of 34. Adding `'sports'` to `EventCategory` properly (form picker, icon, colour, MCP registry)
is a larger change and deliberately not done here; the row's existence also suggests the events
POST route does not validate `category` against the enum, which is worth a look separately.

**Deviations from spec (and why):**

- **`includeBookingDetails` is new** and not in `03-settings-ui.md`; it is the folded-in security
  change described above. It adds a sixth fieldset ("Booking details") beyond the four the spec
  lists, deliberately placed last and labelled as a risk rather than a preference.
- **`EXPORT_PRESET` is no longer an alias of `DEFAULT_FILTERS`.** The two now disagree on exactly
  one field, so it is a separate frozen object. The Phase 1 test asserting object identity was
  updated to assert distinctness plus equal protection.
- The spec's lint baseline of "11 pre-existing warnings" is still 12, as recorded in Phase 1.

**Known gaps / follow-ups:**

- **Kate cannot self-serve the feed URL.** She is a read-only user, and the token is a bearer
  credential, so it is passed only inside the `!access.readOnly` branch and never reaches her
  markup. Chris sends her the URL once. This is intended, not a bug — read-only users do not get
  to read credentials. She still sees the card, the count and the last-fetched time.
- The trip-level `trips.hide_from_calendar` remains API-only; the trip edit form was out of scope.
- Verification 3 ("live count updates without saving") and 4 (Save) were confirmed through the
  real UI, but see the browser-harness note below.
- Unchanged from earlier phases: the online ICS validator has not been run, and `RUNBOOK.md`
  still needs the public-path note in Phase 4.

**Verification evidence:** production build (`node .next/standalone/server.js`), except where noted.

1. Card renders with `34 of 34 items included` and the last-fetched line. All six fieldsets
   present. The "Confirmation numbers and notes are not published to the feed" note shows while
   redaction is on.
2. **Copy works** — real click produced the "Feed URL copied" toast.
3. Live count populates with the per-kind breakdown: `34 items · 5 trip banner · 11 day plans ·
   6 flights out · 1 flights back · 5 hotels · 1 rental cars · 5 parking`.
4. **Redaction, measured on the live feed:** 34 VEVENTs, **0** DESCRIPTION lines, **0** `Conf:`
   lines, **0** card fragments, while SUMMARY (34) and LOCATION (32) are intact. The per-trip
   download over the same trip still carries 4 DESCRIPTIONs, 3 conf numbers and 1 card fragment
   — the split is exactly where it should be.
5. Toggling `includeBookingDetails` true → 21 DESCRIPTION lines and 15 conf numbers return;
   false → back to 0. Persisted correctly through `serializeFeedFilters`/`parseFeedFilters`.
6. **Hide checkbox end-to-end:** ticked it on Lotte Hotel Seattle in the detail sheet →
   `hide_from_calendar=1` in the DB, the VEVENT gone from the feed (34 → 33) **and** from the
   per-trip download, proving the flag is global. Unticked → restored to 34.
7. **Read-only, for real** (`NODE_ENV=production`, `ALLOW_NO_ACCESS_HEADER=1`, `ADMIN_EMAILS` set
   to another address, identity header for a non-admin): the card renders with the count and
   last-fetched line, and the raw HTML contains **no token and no feed URL** (grepped for the
   literal token string), no Copy, no fieldsets, no Save, no Rotate. `PUT /api/calendar/config`
   → `403 {"error":"read_only"}`. As the admin address, the token and Copy are present.
8. 375px layout: the card measures 373px wide with no horizontal overflow; the URL input scrolls
   internally (`scrollWidth` 702 inside a `min-w-0 flex-1` box) rather than pushing the page.
9. Nothing else regressed: `/`, `/trips`, `/trips/{id}`, `/map`, `/settings` all 200 in
   production; Gmail card, Access card and per-trip export links intact.
10. `node --test` — **98 pass, 0 fail** (up from 88; 10 added for redaction and the fail-open
    category rule). `npx tsc --noEmit` clean. `npm run build` clean. `npm run lint` 12 warnings,
    0 errors, none in this phase's files.
11. All test state restored afterwards: 0 rows hidden anywhere, stored filters back to defaults,
    feed back to 34 VEVENTs with 0 descriptions.

**Two notes on the verification itself, recorded so the numbers are not over-read:**

- **The live count appeared stuck at "Counting…" for a long time and was nearly reported as a
  bug.** It was not one: `document.hasFocus()` was `false` and `visibilityState` was `"hidden"`
  in the automated tab, and Chrome throttles timers and defers hydration in hidden tabs, so the
  debounced preview never fired. A single real click resolved it instantly and the count has
  been correct ever since. Worth remembering before chasing the same ghost in Phase 4.
- **The first production run returned 500 on every page**, including pages this phase never
  touched. Two causes, both environmental: `.next/standalone` needs the static-asset copy
  documented in `RUNBOOK.md` after every build, and a stale server was still holding port 3000
  so the replacement never bound (`EADDRINUSE`). Freeing the port properly and copying the
  assets gave 200s across the board. No product defect.
