# Phase 1 — Foundation: Sheet + Menu primitives, date helpers, duplicate-trip fix

**Goal:** Ship the two UI primitives every later phase depends on, consolidate the copy-pasted date/time formatters into `src/lib/dates.ts`, and fix the duplicate-trip endpoint that silently drops all bookings. **Zero visual change to any screen.**

**Depends on:** nothing (first phase). Read `docs/redesign/README.md` conventions first.

---

## Step 1 — Create `src/components/ui/sheet.tsx` (slide-over panel primitive)

Build on `@base-ui/react/dialog`, following `src/components/ui/dialog.tsx` **exactly** in structure (same imports, same `data-slot` convention, same Backdrop styling, same `render={<Button/>}` close-button pattern). The only difference from Dialog is the Popup's positioning/animation.

Export: `Sheet`, `SheetTrigger`, `SheetPortal`, `SheetClose`, `SheetOverlay`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`.

`SheetContent` popup classes — a right-side panel on `sm` and up, a bottom sheet below `sm`:

```
fixed z-50 bg-white outline-none overflow-y-auto no-print
data-open:animate-in data-closed:animate-out duration-200
// ≥sm: right side panel
sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:w-full sm:max-w-md sm:shadow-xl sm:border-l sm:border-stone-200
sm:data-open:slide-in-from-right sm:data-closed:slide-out-to-right
// <sm: bottom sheet
max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[85dvh] max-sm:rounded-t-2xl max-sm:shadow-2xl
max-sm:data-open:slide-in-from-bottom max-sm:data-closed:slide-out-to-bottom
```

Details:
- Reuse the exact `DialogOverlay`/Backdrop classes from `dialog.tsx` for `SheetOverlay`.
- Include the close X button exactly like `DialogContent` does (`showCloseButton` prop, `Button variant="ghost" size="icon-sm"` via `render=`).
- Below `sm`, render a grab-handle bar at the top of the content: `<div className="sm:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-stone-300" />`.
- `SheetHeader`: `flex flex-col gap-1.5 p-4 border-b border-stone-100`. `SheetFooter`: sticky bottom action row — `sticky bottom-0 bg-white border-t border-stone-100 p-4 flex gap-2 justify-end`. `SheetTitle`: `font-serif text-lg font-semibold text-stone-900`.
- The animation utilities (`slide-in-from-right`, `slide-out-to-bottom`, etc.) come from `tw-animate-css`, already imported in `globals.css`. If a specific class is missing in the installed version, fall back to a fade (`fade-in-0`/`fade-out-0`) rather than debugging CSS.
- Note `no-print` is in the class list above — keep it (print safety).

The primitive is not used anywhere yet in this phase. To verify it compiles and behaves, you may temporarily mount a test instance, but remove it before committing.

## Step 2 — Create `src/components/ui/dropdown-menu.tsx` (menu primitive)

Build on `@base-ui/react/menu` (v1.5 ships `Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`, `Menu.Popup`, `Menu.Item`, `Menu.LinkItem`, `Menu.Separator` — check `node_modules/@base-ui/react/menu` for the installed API before writing code). Follow the shadcn naming convention used by `dialog.tsx` (`data-slot` attributes, `cn()` for classes).

Export: `DropdownMenu` (Root), `DropdownMenuTrigger`, `DropdownMenuContent` (Portal + Positioner + Popup combined, like `DialogContent` combines Portal/Overlay/Popup), `DropdownMenuItem`, `DropdownMenuLinkItem`, `DropdownMenuSeparator`.

Styling:
- Popup: `min-w-44 rounded-lg border border-stone-200 bg-white p-1 shadow-md z-50 no-print data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0`
- Positioner: sensible defaults (`sideOffset={4}`, align to trigger) — expose props for overrides.
- Item: `flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-stone-700 outline-none cursor-pointer data-highlighted:bg-stone-100 data-highlighted:text-stone-900`
- Add a `variant?: 'default' | 'destructive'` prop on `DropdownMenuItem`; destructive = `text-red-600 data-highlighted:bg-red-50 data-highlighted:text-red-700`.
- `DropdownMenuLinkItem` wraps `Menu.LinkItem` with the same item classes — use it for real navigations (so middle-click/ctrl-click work).
- Separator: `my-1 h-px bg-stone-100`.

Not used anywhere yet in this phase.

## Step 3 — Consolidate date/time formatters into `src/lib/dates.ts`

`src/lib/dates.ts` currently has `nextDay` and `datesBetween` with a header comment explaining noon-UTC anchoring for date **math**. Keep those untouched. Append display helpers (display formatting via `new Date(str + 'T00:00:00')` local parse is the established convention for these — it matches what every component does today; do not change the output):

```ts
/** 'HH:MM' → '3:05 PM'. Returns null for null/empty input. */
export function fmt12(time: string | null | undefined): string | null;

/** 'YYYY-MM-DD' → 'Sat, Aug 8'. Returns null for null/empty input. */
export function fmtShortDate(date: string | null | undefined): string | null;

/** 'YYYY-MM-DD' → { weekday: 'Saturday', date: 'August 8' } (DaySection header parts). */
export function fmtWeekdayParts(date: string): { weekday: string; date: string };

/** Date range for headers/cards.
 *  style 'short' → 'Aug 8 – Aug 15, 2026' (trips list)
 *  style 'long'  → 'August 8 – August 15, 2026' (trip page header) */
