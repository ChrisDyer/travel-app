# Phase 4 — UI

## Goal

All calendar-sync controls surfaced in the app: connect/reconnect/disconnect, per-trip sync toggle + timezone, per-item include/exclude, sync status with error + retry, and "Sync calendar now".

## Prerequisites

- **Phases 1–3 complete** (OAuth routes, mapping, sync engine + `/calendar/sync` + `/calendar/overrides` endpoints all working).
- Read `docs/calendar-sync/ARCHITECTURE.md` — especially the edge-case table (UI copy must match the disconnect/reconnect semantics) and the `item_type` vocabulary (`rentalCar` → `car` mapping).
- Read `AGENTS.md` (repo root); consult `node_modules/next/dist/docs/` before touching pages/components.

## Read first

- `src/components/trips/TripEditForm.tsx` — the `digestEnabled` checkbox + `digestDayOfWeek` select pattern (state, PATCH body, layout) is the model for the sync toggle + timezone select.
- `src/components/trips/TripMoreMenu.tsx` — menu items incl. "Export to calendar", and its `handleDuplicate`/`handleDelete` loading + toast pattern.
- `src/components/itinerary/BookingDetailSheet.tsx` — the detail drawer; its `BookingRef`/`BookingKind` usage and Edit/Delete footer.
- `src/components/itinerary/booking-selection.ts` — `BookingKind` values (`flight | hotel | parking | rentalCar | transit | event`).
- `src/components/itinerary/ItineraryDocument.tsx` — state hub; how data flows from `src/app/trips/[tripId]/page.tsx`.
- `src/components/ui/toast.tsx` — `toast(msg)` / `toast(msg, 'error')`.
- Existing Select/checkbox components used in the forms (match the app's component idiom — note the recent fix "Select dropdowns showing raw values instead of labels" in git history; use the established Select correctly).

## Work items

### 1. Server-side data plumbing — `src/app/trips/[tripId]/page.tsx`

Load and pass down to `ItineraryDocument`:
- Calendar connection status (query `calendar_tokens` directly server-side — same DB, no need to fetch the status route): `{ connected, needsReauth }`.
- The trip's overrides: `SELECT item_type, item_id, mode FROM calendar_item_overrides WHERE trip_id = ?`.
- The trip row already flows through — it now includes `calendarSyncEnabled`, `timezone`, `calendarLastSyncedAt`, `calendarSyncError`.

### 2. Trip edit form — `src/components/trips/TripEditForm.tsx`

Mirror the `digestEnabled` block:
- **When calendar is connected**: a "Sync to Google Calendar" checkbox bound to `calendarSyncEnabled`, submitted in the same PATCH body. Below it (indented, like `digestDayOfWeek`), a **timezone select**: options from `Intl.supportedValuesOf('timeZone')` with a first option `"" → "Auto (home timezone)"` mapping to `timezone: null`. Only visible/enabled when the checkbox is on.
- **When not connected**: instead of the checkbox, a "Connect Google Calendar" link → `/api/calendar/auth?returnTo=/trips/{tripId}` (plain `<a>`, it's a redirect flow).
- **When `needsReauth`**: an amber "Reconnect Google Calendar" link to the same auth URL.
- A small "Disconnect" text button when connected → confirm dialog whose copy states: *"Events already on your Travel calendar will stay there. To remove them, delete the Travel calendar in Google Calendar."* → `POST /api/calendar/disconnect` → toast + refresh.
- The form needs the connection status — pass it in from wherever the form is opened (check the call site; if the form is opened from the trip page, thread the props; a client `fetch('/api/calendar/status')` on open is an acceptable fallback).

Note: `Intl.supportedValuesOf('timeZone')` returns ~400 entries — use a searchable select if the app has one, else a plain `<select>` is fine (this is a single-user app).

### 3. Trip menu — `src/components/trips/TripMoreMenu.tsx`

Add a **"Sync calendar now"** item next to "Export to calendar", shown only when calendar is connected AND the trip has `calendarSyncEnabled`:
- `POST /api/trips/{tripId}/calendar/sync`, following the `handleDuplicate` loading-guard pattern.
- Response `{ error }` null → `toast('Calendar synced')`; non-null → `toast(error, 'error')`.

### 4. Per-item control — `src/components/itinerary/BookingDetailSheet.tsx`

Add a "Google Calendar" row to the detail sheet (only when connected and the trip's sync toggle is on):
- **Effective-state chip**: "On calendar" / "Not on calendar". Compute effective state client-side: `override === 'include' || (bookingStatus === 'confirmed' && override !== 'exclude')`.
- **Tri-state control** (segmented buttons or a small select): **Auto / Always / Never** → `PUT /api/trips/{tripId}/calendar/overrides` with `mode: null | 'include' | 'exclude'`. Map `BookingKind` `rentalCar` → `car` in the request body (the API also accepts the alias, but map anyway).
- Optimistic update with rollback on failure (see the `reorderEvent` pattern in `ItineraryDocument.tsx`), or simple loading state + refetch — implementer's choice; use toasts for errors.
- Overrides state lives in `ItineraryDocument` (passed from the page, updated after each PUT — the PUT returns the fresh list).

### 5. Sync status indicator — trip page header area (via `ItineraryDocument.tsx`)

When connected and `calendarSyncEnabled`:
- A small chip/line near the header: "Calendar synced {relative time}" from `calendarLastSyncedAt` (reuse any existing relative/short date formatter in `src/lib/dates.ts`).
- When `calendarSyncError` is set: an error chip showing the message with a **Retry** action → same POST as "Sync calendar now". If the error is the reconnect message, link to `/api/calendar/auth?returnTo=/trips/{tripId}` instead.

Keep the styling consistent with existing chips/badges (`BookingStatusBadge.tsx` is a reference for tone).

## Gotchas

- `calendarSyncEnabled` toggling happens through the trip PATCH — which already triggers a sync (Phase 3). After saving the form, the page data is stale for `calendarLastSyncedAt` — refresh/refetch after save (follow whatever the form already does after a successful PATCH, e.g. `router.refresh()`).
- Don't render calendar controls at all for a non-connected user beyond the "Connect" entry point — zero clutter.
- The auth redirect leaves the page; state like an open edit form is lost. That's acceptable — `returnTo` brings the user back to the trip.
- `?calendarConnected=1` lands on the returnTo page after OAuth: optionally show a success toast when that param is present (see how `gmailConnected=1` is handled, if at all — mirror it).

## Definition of done / verification (in-browser)

1. Disconnected state: trip edit form shows "Connect Google Calendar"; no sync UI anywhere else. Click it → Google consent → back on the trip with connected UI.
2. Toggle "Sync to Google Calendar" on + save → events appear in Google (Phase 3 behavior); status chip shows a recent sync time.
3. Timezone select: pick e.g. `Europe/Paris`, save → a timed event in Google shows at the correct Paris wall-clock hour.
4. Open a confirmed booking's detail sheet → chip "On calendar"; set **Never** → event disappears from Google, chip flips. Set **Auto** → returns.
5. Open an unbooked item → "Not on calendar"; set **Always** → appears in Google.
6. "Sync calendar now" in the trip menu → success toast.
7. Error path: set `needs_reauth = 1` in the DB → status chip/edit form shows Reconnect; clicking it runs the OAuth flow and clears the state; events sync again.
8. Disconnect via the form → confirm dialog copy matches the spec → all sync UI reverts to the Connect entry point; trips' toggles are off.
9. `npx tsc --noEmit` and `npm run lint` pass; no console errors during the walkthrough.

Commit with a message describing the phase.
