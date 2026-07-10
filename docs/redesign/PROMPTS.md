# Implementation Agent Prompts — UI/UX Redesign

Copy-paste one prompt per agent session, in order. Each phase must be finished, verified, and committed before starting the next — start each phase in a **fresh session** so the agent reads the current state of the code.

---

## Phase 1

```
Implement the work order in docs/redesign/PHASE-1-foundation.md in this repo, exactly as written.

Before touching code: read that file in full, then the "Global conventions" and "Print safety" sections of docs/redesign/README.md, then AGENTS.md at the repo root (this Next.js version has breaking changes — trust the repo's existing patterns over your training data). src/components/ui/dialog.tsx is the reference for how base-ui primitives are wrapped in this codebase — read it before writing sheet.tsx or dropdown-menu.tsx, and check node_modules/@base-ui/react/menu for the installed Menu API.

Scope discipline:
- This phase must produce ZERO visual change. The date-helper work is a pure refactor: rendered output must be byte-identical, so copy the existing implementations rather than "improving" them.
- The Sheet and DropdownMenu primitives are not mounted anywhere yet — build them, make them compile, remove any temporary test mounts before committing.
- For the duplicate-trip fix: derive the INSERT column lists from src/db/migrations.ts (read the whole migrations array), count placeholders against .run() arguments, and read the cover-image route before writing the cover-URL rewrite.
- Do not fix unrelated issues; later phases cover them.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed and passing — especially item 3: duplicate a trip that has a flight, hotel, parking, rental car, transit, event, AND a cover image, then verify all of it arrived in the copy with statuses reset and confirmations stripped.
3. grep -rn "function fmt12" src/ returns only src/lib/dates.ts.
4. Commit with message "Redesign phase 1: sheet and menu primitives, date helpers, full duplicate-trip copy".
5. Report back: files changed, verification results item by item, any deviations from the doc with reasons.
```

---

## Phase 2

```
Implement the work order in docs/redesign/PHASE-2-detail-drawer.md in this repo, exactly as written. Redesign phase 1 is already committed (the Sheet primitive exists).

Before touching code: read that file in full, then the "Global conventions" and "Print safety" sections of docs/redesign/README.md, then AGENTS.md at the repo root. Also read src/components/itinerary/ItineraryDocument.tsx, KeyBookings.tsx, DaySection.tsx, and EventCard.tsx completely before editing any of them — this phase rewires how they communicate.

The one design rule you must not violate: the drawer stores a {kind, id} reference and derives the live item from the state arrays on every render. If you find yourself storing a booking object in the drawer's state, you have introduced the stale-data bug this design exists to prevent — stop and re-read the doc.

Scope discipline:
- Card VISUALS do not change in this phase — only what clicking does. Card slimming is Phase 3.
- KeyBookings loses its five editing states and edit-form mounts but KEEPS its adding states and add-form mounts (Phase 4 removes those).
- The parking delete endpoint segment is parking-bookings, not parking.
- Never remove an item from the UI before the server confirms the delete.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed in the running app for ALL SIX item types — these are interaction tests (drawer shows every field, edit-from-drawer updates the drawer live, delete removes the item everywhere); actually click through them.
3. grep -rn "onEditFlight\|onEditHotel\|onEditParking\|onEditRentalCar\|onEditTransit\|onEditEvent" src/components returns nothing.
4. Commit with message "Redesign phase 2: booking detail drawer".
5. Report back: files changed, verification results item by item, whether you kept the drawer open under the edit form or used the documented fallback, any deviations with reasons.
```

---

## Phase 3

```
Implement the work order in docs/redesign/PHASE-3-compact-cards.md in this repo, exactly as written. Redesign phases 1-2 are already committed (the detail drawer exists — that is why fields may now leave the cards).

Before touching code: read that file in full, then the "Global conventions" and "Print safety" sections of docs/redesign/README.md, then AGENTS.md at the repo root.

The print-safety rule is the whole risk of this phase: the hidden print:flex list at the bottom of KeyBookings.tsx and the /trips/[tripId]/print page keep FULL detail and must not be touched, even though they now duplicate data the visible cards no longer show. That duplication is intentional. If you feel the urge to "clean it up", don't.

Scope discipline:
- Follow the per-type keep/remove tables literally. Keep statusBorder coloring, BrandLogo, BookingStatusBadge, and the existing empty-state texts.
- The EventCard location line (with its links) STAYS; the hotel/parking timeline MapPin links GO. That asymmetry is deliberate.
- No state, prop, or API changes — this is a render-only phase.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed — including confirming, field by field, that everything removed from a card is visible in that item's drawer, and a before/after print-preview comparison showing print output unchanged.
3. Commit with message "Redesign phase 3: compact TripIt-style cards".
4. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## Phase 4

```
Implement the work order in docs/redesign/PHASE-4-add-plan-and-menus.md in this repo, exactly as written. Redesign phases 1-3 are already committed (DropdownMenu primitive exists; form mounting is already consolidated for editing).