export function formatDateRange(start: string, end: string, style?: 'short' | 'long'): string;
```

Copy the implementations from the existing local versions so output is byte-identical:
- `fmt12` — identical copies exist in `KeyBookings.tsx:34`, `DaySection.tsx:33`, `EventCard.tsx:27` (EventCard's takes non-null `string`; the shared one accepts null).
- `fmtShortDate` — this is `fmtDate` in `KeyBookings.tsx:42` (`weekday: 'short', month: 'short', day: 'numeric'`).
- `fmtWeekdayParts` — this is `formatDate` in `DaySection.tsx:41`.
- `formatDateRange` — short style is `TripsClient.tsx:15`; long style is the local function in `src/app/trips/[tripId]/page.tsx:32`.

Then replace the local definitions with imports from `@/lib/dates` in:

| File | Local functions to delete and import instead |
|---|---|
| `src/components/itinerary/KeyBookings.tsx` | `fmt12`, `fmtDate` (import `fmt12`, `fmtShortDate`; rename call sites) |
| `src/components/itinerary/DaySection.tsx` | `fmt12`, `formatDate` (import `fmt12`, `fmtWeekdayParts`) |
| `src/components/itinerary/EventCard.tsx` | `fmt12` |
| `src/app/trips/[tripId]/page.tsx` | `formatDateRange` (use `style: 'long'`) |
| `src/components/trips/TripsClient.tsx` | `formatDateRange` (default short style) |
| `src/app/trips/[tripId]/print/page.tsx` | any local `fmt12`/date formatter duplicating the above — mechanical import swap ONLY; do not change the print page's rendering or output |

This is a pure refactor: rendered output must be identical everywhere.

## Step 4 — Fix duplicate-trip data loss (`src/app/api/trips/[tripId]/duplicate/route.ts`)

The route currently copies the trip row, `trip_days`, and `trip_events` only. Flights, hotels, parking, rental cars, transit, and the cover image are **silently dropped**. Fix inside the existing `db.transaction()`:

1. **Copy the five booking tables.** For each of `trip_flights`, `trip_hotels`, `trip_parking`, `trip_rental_cars`, `trip_transit`: `SELECT * WHERE trip_id = ?` on the source, then INSERT each row with:
   - a fresh `crypto.randomUUID()` id, `trip_id = newTripId`,
   - `booking_status = 'unbooked'` (matches the established convention for duplicated events),
   - `NULL` for `confirmation_number` (all five), `return_confirmation_number` (flights), `order_number` (parking),
   - everything else copied as-is (dates, times, costs, seats, room type, locations — they're useful planning data),
   - `created_at = updated_at = now` (same `now` the route already computes).
   Column lists come from migration `001_initial_schema` in `src/db/migrations.ts` (lines ~74–190). Migrations 002/003 added no columns to these five tables — but verify by reading the whole migrations array before writing the INSERTs. **Count your placeholders**: each INSERT's `?` count must exactly match its `.run()` argument count (interleaving literals like `'unbooked'` and `NULL` in the SQL reduces the placeholder count — the existing `insertEvent` statement shows the pattern).
2. **Copy the cover image.** Two parts:
   - Add `cover_image_url` to the column list of the existing trips INSERT…SELECT (it's currently omitted, so copies lose their cover reference).
   - Copy the blob row: `INSERT INTO trip_cover_images (trip_id, data, updated_at) SELECT ?, data, ? FROM trip_cover_images WHERE trip_id = ?` with `(newTripId, now, tripId)` — only meaningful if a row exists; INSERT…SELECT of zero rows is a harmless no-op.
   - Note the cover URL format is `/api/trips/<id>/cover-image?v=<ts>` and embeds the **source** trip id. After the INSERT…SELECT, if the copied `cover_image_url` is non-null, UPDATE the new trip's `cover_image_url` to point at the new trip id: `/api/trips/${newTripId}/cover-image?v=<now timestamp>`. Read `src/app/api/trips/[tripId]/cover-image/route.ts` first to confirm the exact URL shape it sets on upload, and mirror it.

Do not change the events-copying logic, the "(Copy)" title suffix, `status = 'planning'`, or `digest_enabled = 0`.

---

## Verification

1. `npx tsc --noEmit` and `npm run lint` pass.
2. `npm run dev` → visual spot-check that nothing changed: trips list dates, trip page header date range, Key Bookings card dates/times, day headers (weekday/date), event card times, and the `/trips/<id>/print` page all render exactly as before.
3. Duplicate-trip fix, end to end: pick (or create) a trip that has at least one flight, hotel, parking, rental car, transit, event, and a cover image. Click the Copy button on the trips list. In the copy: all six item types present; every booking shows "Needs Booking"; confirmation and order numbers empty (spot-check via form fields or `sqlite3 local.db "SELECT confirmation_number, booking_status FROM trip_hotels WHERE trip_id='<copy-id>'"`); costs/dates/seats preserved; cover image renders on the trips list card for the copy.
4. Original trip untouched after duplication (statuses and confirmation numbers intact).
5. Sheet and DropdownMenu compile and are exported; no page imports them yet.
6. Print preview (Ctrl+P) on a trip page: unchanged.

## Done when

- `grep -n "function fmt12" src/components src/app -r` shows no local copies outside `src/lib/dates.ts`.
- Duplicating a fully-loaded trip loses no data except confirmations/statuses (by design).
- Committed as: `Redesign phase 1: sheet and menu primitives, date helpers, full duplicate-trip copy`.
