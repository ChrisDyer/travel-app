# Phase 6 — Trips list polish

**Goal:** TripIt-like trip cards: cover image on top, clean typography, a responsive grid, and one ⋯ menu per card (Duplicate / Edit / Delete) replacing the two bare icon buttons. Filters/search/sort keep working exactly as today.

**Depends on:** Phase 1 (DropdownMenu primitive, full duplicate fix). Independent of phases 2–5. Read `docs/redesign/README.md` conventions first. All work is in `src/components/trips/TripsClient.tsx` (plus minor grid-container context in `src/app/trips/page.tsx` if needed).

---

## Step 1 — Grid + card redesign

Replace the current single-column list (`grid gap-4` of horizontal cards with a `w-32` image strip) with a responsive grid: `grid gap-5 sm:grid-cols-2 xl:grid-cols-3`.

Each card (whole card remains a `<Link href={/trips/${trip.id}}>` inside a wrapper div, as today):

1. **Cover area** (top, `h-36 w-full relative`):
   - With image: `<img src={trip.coverImageUrl} alt={trip.title} className="h-full w-full object-cover" />` (keep raw `<img>` — the codebase does not use `next/image`; the src is a same-origin API blob URL).
   - Without image: a gradient placeholder with the destination's first letter — `bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center` containing `<span className="font-serif text-4xl text-stone-400">{trip.destination.charAt(0).toUpperCase()}</span>`.
   - Status pill overlaid `absolute bottom-2 left-2` (existing `statusColors[trip.status]` classes on a `bg` that stays readable over photos — add `shadow-sm`).
   - ⋯ menu trigger overlaid `absolute top-2 right-2` (Step 2).
2. **Body** (`p-4`): serif title (`text-lg font-serif font-semibold text-stone-900 truncate`), destination (`text-sm text-stone-500 truncate`), then dates + timing chip on one muted line exactly as today (`formatDateRange(...)` + `tripTiming(...)` from the existing imports).
3. Card wrapper keeps `bg-white rounded-xl border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all overflow-hidden`.

Optional (include if it looks clean): a "+ New trip" ghost card as the last grid item — dashed border, centered `+ New trip`, `Link` to `/trips/new`.

## Step 2 — Per-card ⋯ menu

Replace the current Copy and Pencil icon buttons with one `DropdownMenu`:

- Trigger: `<Button variant="ghost" size="icon-sm" aria-label="Trip actions"><MoreHorizontal className="h-4 w-4" /></Button>` on a `bg-white/80 backdrop-blur rounded-md` chip so it's visible over photos.
- **Click containment (the classic bug):** the trigger sits inside the card's `<Link>`. The trigger's click handler must call `e.preventDefault()` and `e.stopPropagation()` before opening the menu, and menu-item activations must not bubble into the Link. Test middle-click on the card still navigates but clicking the trigger never does. If nesting inside the Link proves unreliable with base-ui's portal events, move the trigger *outside* the `<Link>` (absolutely positioned sibling within the relatively-positioned card wrapper) — that structure is unambiguous and preferred.
- Items:
  1. **Duplicate** (`Copy` icon) → existing `handleDuplicate(trip)` unchanged (disabled while `duplicating === trip.id`).
  2. **Edit trip** (`Pencil` icon) → existing `setEditing(trip)` unchanged.
  3. Separator.
  4. **Delete trip** (`Trash2` icon, destructive variant) → confirm `Dialog` ("Delete "{trip.title}"? This permanently deletes all its days, events, and bookings." / Cancel / red Delete) → `DELETE /api/trips/${trip.id}` → check `res.ok` → on success remove from `tripList`, `router.refresh()`, `toast('Trip deleted')`; on failure error toast, card stays. (Deleting from the list previously required opening the edit form; this is the direct path. If Phase 4's `TripMoreMenu` shipped a reusable confirm-dialog, reuse it; otherwise a small local one is fine.)

## Step 3 — Filter row responsiveness

The filter pills / search / sort row (`no-print flex flex-wrap …`) must wrap cleanly on mobile: search input `w-full sm:w-48`, sort select `w-full sm:w-44`, pills row allowed to wrap above them. No logic changes — `statusFilter`, `query`, `sort`, and the `trips-list-prefs` localStorage persistence stay exactly as they are.

---

## Verification

1. `npm run dev` → `/trips` renders the grid: 1 column at 390px, 2 at ~768px, 3 at ≥1280px.
2. Cards with cover images show them full-bleed on top; cards without show the gradient + initial. Status pill readable over both.
3. Card click (anywhere except the ⋯ chip) navigates to the trip; middle-click opens a new tab; clicking ⋯ never navigates.
4. ⋯ → Duplicate: lands on a full copy (bookings included — Phase 1). ⋯ → Edit: edit dialog opens as before. ⋯ → Delete: cancel keeps the card; confirm removes it with a toast; the trip is gone after reload.
5. Filters, search, and sort still work and persist across reloads (localStorage `trips-list-prefs`).
6. Empty states: no trips at all → "Plan your first trip" block; filters matching nothing → "clear your filters" block. Both unchanged.
7. Mobile filter row wraps without horizontal scroll.
8. `npx tsc --noEmit`, `npm run lint`.

## Done when

- The trips list reads like a gallery of trips, not a table of rows; all actions are two clicks max.
- Committed as: `Redesign phase 6: trips list grid, cover-forward cards, per-card menu`.
