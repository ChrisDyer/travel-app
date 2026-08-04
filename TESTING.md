# Testing Plan

Manual test cases for the travel itinerary app before going live.

---

## Authentication & Multi-User Isolation

- [ ] Unauthenticated request to `/trips` (no Cloudflare Access header) → should be blocked in production
- [ ] `user_id = 'local'` fallback only active in local dev — confirm `getUserId()` returns the CF header value in production
- [ ] User A cannot view User B's trip via direct URL `/trips/{other-user-trip-id}` → 404
- [ ] PATCH/DELETE `/api/trips/{tripId}` with a `tripId` owned by another user → 404

---

## Trip Lifecycle

- [ ] Create trip: valid dates → correct number of days created (`endDate - startDate + 1`)
- [ ] Create trip: end date before start date → inline error shown, form does not submit
- [ ] Create trip: same start and end date → creates 1 day
- [ ] Create trip: 30-day trip → all 30 days visible in itinerary
- [ ] Edit trip: extend end date → new days appear at end, existing events/bookings intact
- [ ] Edit trip: shorten end date → confirmation shown; removed days deleted after confirm
- [ ] Edit trip: change destination → reflected in header immediately after save
- [ ] Delete trip → cascade deletes days, events, flights, hotels, parking, rental cars, packing items
- [ ] Duplicate trip name → allowed (no unique constraint on title)
- [ ] Trip name with apostrophes, quotes, emoji → saves and displays correctly
- [ ] Trip name 200+ characters → doesn't break page layout

---

## Day Titles

- [ ] Click day header → "+ Add day title" placeholder appears inline
- [ ] Type a title and press Enter → saved, shown in header
- [ ] Press Escape while editing → reverts to previous title
- [ ] Click away (blur) → saves title
- [ ] Clear an existing title and save → title removed (shows placeholder)
- [ ] Title persists after page refresh

---

## Events

- [ ] Add event with only title (all other fields blank) → saves without error
- [ ] Add event with all fields populated → saves and displays correctly
- [ ] Edit event → all fields editable and saved
- [ ] Move event to different day → appears on new day, removed from old
- [ ] Delete event → inline confirm; clicking Cancel keeps event
- [ ] Add event with a cost → appears in Trip Cost Summary
- [ ] Add event with a past cancellation deadline → saves without error
- [ ] Add 20 events to one day → all display, sorted by start time
- [ ] Events without start time sorted by sortOrder, appear below timed events
- [ ] Submit event form with simulated server error → error message shown, not silent failure

### Plans that need no booking

- [ ] Add activity with "Needs booking? = No" → booking status, confirmation #, booking URL,
      seats, vendor/order # and cancellation fields all disappear from the form
- [ ] Same activity on the itinerary → grey "No booking needed" badge, not red "Needs Booking"
- [ ] Same activity in the detail sheet → no empty confirmation/vendor/cancellation rows
- [ ] Same activity is absent from the "Needs Booking" list above the itinerary
- [ ] Restaurant with "Takes reservations? = No" → grey "No reservations" badge (unchanged)
- [ ] Flip a booked activity to "Needs booking? = No" → status resets to unbooked, confirmation cleared
- [ ] Flip it back to Yes → booking fields reappear, status editable again
- [ ] Print view: walk-up activity shows "No booking needed", hike shows no status at all
- [ ] Trip Assistant proposes a walking tour with takesReservations=false → proposal card shows
      "Needs booking: no" and no status/confirmation fields; applying it saves it unbooked

---

## Flights

- [ ] Add one-way flight → shows on correct departure date in day timeline
- [ ] Add round-trip flight → outbound on departure day, return leg on return day
- [ ] Overnight flight (arrivalDate ≠ departureDate) → arrival shows on arrivalDate
- [ ] Flight with no times → appears at top of that day's timeline
- [ ] Edit flight → changes reflected in KeyBookings sidebar and day timeline
- [ ] Delete flight → inline confirm; Cancel keeps flight
- [ ] Flight cost → reflected in Trip Cost Summary
- [ ] Flight with no airline/flight number → no crash, just blank for those fields

---

## Hotels

