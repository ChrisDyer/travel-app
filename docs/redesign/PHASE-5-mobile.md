# Phase 5 — Mobile pass on the trip detail page

**Goal:** Make the trip page genuinely usable on a phone — the device you actually hold mid-trip. Below `lg`: a tabbed layout (Itinerary / Bookings / Overview), the drawer as a bottom sheet, near-fullscreen forms, ≥40px touch targets, and Add-a-plan as a floating action button. **Desktop (`lg` and up) must be pixel-unchanged.**

**Depends on:** Phases 1–4 (drawer, compact cards, Add-a-plan all exist and get mobile treatment here). Read `docs/redesign/README.md` conventions first.

**The print trap (read twice):** tab switching must hide content with responsive CSS classes, and print output must never depend on which tab is active. The left column contains the print-only booking list; if a `hidden` class hides the whole column at print time, printed itineraries lose their bookings. Every tab-hiding class must be paired with a `print:block` override (Tailwind `print:` variant targets `@media print`). Verify with print preview in a narrow window.

---

## Step 1 — Tabbed layout in `ItineraryDocument.tsx`

1. Add `const [mobileTab, setMobileTab] = useState<'itinerary' | 'bookings' | 'overview'>('itinerary');`
2. Render a segmented control visible only below `lg`, sticky under the page header:
   ```
   <div className="lg:hidden no-print sticky top-0 z-20 -mx-4 px-4 py-2 bg-stone-50/95 backdrop-blur border-b border-stone-200 flex gap-1">
   ```
   Three buttons (Itinerary / Bookings / Overview), active = `bg-stone-800 text-white rounded-full text-xs font-medium px-3 py-1.5`, inactive = `bg-stone-100 text-stone-500` (match the trips-list filter pill styling). Buttons need `min-h-10` touch height.
3. Restructure the two-column grid so each tab's content can hide independently below `lg` **without unmounting** (state and the Google Map instance must survive tab switches — use CSS visibility, never conditional rendering):
   - Wrap `TripMap` + `CancellationDeadlines` + `TripCostSummary` in an "overview" container: `className={cn(mobileTab !== 'overview' && 'max-lg:hidden', 'print:block')}`
   - Wrap `KeyBookings` in a "bookings" container: `className={cn(mobileTab !== 'bookings' && 'max-lg:hidden', 'print:block')}`
   - The right (days) column gets: `className={cn(mobileTab !== 'itinerary' && 'max-lg:hidden', 'print:block', 'space-y-12')}`
   - Keep the existing `lg:grid-cols-[640px_1fr]` grid and `lg:sticky` left column for desktop; the overview/bookings wrappers live inside the existing left column div (which itself must never get `max-lg:hidden` — only its two inner wrappers do).
   - `TripAssistant` stays above the grid on all breakpoints (it's collapsible already).
4. The sticky tab bar must not overlap toasts (toaster is fixed bottom-right — no conflict) or the FAB (Step 4).

## Step 2 — Bottom-sheet + form ergonomics

1. `src/components/ui/sheet.tsx`: verify/finish the `<sm` bottom-sheet styles from Phase 1 (85dvh cap — `dvh` not `vh` for iOS toolbars, rounded top, grab handle, internal scroll). The `SheetFooter` must stay visible above the iOS home indicator: add `pb-[max(1rem,env(safe-area-inset-bottom))]`.
2. `src/components/ui/dialog.tsx` — make form dialogs near-fullscreen on phones **without changing desktop**: on `DialogContent`, add `max-sm:max-w-[calc(100%-1rem)] max-sm:max-h-[92dvh] max-sm:overflow-y-auto`. Do not alter the ≥sm classes.
3. iOS zoom: inputs must render at ≥16px font on mobile. Check `src/components/ui/input.tsx`, `select.tsx`, `textarea.tsx` — if they use `text-sm`, change to `text-base sm:text-sm` (16px on mobile, unchanged on desktop).

## Step 3 — Touch targets in the timeline

`src/components/itinerary/EventCard.tsx`:
- Reorder arrows are hover-revealed (`opacity-0 group-hover:opacity-100`) — dead on touch. Change to `lg:opacity-0 lg:group-hover:opacity-100 max-lg:opacity-100`.
- Enlarge the arrow hit areas to ≥40px on touch: the ▲/▼ buttons get `max-lg:p-2 max-lg:text-sm` (keep desktop sizing).

`src/components/itinerary/DaySection.tsx`: no structural change; confirm timeline cards have comfortable tap heights (`p-3` cards are acceptable; do not shrink anything).

## Step 4 — Add-a-plan as a FAB on mobile

`AddPlanMenu` trigger becomes a floating action button below `lg` and stays an inline button at `lg+`. Wrapper: `max-lg:fixed max-lg:bottom-5 max-lg:right-5 max-lg:z-30 lg:static no-print`; the trigger Button gets `max-lg:rounded-full max-lg:shadow-lg max-lg:h-13 max-lg:px-4`. Ensure the menu popup positions correctly from the corner (base-ui Positioner should flip automatically; verify).

## Step 5 — Responsive page header (`src/app/trips/[tripId]/page.tsx`)

- Header padding `max-sm:px-4 max-sm:py-3`.
- The title block needs `min-w-0` and the `<h1>` gets `truncate` so long titles don't wrap the action buttons off-screen.
- Hide the timing chip on very small screens: in `TripHeaderActions.tsx`, add `max-sm:hidden` to the timing `<span>`.
- The `← Trips` link and Home icon stay; confirm nothing wraps at 390px width with a long trip title.

---

## Verification

All checks at DevTools 390×844 (iPhone-ish) **and** ≥1280 desktop:

1. **Tabs:** default tab is Itinerary; switching to Bookings shows Key Bookings; Overview shows map + deadlines + cost summary. Switch away from Overview and back — the map does **not** reload from scratch (it stayed mounted). Desktop shows both columns simultaneously, no tab bar.
2. **Drawer:** tap a booking card → bottom sheet slides up, grab handle visible, content scrolls, Edit/Delete reachable above the home-indicator zone, X/backdrop dismiss. Desktop still gets the right-side panel.
3. **Forms:** open every form on mobile — near-fullscreen, all fields reachable, no iOS-style zoom jump when focusing inputs (16px check), Save/Delete reachable.
4. **FAB:** floats bottom-right on mobile, opens the menu, all six kinds work; inline button on desktop. FAB does not cover the last timeline card's reorder arrows (scroll to bottom and check; adjust bottom padding of the days column with `max-lg:pb-24` if it does).
5. **Reorder arrows:** visible without hover on mobile, comfortably tappable.
6. **Header:** long trip title truncates; no horizontal scroll at 390px anywhere on the page.
7. **Print (the trap):** with the browser window narrow (below lg) and the active tab = Itinerary, Ctrl+P → the print output still contains the Key Bookings print list AND the day-by-day itinerary. Repeat with tab = Bookings. Also verify the tab bar and FAB are absent from print.
8. Desktop ≥1024: layout byte-identical to Phase 4 (two sticky columns, inline Add-a-plan, no tab bar).
9. `npx tsc --noEmit`, `npm run lint`.

## Done when

- The phone experience is self-sufficient: view itinerary, check a confirmation number via drawer, add a plan, edit a booking — all one-handed.
- Print output is tab-independent.
- Committed as: `Redesign phase 5: mobile tabs, bottom sheet, touch ergonomics`.
