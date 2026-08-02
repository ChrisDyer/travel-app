# App-Level Pages — Overview

**Every phase agent reads this file first.** It carries the problem, the settled design
decisions, the data contract, and the conventions each phase must honour. The per-phase docs
assume you have read it and do not repeat it.

---

## The problem

The Travel sidebar (`src/appShell/TravelShell.tsx`) is 224px of dark chrome holding **two
links** — `Trips` and `New trip` — plus a static blurb that is not a link:

> Itineraries, bookings, maps, and exports stay local to Travel.

Below `lg` the entire `<aside>` is `hidden` with no replacement. There is no drawer and no
bottom navigation, so on a phone the local nav is **unreachable** — you can only move between
Travel pages via the back link and in-page actions. That also breaks the shared
`docs/plans/2026-07-site-wide-ui/STYLE-GUIDE.md` rule that apps without bottom navigation must
offer an accessible local-nav drawer.

Underneath the nav problem is a shape problem: **every view in this app is scoped to one
trip.** `/` is a bare `redirect('/trips')`, `/trips` is a flat list, and everything else lives
under `/trips/{id}`. There is no cross-trip view of anything, even though the data already
exists:

- `/api/summary` already aggregates cancellation deadlines — but only for the single next trip.
- `trip_legs` already caches `latitude`/`longitude`/`resolved_name` — and nothing plots them.
- Gmail OAuth already works — but its only entry point is inside `TripAssistant`, on a trip
  detail page, behind the Email tab.

## The feature

Three app-level pages, and a sidebar that is worth its 224px:

| Page | What it answers |
|---|---|
| **Overview** (`/`) | "What needs my attention?" — next trip, its weather, and a cross-trip action list of cancellation deadlines, unbooked plans, and empty itineraries |
| **Map** (`/map`) | "Where have I been and where am I going?" — every trip on one map |
| **Settings** (`/settings`) | The app's loose ends: Gmail connection, access role, integration status, exports |

Plus a working mobile drawer, and nav highlighting derived from the URL instead of a prop
threaded through every page.

---

## Settled design decisions

These were decided with Chris during planning. **Do not revisit them.** If a phase doc seems
to contradict one, the phase doc is wrong — flag it rather than silently changing course.

| Decision | Choice | Why |
|---|---|---|
| Overview's route | `/`, replacing the `redirect('/trips')` | The app switcher already sends every cross-app link to `https://zo-bot.com/travel/`. A redirect wastes the app's front door |
| Active nav state | Derived from `usePathname()` | `activeLocalNav` is a prop drilled through every page. It works for two items and does not scale to five, and it silently defaults to `"trips"` on any page that forgets it |
| Trip coordinates | New cache columns on `trips`, mirroring `trip_legs` exactly | The app already has one lazily-filled, place-derived geocode cache with one invalidation rule. A second *pattern* would mean a second invalidation bug |
| Map component | A new `TripsMap.tsx`, **not** a change to `TripMap.tsx` | `TripMap` is trip-scoped, geocodes client-side through the Google `Geocoder` in a one-shot effect, and hardcodes a 500px height. Feeding it server-supplied pins would fight its own effect |
| Mobile drawer | Built on `@base-ui/react/dialog` directly | `SheetContent` in `src/components/ui/sheet.tsx` hardcodes bottom-on-mobile / right-on-`sm` positioning and has no `side` prop. Bending it would change every existing sheet in the app |
| Cross-trip aggregation | One `src/lib/agenda.ts`, shared with `/api/summary` | Two copies of the deadline query will drift, and the homepage dashboard would start disagreeing with the Travel Overview about the same trip |
| Settings scope | Status and connection management only | It is not a preferences store. Nothing on it should write a column that no consumer reads |

### Explicitly out of scope

Real ideas, deliberately not in this program. Do not build them; do not let them creep in.

- **A cross-trip Spending page.** Considered during planning and dropped. Every table carries
  `cost`/`currency`, `trips` carries `budget`, and `/api/rates` is live, so it remains an easy
  follow-up — but it is not this program.
- **Any `digest_enabled` UI.** The columns exist on `trips` and `TripEditForm` already edits
  them, but **nothing sends digests** — grep found zero consumers. Settings must not grow a
  switch that does nothing.
- **Retiring the stone/slate split.** The shell chrome is `slate-*` and the itinerary body is
  still `stone-*`. That cleanup belongs to
  `docs/plans/2026-07-ui-uniformity-remediation`, phase 3.
