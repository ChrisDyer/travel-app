# Phase 2 — Booking Detail Drawer (progressive disclosure core)

**Goal:** Clicking any booking card or timeline item opens a right-side slide-over drawer showing **all** details of that item, with Edit and Delete inside. Clicking no longer jumps straight into the edit form. Card *visuals* stay dense in this phase (Phase 3 slims them) — only click behavior and form-mount ownership change.

**Depends on:** Phase 1 (Sheet primitive). Read `docs/redesign/README.md` conventions first. Read `src/components/itinerary/ItineraryDocument.tsx`, `KeyBookings.tsx`, `DaySection.tsx`, and `EventCard.tsx` in full before editing any of them.

**Design rule (the one thing you must not get wrong):** the drawer must never hold a *copy* of an item. Booking mutations update the arrays in `ItineraryDocument` without a page refresh, so a stored copy goes stale the moment the user edits from within the drawer. The drawer stores only `{ kind, id }` and derives the live item from the arrays on every render.

---

## Step 1 — Create `src/components/itinerary/booking-selection.ts`

```ts
export type BookingKind = 'flight' | 'hotel' | 'parking' | 'rentalCar' | 'transit' | 'event';
export type BookingRef = { kind: BookingKind; id: string };
```

These kind strings intentionally match the `TimelineItem` discriminants already used in `DaySection.tsx` (`'event' | 'flight' | 'hotel' | 'parking' | 'rentalCar' | 'transit'`).

## Step 2 — Create `src/components/itinerary/BookingDetailSheet.tsx`

Props:

```ts
interface BookingDetailSheetProps {
  tripId: string;
  selection: BookingRef | null;
  flights: TripFlight[];
  hotels: TripHotel[];
  parking: TripParking[];
  rentalCars: TripRentalCar[];
  transit: TripTransit[];
  events: TripEvent[];
  days: TripDay[];              // to caption events with "Day 3 · Sat, Aug 12"
  onClose: () => void;
  onEdit: (ref: BookingRef) => void;
  onDeleted: (ref: BookingRef) => void;   // parent updates arrays + toasts
}
```

Behavior:
- Resolve the item: look up `selection.id` in the array matching `selection.kind`. If `selection` is null or the item is not found (just deleted), render `<Sheet open={false}>` / nothing.
- Render `<Sheet open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>` with `SheetContent`.
- Reuse existing building blocks: `BrandLogo` (`./BrandLogo`), `BookingStatusBadge` (`./BookingStatusBadge`), `getMapsUrl` (`@/lib/maps`), `fmt12`/`fmtShortDate` (`@/lib/dates`), `toast` (`@/components/ui/toast`), `Button`.

Layout:

