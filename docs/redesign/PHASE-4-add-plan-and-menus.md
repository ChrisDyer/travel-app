# Phase 4 — "Add a plan" button + trip-header "More options" menu

**Goal:** TripIt-style additions: one **+ Add a plan** button on the trip page that opens a menu (Flight, Hotel, Rental Car, Parking, Transit, Activity) launching the right form; and a header **⋯** menu consolidating Print/PDF, Export to calendar, Duplicate trip, and Delete trip. Edit stays a visible header button (highest-frequency action). This phase also finishes centralizing all form mounting in `ItineraryDocument` and fixes the section-visibility trap.

**Depends on:** Phase 1 (DropdownMenu primitive), Phase 2 (form-mount consolidation started). Read `docs/redesign/README.md` conventions first.

---

## Step 1 — Create `src/components/itinerary/AddPlanMenu.tsx`

Client component. Props: `{ onAdd: (kind: BookingKind) => void }` (import `BookingKind` from `./booking-selection`).

- Trigger: `<Button><Plus className="h-4 w-4 mr-1" /> Add a plan</Button>` via `DropdownMenuTrigger render={...}` (base-ui composition — see `dialog.tsx` for the `render=` pattern).
- Items, each with a lucide icon: Flight (`Plane`), Hotel (`BedDouble`), Rental Car (`CarFront`), Parking (`SquareParking`), Transit (`TrainFront`), Activity (`CalendarPlus`). Each item calls `onAdd(<kind>)` — kinds: `'flight' | 'hotel' | 'rentalCar' | 'parking' | 'transit' | 'event'`.
- Wrapper carries `no-print`.

## Step 2 — Wire "add" state into `ItineraryDocument.tsx`

1. Add `const [adding, setAdding] = useState<BookingKind | null>(null);`
2. Render `<AddPlanMenu onAdd={handleAdd} />` in an action row at the top of the **right (days) column**, above the empty-state card / first `DaySection`.
3. `handleAdd(kind)`:
   - `'event'` → `setAddingToDay(selectedDay ?? days[0])` (the existing EventForm already shows a day selector when `days.length > 1`, so the user can retarget).
   - other kinds → `setAdding(kind)`.
4. Extend the existing form mounts to also open for adding, mirroring the `(editingX || addingX)` pattern KeyBookings used before Phase 2. E.g. flights: `{(editingFlight || adding === 'flight') && <FlightForm tripId={trip.id} flight={editingFlight} … />}` — when adding, `flight` is `null` so the form opens blank. Each form's `onSaved`/`onClose` must also clear `adding` (`setAdding(null)`). The save handlers already append to the arrays for `isNew`.
5. Update the empty-trip onboarding card copy (the "Let's plan this trip ✈" block) to point at the new button, e.g.: *"Use **Add a plan** to add flights, hotels, and more — or open the Trip Assistant and paste a confirmation email."*

## Step 3 — Simplify `KeyBookings.tsx` to a pure display + select surface

- Delete the five `addingX` states, the five `handleXSaved` functions, all remaining form mounts, and the now-unused form imports. After this, `KeyBookings` renders cards and calls two callbacks: `onSelect(ref)` (Phase 2) and a new `onAdd: (kind: BookingKind) => void` for the section-header "+ Flight"/"+ Hotel"/etc. buttons (wired to the same `handleAdd` in `ItineraryDocument`).
- The `onFlightsChange`/…/`onTransitChange` props should now be unused — remove them from `KeyBookingsProps` and from the `ItineraryDocument` call site.
- **Section visibility fix** (prevents globally-added items from being invisible): Flights section renders when `travelMode === 'fly' || flights.length > 0`; Rental Car section when `rentalCarNeeded || rentalCars.length > 0`. (Today a rental car added to a `rentalCarNeeded: false` trip, e.g. via the Assistant or the new Add-a-plan menu, would vanish from the left rail.)

## Step 4 — Create `src/components/trips/TripMoreMenu.tsx`

Client component. Props: `{ trip: Trip }`.

- Trigger: `<Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>` with `aria-label="More options"`.
- Items:
  1. **Print / PDF** — `DropdownMenuLinkItem` → `/trips/${trip.id}/print`, `target="_blank"` (real link; middle-click must work). Icon `Printer`.
  2. **Export to calendar** — `DropdownMenuLinkItem` → `/api/trips/${trip.id}/export` (browser downloads the .ics). Icon `CalendarPlus`.
  3. **Duplicate trip** — item; POST `/api/trips/${trip.id}/duplicate`, disable while in flight, then `toast('Trip duplicated')` + `router.push('/trips/' + copy.id)`; on failure `toast('Could not duplicate the trip. Please try again.', 'error')`. Mirror `TripsClient.handleDuplicate` exactly. Icon `Copy`.
  4. Separator.
  5. **Delete trip** — destructive item; opens a small confirm `Dialog` ("Delete this trip? This permanently deletes all its days, events, and bookings." / Cancel / red Delete). On confirm: `DELETE /api/trips/${trip.id}`; check `res.ok`; success → `toast('Trip deleted')` + `router.push('/trips')`; failure → error toast, trip stays. Icon `Trash2`.

## Step 5 — Header cleanup

- `src/components/trips/TripHeaderActions.tsx`: remove the Export `<a>` block; keep the timing chip and Edit button; render `<TripMoreMenu trip={trip} />` after Edit.
- `src/app/trips/[tripId]/page.tsx`: remove the standalone `Print / PDF` `<Link>`/`<Button>` from the header (it now lives in the ⋯ menu).

---

## Verification

1. On an **empty new trip**: use Add a plan to add each of the six kinds. Each form opens blank, saves, and the item appears in Key Bookings and the day timeline without a reload. Activity lands on the selected day (or day 1) and can be retargeted via the form's day selector.
2. On a `travelMode: 'drive'`, `rentalCarNeeded: false` trip: add a Flight and a Rental Car via the menu → both sections appear in Key Bookings with the new items.
3. Section "+ Flight"/"+ Hotel"/etc. buttons still work (now routed through `ItineraryDocument`).
4. Header ⋯ menu: Print opens the print page in a new tab; Export downloads an `.ics`; Duplicate lands on a complete copy (Phase 1 fix — spot-check bookings came along); Delete shows the confirm dialog, cancel keeps the trip, confirm returns to `/trips` with the trip gone.
5. Keyboard: both menus open with Enter/Space, arrow-navigate, activate with Enter, close with Esc.
6. Print preview: Add-a-plan button and ⋯ menu absent.
7. Empty-state card shows the updated copy.
8. `npx tsc --noEmit`, `npm run lint`.

## Done when

- `KeyBookings.tsx` contains no form imports and no `useState` for forms (grep: `grep -n "Form" src/components/itinerary/KeyBookings.tsx` shows nothing).
- All six item forms are mounted in exactly one place (`ItineraryDocument.tsx`).
- Committed as: `Redesign phase 4: add-a-plan menu and trip more-options menu`.