- **Per-leg map centring** in the trip-scoped `TripMap.tsx`. Already listed out of scope by
  the trip-legs program; this one does not claim it either.
- **A `/trips/{id}` redesign.** No phase here touches `ItineraryDocument` or its children.

---

## Repo layout

One repo, with a single-file exception in Phase 3.

| Repo | Path | Phases |
|---|---|---|
| travel-app | `C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app` | 1, 2, 3, 4 |
| mcp-server | `C:\Users\chris\OneDrive\Apps\zo-bot.com\mcp-server` | one comment in Phase 3 |

These are **separate git repos**, not a monorepo.

> **Port trap.** `3001` is the **VPS** port. Local travel-app dev runs on **3000**, and the
> `/travel` basePath is mandatory even on localhost — `http://localhost:3000/travel/trips`,
> never `http://localhost:3000/trips`.

---

## The data contract

Phases 1, 2 and 4 add **no schema**. Phase 3 adds three columns to `trips`:

```sql
ALTER TABLE trips ADD COLUMN latitude REAL;
ALTER TABLE trips ADD COLUMN longitude REAL;
ALTER TABLE trips ADD COLUMN resolved_name TEXT;
```

| Column | Meaning |
|---|---|
| `latitude` / `longitude` | Cached geocode of `destination`. `NULL` means "not yet resolved, or the last attempt failed" |
| `resolved_name` | The geocoder's display name, e.g. `"Paris, France"`. `NULL` until first resolved |

Camel-cased by `camelize()` into `latitude`, `longitude`, `resolvedName` on the `Trip` type.

These are **derived state**, exactly like the same-named columns on `trip_legs`: a cache of a
pure function of `destination`. They are never accepted from a request body and never exposed
as writable fields anywhere.

### Rule 1 — changing `trips.destination` invalidates the geocode

**Any write that changes `destination` must set `latitude`, `longitude` and `resolved_name`
back to `NULL` in the same `UPDATE`.** Otherwise editing a trip from "Paris" to "Lisbon"
silently leaves its pin in France, and it looks like it worked.

This is the single most likely bug in this program — it is the same bug the trip-legs program
called out as *its* most likely bug, for the same reason. It gets a comment in the code and an
explicit verification step in Phase 3.

The converse matters too: a PATCH that resends the **same** destination must **not** clear the
cache, or every trip edit costs a fresh geocoding call.

### Rule 2 — the map cache is filled by exactly one route

`GET /api/map` is the only code that writes `trips.latitude`/`longitude`/`resolved_name`, just
as the weather route is the only code that writes the `trip_legs` equivalents. Filling the
cache from a component, a server page, or the trip PATCH route would mean two places to get
the invalidation wrong.

### Rule 3 — cache writes never bump `trips.updated_at`

`src/app/trips/[tripId]/page.tsx` passes `key={trip.updatedAt}` to `<ItineraryDocument>`.
Bumping `trips.updated_at` remounts the entire client tree and throws away open forms,
selections, and the mobile tab. The same trap already applies to the trip brief and to trip
legs; `/api/map` inherits it. The weather route's comment at
`src/app/api/trips/[tripId]/weather/route.ts:141` explains the reasoning — reuse it.

### Rule 4 — `/api/summary`'s response shape is frozen

`src/app/api/summary/route.ts` feeds the **cross-app homepage dashboard**, a different repo.
Phase 2 refactors its internals onto shared helpers and **must not change its JSON**,
including the deliberate distinction documented in the comment at `route.ts:51`:

- `count` / `next` — *all* dated deadlines, even past ones, kept for backward compatibility
- `upcoming` — the actionable next-30-days window, max 10

If the refactor makes that distinction awkward, keep the distinction and accept the
awkwardness.

---

## Conventions each phase must honour

- Data access is raw `better-sqlite3` — no ORM. `db.prepare(...)` inline in routes and server
  components. `camelize<T>` / `camelizeAll<T>` from `@/db` convert snake_case rows.
- Route handlers wrap in `withErrorHandling` from `src/lib/api-helpers.ts` (`SyntaxError` →
  400, anything else → 500). `requireFields` for required-field validation.
- Ownership: look the parent trip up with `AND user_id = ?` and 404 if missing, then operate
  on child rows. `getUserId(request)` in routes, `getServerUserId()` in server components.
- **Client fetches must go through `apiUrl()`** from `src/lib/api.ts` — it applies
  `NEXT_PUBLIC_BASE_PATH`. A bare `/api/...` fetch breaks in production.
