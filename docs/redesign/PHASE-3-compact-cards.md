# Phase 3 — Compact TripIt-style cards

**Goal:** Slim every interactive card to TripIt density — logo, name/route, key date/time, status badge. Everything removed here is already visible in the Phase 2 drawer, so no information becomes unreachable. Pure visual change; no state or API work.

**Depends on:** Phases 1–2 (drawer must exist before fields leave the cards). Read `docs/redesign/README.md` conventions first.

**Print safety (critical):** the interactive cards you are slimming are all `no-print`; the print output comes from the separate `hidden print:flex` list at the bottom of `KeyBookings.tsx` and from `/trips/[tripId]/print/page.tsx`. **Do not modify either**, even though they now "duplicate" fields the visible cards no longer show — that duplication is intentional (print must keep full detail).

---

## Step 1 — Key Bookings cards (`src/components/itinerary/KeyBookings.tsx`)

Keep on every card: the `statusBorder` background/border coloring, `BrandLogo`, `BookingStatusBadge`, and add a subtle affordance chevron at the far right of each card: `<ChevronRight className="h-4 w-4 text-stone-300 shrink-0 self-center" />` (import from `lucide-react`) so cards read as tappable rows.

Per-type content spec:

### Flight
**Keep:** airline logo (or airline name when no logo), route `ORD → SEA` (+ ` → ORD` when round-trip), "Round Trip" chip, and per-leg lines via the existing `LegRow` — but `LegRow` drops its `conf` and `seats` params entirely: each leg shows only label ("Outbound"/"Return"), flight number, date, `dep → arr` times.
**Remove:** confirmation numbers, seats (both legs), the `cancellationPolicy` paragraph.

### Hotel
**Keep:** logo, full property name, one dates line: `Sat, Aug 8 – Sun, Aug 9` (check-in – check-out via `fmtShortDate`; no times).
**Remove:** address line + MapPin link, check-in/out *times*, `roomType`, `confirmationNumber`, `amenities`, `cancellationPolicy`.

### Parking
**Keep:** 🅿️, location (+ `level` as the existing muted suffix), one dates line: `Aug 10 – Aug 15` (drop-off – pick-up dates, no times).
**Remove:** address + MapPin, times, `vendor`, `confirmationNumber`, `orderNumber`, cost.

### Rental car
**Keep:** logo/company, `carClass` (existing muted suffix), one dates line: `Aug 10 – Aug 15` (pickup – dropoff dates).
**Remove:** pickup/dropoff *locations* and *times*, `confirmationNumber`, `driverName`, cost.

### Transit
**Keep:** type emoji, operator + routeNumber, `from → to` line, departure `date @ time` (transit is a point-in-time thing; the time earns its place).
**Remove:** `confirmationNumber`, `seatInfo`, cost.

For the date-range lines, when only one of the two dates exists, show just that one with its existing label (e.g. `Check-in: Sat, Aug 8`). Keep the existing empty-state texts ("No flights added." etc.) unchanged.

## Step 2 — Event cards (`src/components/itinerary/EventCard.tsx`)

**Keep:** BrandLogo/category icon, title, the location line with its `locationUrl` link and MapPin (location is the point of an event card — it stays), start time, `BookingStatusBadge`, reorder arrows.
**Remove:** the `confirmationNumber` line, the `vendor`/`orderNumber` line, the `seatInfo` line, the "Cancel by …" line, and the `notes` `line-clamp-2` block.

If, after removal, `getLogoPath` is no longer referenced in the file, drop the import.

## Step 3 — Timeline booking cards (`src/components/itinerary/DaySection.tsx`)

These are already near-target (name + role label + time). Two changes only:
1. Remove the MapPin address links from the **hotel** and **parking** timeline rows (address now lives in the drawer; keeping tiny stop-propagation targets inside a compact row is mis-tap bait on mobile). Rental-car rows keep their location text suffix; the EventCard MapPin stays (Step 2).
2. No other content changes. Do not touch day headers, day title/notes editing, or the timeline sort.

---

## Verification

1. `npm run dev`, open a dense trip (round-trip flight with seats + confs, 2+ hotels with addresses/policies, parking with order number, rental car with driver, transit with seat info, events with notes and conf numbers).
2. Every card renders on 1–3 lines, TripIt-like; no wrapping walls of muted text. Status coloring still legible per card.
3. For each removed field: open the item's drawer and confirm the field appears there (nothing became unreachable).
4. `CancellationDeadlines` panel still lists deadlines/policies (it is untouched — it reads the same arrays).
5. **Print checks:** Ctrl+P on the trip page — the print booking list still shows confirmation numbers, addresses, seats, policies. `/trips/<id>/print` page unchanged.
6. `npx tsc --noEmit`, `npm run lint`.

## Done when

- Visible Key Bookings cards contain no confirmation numbers, addresses, policies, seats, amenities, vendors, or costs.
- Print output is provably unchanged (compare before/after print preview).
- Committed as: `Redesign phase 3: compact TripIt-style cards`.