Before touching code: read that file in full, then the "Global conventions" and "Print safety" sections of docs/redesign/README.md, then AGENTS.md at the repo root. Check node_modules/@base-ui/react/menu for the installed Menu API — use Menu.LinkItem (via the DropdownMenuLinkItem wrapper) for the Print and Export entries so they are real links.

Scope discipline:
- Edit stays a visible header button; only Print, Export, Duplicate, and Delete go into the ⋯ menu.
- The section-visibility fix in KeyBookings (show Flights when travelMode==='fly' OR flights exist; show Rental Car when rentalCarNeeded OR rentals exist) is part of this phase — without it, globally-added items can be invisible in the left rail.
- After this phase KeyBookings mounts no forms at all; if any form import survives in it, you are not done.
- Mirror TripsClient.handleDuplicate for the duplicate action, including the in-flight disable.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed — including adding all six plan kinds from the button on an empty trip, the drive-mode/no-rental-flag visibility test, all four ⋯ menu actions end to end, and the keyboard-navigation check.
3. grep -n "Form" src/components/itinerary/KeyBookings.tsx returns nothing.
4. Commit with message "Redesign phase 4: add-a-plan menu and trip more-options menu".
5. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## Phase 5

```
Implement the work order in docs/redesign/PHASE-5-mobile.md in this repo, exactly as written. Redesign phases 1-4 are already committed.

Before touching code: read that file in full, then the "Global conventions" and "Print safety" sections of docs/redesign/README.md, then AGENTS.md at the repo root.

Two hard rules:
- Desktop (lg and up) must be pixel-unchanged. Every mobile style must be scoped with max-lg:/max-sm: variants (or lg:/sm: on the desktop side); if you change an unprefixed class, you are changing desktop.
- Tab switching hides content with CSS classes paired with print:block overrides — NEVER conditional rendering (the Google Map must stay mounted across tab switches) and NEVER in a way that lets the active tab decide what prints. The doc's "print trap" section describes the exact failure mode; test it explicitly.

Scope discipline:
- The three tabs are Itinerary / Bookings / Overview as specified; do not invent a fourth or merge them.
- Input font-size changes are text-base sm:text-sm (16px mobile only) — do not resize desktop text.
- The FAB is the existing AddPlanMenu restyled responsively, not a second component.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed at BOTH 390x844 and >=1280 widths — including the map-stays-mounted tab check, the narrow-window print check on two different active tabs, and the no-horizontal-scroll check with a long trip title.
3. Commit with message "Redesign phase 5: mobile tabs, bottom sheet, touch ergonomics".
4. Report back: files changed, verification results item by item (state the two widths you tested), any deviations with reasons.
```

---

## Phase 6

```
Implement the work order in docs/redesign/PHASE-6-trips-list.md in this repo, exactly as written. Redesign phases 1-5 are already committed (only phase 1 is a hard dependency).

Before touching code: read that file in full, then the "Global conventions" and "Print safety" sections of docs/redesign/README.md, then AGENTS.md at the repo root.

The classic bug to avoid: the ⋯ menu trigger sits over a card that is wrapped in a Link. Clicking the trigger or a menu item must never navigate. The doc allows moving the trigger outside the Link as an absolutely-positioned sibling — prefer that structure if event containment is at all flaky.

Scope discipline:
- Filter/search/sort logic and the trips-list-prefs localStorage persistence are untouched — layout-only changes to that row.
- Keep raw <img> tags (this codebase does not use next/image).
- handleDuplicate and setEditing are reused as-is; the only new mutation is the delete flow, which must check res.ok and keep the card on failure.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed — including the middle-click navigation check, the ⋯-never-navigates check, delete cancel/confirm paths, and filter persistence across reloads.
3. Commit with message "Redesign phase 6: trips list grid, cover-forward cards, per-card menu".
4. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## If an agent gets stuck

Every prompt implies this, but if you need to say it explicitly mid-session:

```
If the doc's line numbers have drifted or a symbol was renamed, find the described code by its content and proceed, noting the drift in your report. If the doc genuinely contradicts the code's current behavior, STOP, describe the contradiction, and wait — do not improvise a different design.
```