- [ ] Add hotel: check-in Jan 3, check-out Jan 5 → check-in shows Jan 3, check-out Jan 5
- [ ] Hotel checkout before checkin → inline validation error, not submitted
- [ ] Hotel with no address → no map pin shown, no error
- [ ] Two overlapping hotels → both display, no error
- [ ] Edit hotel → changes saved
- [ ] Delete hotel → inline confirm; Cancel keeps hotel
- [ ] Hotel cost → reflected in Trip Cost Summary
- [ ] Hotel check-in/out show correct times when times are set

---

## Parking

- [ ] Add parking with start and end date → drop-off shows on start date, pickup on end date
- [ ] Add parking with same start/end date → only drop-off shown (no pickup on same day)
- [ ] Edit parking → changes saved
- [ ] Delete parking → inline confirm; Cancel keeps parking
- [ ] Parking at home airport → does NOT appear on the trip map
- [ ] Parking at destination → DOES appear on the trip map

---

## Rental Cars

- [ ] Add rental car: pickup Jan 3, dropoff Jan 6 → pickup Jan 3, dropoff Jan 6 in timeline
- [ ] Edit rental car → changes saved
- [ ] Delete rental car → inline confirm; Cancel keeps rental car
- [ ] Rental car cost → reflected in Trip Cost Summary

---

## Transit

- [ ] Transit items appear under Key Bookings
- [ ] Transit items appear in Cancellation Deadlines if applicable
- [ ] Transit cost → reflected in Trip Cost Summary

---

## Packing Checklist

- [ ] Add packing item → appears in correct category
- [ ] Check off item → visually marked as packed
- [ ] Uncheck item → reverts to unpacked
- [ ] Delete item → inline confirm; Cancel keeps item
- [ ] Items persist after page refresh

---

## Trip Cost Summary

- [ ] No items with cost → summary section not shown
- [ ] All items in same currency (USD) → single row, correct total
- [ ] Items in mixed currencies (USD + EUR) → separate rows per currency
- [ ] Invalid currency code → falls back gracefully without crash
- [ ] $0 cost → not included in totals (zero-cost items are ignored)
- [ ] Adding a new event with cost → summary updates immediately

---

## Trip Map

- [ ] Hotels with addresses appear as markers
- [ ] Events with locations appear as markers
- [ ] Parking at home airport not shown
- [ ] Rental car pickup locations shown
- [ ] Clicking a day filters map to that day's active locations
- [ ] Clicking the day again deselects (shows all locations)
- [ ] Trip with no locations → map renders without error

---

## Key Bookings Sidebar

- [ ] All flights listed under Flights section
- [ ] All hotels listed under Hotels section
- [ ] Unbooked items show red "Unbooked" badge; confirmed show green
- [ ] Clicking a flight card opens FlightForm for editing
- [ ] Clicking a hotel card opens HotelForm for editing

---

## Cancellation Deadlines

- [ ] Items with future cancellation deadlines listed in order
- [ ] Items with past deadlines not shown (or shown as expired)
- [ ] No items with deadlines → section hidden or shows empty state

---

## Print / PDF

- [ ] Open print page → all events appear in their correct days
- [ ] Open print page → flights appear (departure on dep day, arrival on arr day)
- [ ] Open print page → hotel check-in/out appear on correct days
- [ ] Open print page → parking drop-off/pick-up appear on correct days
- [ ] Open print page → rental car pickup/dropoff appear on correct days
- [ ] Key Bookings summary section appears at top before daily itinerary
- [ ] Packing list appears at end
- [ ] Print to PDF → no interactive elements (buttons, forms) visible
- [ ] Print a trip with 0 events → graceful "No events planned" or empty day
- [ ] Long event titles don't overflow cards

---

## Trip Assistant

- [ ] Brainstorm mode: submit a query → AI responds with proposals
- [ ] Proposals panel: select some proposals, click Apply → events added to itinerary
- [ ] Email mode: Gmail connected + "Trip Bookings" label → proposals from emails shown
- [ ] Email mode: Gmail not connected → "Connect Gmail" prompt shown
- [ ] Email mode: Gmail connected, no "Trip Bookings" label → clear error message
- [ ] Follow-up message → Claude references prior context
- [ ] "New Conversation" button → clears history, mode tabs reappear
- [ ] Streaming response → text appears progressively, not all at once

---

## Trip Brief