**Header** (`SheetHeader`): BrandLogo (fallback emoji per type: ✈ 🏨 🅿️ 🚗 🚌/transit-type icon, 📌 category icon for events — copy the `transitTypeIcon` and `categoryIcons` maps' lookups from `KeyBookings.tsx`/`EventCard.tsx`), title, `BookingStatusBadge`, and a one-line subtitle:
- flight: `ORD → SEA` (+ ` → ORD` for round trip) + "Round Trip" chip
- hotel: address; parking: address; rentalCar: `carClass`; transit: `from → to`; event: location.

**Body**: stacked sections separated by `border-t border-stone-100`, each a small definition list — label column `text-xs text-stone-400 w-28 shrink-0`, value `text-sm text-stone-700`. **Omit any row whose value is null/empty. Omit any section with no rows.** Sections and rows per kind (field names are the camelCase versions from `src/types/travel.ts` — verify against the interfaces there):

| Section | flight | hotel | parking | rentalCar | transit | event |
|---|---|---|---|---|---|---|
| **When** | Outbound: flightNumber, departureDate + departureTime → arrivalDate/arrivalTime; Return (if round-trip): returnFlightNumber, returnDepartureDate/Time → returnArrivalDate/Time | Check-in date @ time; Check-out date @ time | Drop-off date @ time; Pick-up date @ time (suppress `00:00` times, as the cards do today) | Pick-up date @ time; Drop-off date @ time | Departs date @ time; Arrives date @ time | Day caption (from `days`), startTime – endTime |
| **Where** | departure/arrival airports | address (+ MapPin link via `getMapsUrl`), locationUrl as "Website ↗" | address (+ MapPin link), level | pickupLocation, dropoffLocation | fromLocation, toLocation | location (+ MapPin link), locationUrl as "Website ↗" |
| **Booking** | confirmationNumber, seats; return leg: returnConfirmationNumber, returnSeats | confirmationNumber, roomType, amenities | confirmationNumber, orderNumber, vendor | confirmationNumber, driverName | confirmationNumber, seatInfo, operator + routeNumber | confirmationNumber, vendor, orderNumber, seatInfo, bookingUrl as "View booking ↗" |
| **Cost** | cost + currency | cost + currency | cost + currency | cost + currency | cost + currency | cost + currency |
| **Cancellation** | cancellationPolicy | cancellationPolicy, cancellationDeadline | — (no policy column) | cancellationPolicy | — (no policy column) | cancellationPolicy, cancellationDeadline |
| **Notes** | notes | notes | notes | notes | notes | notes (`whitespace-pre-wrap`, full text) |

Format cost as the cards do: `` `${currency ?? 'USD'} ${Number(cost).toFixed(2)}` ``. External links get `target="_blank" rel="noopener noreferrer"`.

**Footer** (`SheetFooter`, sticky): `Edit` button (default variant, calls `onEdit(selection)`) and `Delete` (destructive variant, **two-step inline confirm**: first click swaps label to "Confirm delete?" with a Cancel next to it — same pattern the forms use). On confirm, DELETE to the per-kind endpoint, then `onDeleted(ref)` on success or `toast('Could not delete. Please try again.', 'error')` on failure (never remove from UI before the server confirms):

| kind | endpoint |
|---|---|
| flight | `/api/trips/${tripId}/flights/${id}` |
| hotel | `/api/trips/${tripId}/hotels/${id}` |
| parking | `/api/trips/${tripId}/parking-bookings/${id}` ← note the segment name |
| rentalCar | `/api/trips/${tripId}/rental-cars/${id}` |
| transit | `/api/trips/${tripId}/transit/${id}` |
| event | `/api/trips/${tripId}/events/${id}` |

## Step 3 — Rewire `ItineraryDocument.tsx`

1. Add `const [selection, setSelection] = useState<BookingRef | null>(null);`
2. Mount `<BookingDetailSheet …/>` after the existing form mounts, passing the live arrays and:
   - `onClose={() => setSelection(null)}`
   - `onEdit={(ref) => { …set the matching editingX state from the live array… }}` — e.g. `ref.kind === 'flight'` → `setEditingFlight(flights.find(f => f.id === ref.id) ?? null)`. **Keep the drawer open** underneath the form dialog: after the form saves, the drawer re-renders with fresh data automatically (it derives by id) — a nice "edit → see updated details" loop. If nested Dialog-over-Sheet misbehaves in testing (Esc closing both layers, focus trap fighting), fall back to `setSelection(null)` before opening the form and note the fallback in your report.
   - `onDeleted={(ref) => { …filter the matching array…, setSelection(null), toast('<Kind> deleted') }}`
3. Change the `DaySection` props: **delete** `onEditEvent`, `onEditFlight`, `onEditHotel`, `onEditParking`, `onEditRentalCar`, `onEditTransit` and pass a single `onSelectItem={(ref: BookingRef) => setSelection(ref)}`. Keep `onAddEvent` (still used by "+ Add event").
4. The `editingEvent` form mount currently derives its `day` from `editingEvent.tripDayId` — unchanged; `onEdit` for events sets `editingEvent` exactly like the old timeline click did.

## Step 4 — Update `DaySection.tsx` and `EventCard.tsx`

- `DaySection`: replace the six `onEditX` props with `onSelectItem: (ref: BookingRef) => void`. Every timeline card's `onClick` becomes `onSelectItem({ kind: item.kind, id: <item id> })`. Keep `e.stopPropagation()` on inner links (MapPin anchors) and on the reorder arrows.
- `EventCard`: rename the `onEdit` prop to `onSelect` (still `(event: TripEvent) => void`); `DaySection` passes `(e) => onSelectItem({ kind: 'event', id: e.id })`. No visual changes.

## Step 5 — Update `KeyBookings.tsx`

- Card `onClick`s (all five types) call a new prop `onSelect: (ref: BookingRef) => void` instead of `setEditingX(...)`.
- **Delete** the five `editingX` states, the five `handleXSaved` functions' editing halves, and the five form mounts at the bottom **for editing**. Keep the `addingX` states, the "+ Add" section-header buttons, and form mounts for **adding** (`flight={null}` etc.) — Phase 4 removes those. The `onXChange` props stay (still used by add-save and add-delete paths).
- `ItineraryDocument` passes `onSelect={(ref) => setSelection(ref)}`.

---

## Verification

Run `npm run dev` and exercise with a trip containing all six item types:

1. **Per type (all six):** click the card in Key Bookings → drawer opens showing every populated field (compare against the edit form's contents). Click the same item in the day timeline → same drawer. For a round-trip flight, both the departure and return-arrival timeline entries open the same drawer showing both legs.
2. **Edit loop:** drawer → Edit → form opens pre-filled → change a field → Save → form closes, drawer shows the updated value without reopening, card updates, toast appears.
3. **Delete loop:** drawer → Delete → confirm → item disappears from Key Bookings, timeline, map markers, cost summary, and cancellation deadlines; drawer closes; toast appears. Cancel path leaves everything intact. Stop the dev server and try a delete → error toast, item stays.
4. **Dismissal:** Esc closes the drawer (and only the top layer when the edit form is stacked above it); backdrop click closes; X button closes.
5. **Remount tolerance:** with the drawer open, edit the trip title via header Edit → page refreshes, drawer closes, no crash.
6. **Add still works:** "+ Flight" etc. in Key Bookings section headers still opens the blank form and saves.
7. **Print:** Ctrl+P with drawer open — drawer absent from print output; print booking list unchanged.
8. `npx tsc --noEmit`, `npm run lint`.

## Done when

- `grep -n "onEditFlight\|onEditHotel\|onEditParking\|onEditRentalCar\|onEditTransit\|onEditEvent" src/components -r` returns nothing.
- `KeyBookings.tsx` mounts forms only for adding (no `editingFlight`-style state left in it).
- Committed as: `Redesign phase 2: booking detail drawer`.