- Write controls are hidden from read-only users via `useReadOnly()` from
  `src/lib/read-only.tsx`. The server-side 403 is **automatic**: `src/proxy.ts` gates every
  unsafe method under `/api`. Verify it; do not re-implement it.
- Tailwind v4, CSS-first (no `tailwind.config.js`). `cn()` from `src/lib/utils.ts`.
- **Palette: the shell chrome is `slate-*`, the itinerary document body is `stone-*`.** Every
  page this program adds is app-level chrome, so it is **`slate-*` throughout**. Do not copy
  the stone classes out of `ItineraryDocument` or `TripCostSummary`.
- UI primitives are shadcn on **`@base-ui/react` v1.5, not Radix** — composition uses
  `render={<Component/>}`, never `asChild`.
- Zod here is **v4**. mcp-server is on v3 — do not carry idioms across.
- Booking logic goes through `src/lib/bookings.ts` (`skipsBooking()`, `bookingIsOptional()`,
  `noBookingLabel()`). **Never re-test `takes_reservations` inline** — the app's `CLAUDE.md`
  is explicit about this.
- Date maths goes through `src/lib/dates.ts` (noon-UTC anchored) and `src/lib/trip-status.ts`
  (`tripTiming()`, `statusLabel`, `localToday()`). No ad-hoc `new Date(str)` arithmetic.
- This is **not** the Next.js in your training data (see `AGENTS.md`). Check
  `node_modules/next/dist/docs/` before reaching for an API you half-remember.

**Testing.** There is no test runner and no `npm test` script. Verification is
`npm run build`, `npm run lint` (11 pre-existing warnings are expected), curl against a local
dev server, and manual checks recorded in `TESTING.md`. The `.mjs` tests run with
`node --test <path>`; `src/appShell/destinations.test.mjs` is a **source-regex contract test**
that reads files as text, and `src/lib/legs.test.mjs` imports a pure module for real.

**Back up before any phase that writes to the database.** These phases run against Chris's
real local data (5 trips, 9 events, 6 flights, 5 hotels).

> **Do not use `cp local.db local.db.bak`.** SQLite here is in **WAL mode**, so recent
> commits live in `local.db-wal` until a checkpoint folds them into the main file — and a
> plain `cp` copies only the main file. Measured on 2026-08-01: `local.db` was three weeks
> stale (last checkpoint 2026-07-10) with 1.1 MB of newer data sitting in the WAL, so the
> `.bak` silently omitted every change since. Use a real SQLite backup, which is atomic and
> WAL-aware:
>
> ```
> node -e "require('better-sqlite3')('local.db',{readonly:true}).prepare(\"VACUUM INTO 'local.db.bak'\").run()"
> ```
>
> or, if the `sqlite3` CLI is on PATH: `sqlite3 local.db ".backup 'local.db.bak'"`.
> Verify the backup before trusting it — open it and count rows.

---

## Phase map

| Phase | Doc | Summary |
|---|---|---|
| 1 | `01-shell-and-nav.md` | Grouped sidebar, `usePathname()` active state, mobile drawer, extended contract test. Overview link only — Map and Settings links land with their pages |
| 2 | `02-overview-page.md` | `src/lib/agenda.ts`, `/api/summary` refactored onto it, `/` becomes a real page |
| 3 | `03-map-page.md` | Migration `008_trip_geocode`, shared `src/lib/geocode.ts`, `GET /api/map`, `TripsMap.tsx`, invalidation in the trip PATCH |
| 4 | `04-settings-and-docs.md` | `/settings`, `DELETE /api/gmail/token`, `CLAUDE.md` + `TESTING.md` |

Run them in order, in separate sessions. Append a report to `PROGRESS.md` at the end of each,
update its Status blockquote, and run `node tools/project-status.mjs` from
`C:\Users\chris\OneDrive\Apps\zo-bot.com`.

**Nav links for routes that do not exist yet.** Phase 1 ships the Overview link only, because
`/` already resolves. Phases 3 and 4 each add their own nav entry *and* its contract-test
assertion as their first step, so the sidebar never advertises a 404.

---

## What success looks like

The acceptance test for the whole program, run at the end of Phase 4:

> On a phone, open the drawer and reach every page; it closes when you navigate. On desktop,
> `/` shows the next trip, its forecast, and a live action list that links into the right
> trips; `/map` plots every trip from cache with no geocoding on reload; `/settings` shows
> Gmail connected. Then change a trip's destination and reload `/map` — **the pin moves.**

If that works, the feature works. Everything else is plumbing.