- [ ] Trip with no brief → empty state and an "Add brief" button in the overview column
- [ ] Add a short brief → saves, no "Show more" toggle
- [ ] Add a 20+ line brief → collapses to 3 lines, "Show more" expands, "Show less" collapses
- [ ] Hard-reload → content persists
- [ ] Edit then Cancel → change discarded, original text intact
- [ ] Edit then Escape → same
- [ ] Clear the whole brief and Save → empty state, **and Undo is still offered**
- [ ] Undo → previous text returns; Undo again → the newer text comes back (self-inverting)
- [ ] `<script>alert(1)</script>` and emoji render literally and safely
- [ ] Attribution reads "Updated by you · just now" after a site edit
- [ ] Write over MCP (or `curl -H "x-internal-token: $INTERNAL_API_TOKEN"`) → "Updated by Claude"
- [ ] `PUT` with a stale `expectedUpdatedAt` → 409, brief unchanged afterwards
- [ ] `PUT` with `mode: "append"` → appended after a blank line; on an empty brief it replaces
- [ ] `PUT` with 25,000 chars → 400, brief unchanged
- [ ] Narrow to <1024px → brief appears under the Overview tab only, not Itinerary or Bookings
- [ ] Cmd-P and `/trips/{id}/print` → the brief does **not** appear
- [ ] Read-only user → brief text readable, Edit / Add brief / Undo hidden
- [ ] Read-only user, direct `PUT` to the brief route → 403 `read_only`
- [ ] Duplicate a trip → the copy inherits the brief text but has no undo history

## Trip Legs

- [ ] Trip with no legs -> single-destination weather forecast is unchanged
- [ ] Two legs -> weather renders two captioned groups with the correct dates
- [ ] Overlap day -> weather resolves to the later-starting leg, exactly once
- [ ] Gap between legs -> weather falls back to `trips.destination`
- [ ] Edit a leg's place -> forecast changes, not just the caption
- [ ] Add/edit/delete a leg -> weather updates without a page reload and the itinerary does not remount
- [ ] Use my hotels -> proposals are shown, Cancel writes nothing, Apply writes only after confirmation
- [ ] Read-only user -> list is readable and Add/Edit/Delete/Use my hotels controls are hidden
- [ ] Narrow to <1024px -> panel appears only under the Overview tab
- [ ] Cmd-P and `/trips/{id}/print` -> the panel does not appear

---
## Form Error Handling

- [ ] Submit any form with server returning 500 → error message shown above buttons
- [ ] Submit with network disconnected → error message, button re-enables
- [ ] Double-click Save → second click is no-op (button disabled during loading)
- [ ] All form inputs are disabled during save (no accidental edits mid-request)

---

## Edit Trip from Trip Page

- [ ] Edit button visible in trip page header
- [ ] Clicking Edit opens TripEditForm dialog
- [ ] Saving changes → page refreshes with updated title/dates/destination
- [ ] Deleting trip → redirects to `/trips`
- [ ] Cancel → dialog closes, no changes

---

## Edge Cases

- [ ] Trip with 0 days (corrupt state) → graceful empty state, no crash
- [ ] Special characters in all text fields (apostrophes, `<script>`, emoji) → XSS-safe, displayed correctly
- [ ] Cost field with decimal value (e.g., 49.99) → displays correctly
- [ ] Very large cost value (e.g., 99999) → formats without overflow
- [ ] Empty trip (no events, flights, hotels) → all sections render gracefully

---

## Mobile / Responsive

- [ ] Trips list on 375px viewport → cards readable, no overflow
- [ ] Trip detail page on mobile → sidebar collapses below main content
- [ ] Event form on mobile → all fields accessible, no horizontal scroll
- [ ] Key Bookings section readable on mobile
- [ ] Print page → not broken on narrow viewport

---

## Accessibility

- [ ] Tab through event form → all inputs reachable via keyboard
- [ ] Escape key closes all open dialogs
- [ ] Delete confirmation inline: focus stays in the form area
- [ ] Status badges (confirmed green, unbooked red) → sufficient color contrast (WCAG AA)
- [ ] All buttons have visible focus rings

---

## Performance

- [ ] Trip with 10 days, 5+ items per day → page load under 2 seconds
- [ ] Large packing list (50+ items) → no perceptible lag when checking/unchecking
- [ ] Trip map with 20+ markers → renders without timeout

