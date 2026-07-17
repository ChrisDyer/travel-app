# Phase 2 — Mapping layer (pure, no Google calls)

## Goal

A shared, pure module `src/lib/calendar/mapping.ts` that turns a trip's DB rows into normalized `CalendarItem`s and Google event payloads, with a stable fingerprint for change detection. The existing `.ics` export is refactored to consume the same builder, so both outputs can never drift.

This phase makes **no network calls** and does not depend on Phase 1 (it may run in parallel with it). It must not import from `src/lib/calendar/google.ts` or `sync.ts`.

## Prerequisites

- Read `docs/calendar-sync/ARCHITECTURE.md` completely — especially § "Mapping layer" (the normative mapping rules table) and § "Data model" (the `item_type` vocabulary).
- Read `AGENTS.md` (repo root).

## Read first

- `src/app/api/trips/[tripId]/export/route.ts` — the entire file. Its per-entity `EventInput` construction (summaries, locations, descriptions, all-day vs timed decisions, `nextDay` exclusive-end handling) is the logic to extract. Preserve its summary/description text choices unless ARCHITECTURE.md says otherwise.
- `src/types/travel.ts` — all six entity interfaces + `Trip`.
- `src/lib/dates.ts` — the date-math conventions (header comment).
- `src/db/index.ts` — `db`, `camelize`, `camelizeAll`.

## Work items

### 1. Create `src/lib/calendar/mapping.ts`

Implement the public surface from ARCHITECTURE.md § "Mapping layer":

- `buildTripCalendarItems(tripId, userId)` — queries the trip + `trip_days` + all six entity tables (copy the query block from the export route) and returns `{ trip, items }`, or `null` if the trip doesn't exist. Items produced:
  - **Trip span** (`itemType: 'trip'`, `itemId: tripId`, `bookingStatus: null`): all-day `startDate` → `endDate`, summary `✈️ {title} — {destination}` (omit the ` — {destination}` part when destination is empty). Always include this item in the returned array; the *caller* decides whether it's desired.
  - **Day events**: date from the parent day (`dayDate` map, skip events whose day is missing — same as export). Timed when `startTime` present.
  - **Flights**: outbound item (`itemType: 'flight'`); plus a **return item** (`itemType: 'flight_return'`, same `itemId`, `baseType: 'flight'`) when `tripType === 'round-trip'` and `returnDepartureDate` is set, built from the `return*` fields. (Note: the current export route omits the return leg — this module must not.)
  - **Hotels**: ONE all-day item spanning `checkInDate` → `checkOutDate` (this diverges from the current export, which may emit timed check-in/out; follow ARCHITECTURE.md). Put check-in/check-out times in the description when present.
  - **Rental cars** (`baseType/itemType: 'car'`), **parking**, **transit**: same shape as the export route (timed when time present).
  - Skip items with no usable start date (export route already guards this way).
- `toGoogleEvent(item, timezone, tripId)` — builds the Google Calendar v3 event resource:
  - Timed: `start: { dateTime: '${date}T${time}:00', timeZone }` (pad `H:MM` → `HH:MM`; the export's `dtProperty` shows the padding). End rules: timed end when the item has one; **start + 1 hour** when a timed item has no end; if end < start (data entry error), fall back to start + 1 hour.
  - All-day: `start: { date }`, `end: { date: nextDay(lastDate) }` (exclusive; single-day → `nextDay(start.date)`). All all-day ends use `nextDay(...)` — including hotels (`nextDay(checkOutDate)`).
  - Mixed timed-start/all-day-end or vice versa: degrade to all-day for the whole event (matches export behavior for spans).
  - `summary`, `location`, `description` from the item; append `\n\n${NEXT_PUBLIC_APP_URL}/trips/${tripId}` to the description.
  - `extendedProperties: { private: { travelAppItem: `${item.itemType}:${item.itemId}` } }`.
- `fingerprintEvent(payload)` — `createHash('sha1')` from `node:crypto` over `JSON.stringify` with **recursively sorted object keys** (write a small stable-stringify helper; do not add a dependency). Same payload ⇒ same hash across processes.
- `isItemDesired(item, overrides)` — `item.itemType === 'trip'` → `true`; else with `o = overrides.get(`${item.baseType}:${item.itemId}`)`: `o === 'include' || (item.bookingStatus === 'confirmed' && o !== 'exclude')`.
- `defaultTimezone()` — `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- A local `nextDay(date: string)` (copy from the export route — UTC-anchored) or import if you extract it to `src/lib/dates.ts`.

Type the Google payload (`GoogleEventPayload`) explicitly — `start`/`end` unions of `{ date }` and `{ dateTime, timeZone }`, optional `summary/location/description/extendedProperties`.

### 2. Refactor `src/app/api/trips/[tripId]/export/route.ts`

- Replace its inline queries + per-entity `EventInput` construction with a call to `buildTripCalendarItems(tripId, userId)`.
- Keep the iCalendar serialization (`escapeText`, `fold`, `dtProperty`, `buildVEvent`) local to the route; map each `CalendarItem` → the existing `EventInput` shape with `uid: `${item.itemType}-${item.itemId}@travel.zo-bot.com``.
- Behavior changes this refactor is **allowed** to introduce (they're improvements): the return flight leg now appears in the `.ics`; hotels become a single all-day span; a trip-span VEVENT now appears. Everything else (summaries, descriptions, locations, all-day/timed decisions) must match the old output.

## Gotchas

- Never `new Date('YYYY-MM-DD')` and read local getters — always anchor with `'T00:00:00Z'` and use UTC methods (see `src/lib/dates.ts` and the export route's `nextDay`).
- Google all-day `end.date` is **exclusive**, same as ICS `DTEND;VALUE=DATE`.
- Don't fingerprint anything volatile — the payload contains only data derived from DB rows and the app URL.
- The module must stay side-effect-free toward Google: DB reads only.

## Definition of done / verification

1. Before refactoring, save the current export of a seeded trip: `curl -s http://localhost:3000/api/trips/{id}/export > before.ics`. Use a trip that has at least one of each entity type, including a round-trip flight and a multi-night hotel (create one via the UI or API if needed).
2. After refactoring: `curl -s ... > after.ics`; diff. Expected differences ONLY: added return-flight VEVENT, added trip-span VEVENT, hotel VEVENT now a single all-day span, UID prefixes possibly adjusted (`car-` vs `rental-car-` etc. — keep the old UID strings if trivially possible). Everything else byte-identical (ignoring DTSTAMP).
3. Unit-style sanity via a scratch script (`npx tsx`): call `buildTripCalendarItems` + `toGoogleEvent` + `fingerprintEvent` on the seeded trip; assert (a) a timed flight produces `dateTime` + `timeZone`, (b) an untimed event produces `date` with exclusive end, (c) calling `fingerprintEvent` twice on the same item is stable, and changes when a field changes.
4. `npx tsc --noEmit` and `npm run lint` pass.

Commit with a message describing the phase.