## App-Level Overview

- [ ] `/travel/` renders Overview without a redirect and highlights Overview in nav.
- [ ] Hero shows the soonest trip whose `end_date >= today`, with cover fallback and timing from `tripTiming()`.
- [ ] If the hero trip is in progress, today's events appear in itinerary order.
- [ ] Weather matches `/travel/trips/{id}` for the same trip.
- [ ] Cancellation, Needs booking, and Nothing planned rows link to the correct trips.
- [ ] Walk-up activities and hikes are absent from Needs booking.
- [ ] No upcoming trips -> empty state; read-only hides Plan a trip.

## App-Level Map

- [ ] `/travel/map` plots cached trip pins and cached leg stops; ended trips are grey and current/upcoming trips are blue.
- [ ] InfoWindow links open the right trip, and side-list clicks pan/open the matching pin.
- [ ] All / Upcoming / Past filters apply to both pins and list.
- [ ] Change a trip destination -> geocode cache clears; reload Map -> pin moves.
- [ ] Reopen Map with cached coordinates -> no repeat geocoding for those trips.
- [ ] No `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` -> unavailable panel appears and side list still renders.

## App-Level Settings

- [ ] `/travel/settings` renders Gmail, Access, Integrations, and Data cards and highlights Settings only there.
- [ ] Gmail connected/expired/not-connected states show scope, dates, refresh-token boolean, and label `Trip Bookings`.
- [ ] DOM/source never includes access_token or refresh_token values.
- [ ] Connect returns to `/travel/settings`; `?gmailError=` displays a visible error.
- [ ] Disconnect returns 204 and is idempotent; read-only hides buttons and direct DELETE returns 403 `read_only`.
- [ ] Integration rows show configured/missing booleans without key values.
- [ ] Per-trip `.ics` export links download usable calendar files.

## Calendar Feed

- [ ] A good token returns 200 `text/calendar`; the `.ics` suffix is optional and both forms give the same body.
- [ ] A bad, malformed, or rotated-away token returns a bare 404 `text/plain` — never 403, and never a different body for "wrong token" vs "no such feed".
- [ ] `POST`/`PUT`/`PATCH`/`DELETE` on the feed URL return 405.
- [ ] With no Cloudflare Access header the feed is served, while `/travel/settings` still returns 403 (dev) / 302 to Access (production).
- [ ] A read-only user sees the Calendar feed card and its count, but view-source contains no token and no feed URL, and no Copy/Save/Rotate controls.
- [ ] Two fetches with no edits in between are byte-identical, and every UID is unchanged across them.
- [ ] Booking details are absent by default: no `DESCRIPTION`, no `Conf:`, no card fragments — while `SUMMARY` and `LOCATION` remain. Turning "Publish confirmation numbers and notes" on restores them.
- [ ] The per-trip `.ics` download still includes descriptions and confirmation numbers (it is authenticated and local).
- [ ] An item with "Hide from all calendar feeds" ticked is absent from both the feed and the per-trip download; unticking restores it. Hiding a whole trip removes its span and everything beneath it.
- [ ] Unchecking a category and saving removes those events from an already-subscribed calendar within Google's poll window (up to 24h).
- [ ] Emptying "What to include" leaves exactly one placeholder VEVENT, not an empty calendar, and still validates.
- [ ] Malformed filter payloads never 500 — the route answers 200 with defaults applied, and genuinely invalid JSON gives 400.
- [ ] Rotating the token 404s the old URL, 200s the new one, and leaves the filters intact.
- [ ] Floating times render at the same wall-clock in a calendar set to a different timezone (a 7pm dinner shows at 7pm).

## App-Level Navigation

- [ ] Desktop nav highlights `/`, `/trips`, `/trips/new`, `/trips/{id}`, `/map`, and `/settings` correctly.
- [ ] On 375px, the mobile drawer opens, navigates, closes after link click, and sits above trip-page sticky tabs.
- [ ] Escape and backdrop click close the drawer and focus returns to the trigger.
- [ ] Read-only users do not see New trip in desktop nav or drawer.
- [ ] `/travel/trips/{id}/print` has no shell, app switcher, or drawer trigger.
