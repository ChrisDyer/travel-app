# Phase 3 — Settings UI

**Read `00-overview.md` first**, then `PROGRESS.md` for what Phases 1-2 delivered.

Phase 3 makes the feed reachable by a human: a "Calendar feed" card on the Settings page with
the URL, the filter controls, a live count, and token rotation — plus the one place in the
itinerary where an item can be hidden. After this phase the feature is complete locally; Phase 4
takes it to production.

---

## 1. `src/app/settings/page.tsx`

The page is an async server component. Add, alongside the existing `gmail` and `counts` queries:

```ts
const feed     = ensureFeed(userId);
const filters  = parseFeedFilters(feed.filters);
const items    = buildCalendarItems({ userId });
const included = filterItems(items, filters, localToday());
```

**Build the feed URL server-side from the forwarded headers:**

```ts
// nginx sets Host and X-Forwarded-Proto. This is reliable where request.url is not —
// behind nginx that resolves to the internal bind address. Do NOT use NEXT_PUBLIC_APP_URL:
// it is pinned to the legacy travel.zo-bot.com, which 301s cross-hostname into a DIFFERENT
// Cloudflare Access application, adding a redirect hop and a second bypass to maintain.
const hdrs = await headers();
const proto = hdrs.get('x-forwarded-proto') ?? 'http';
const origin = `${proto}://${hdrs.get('host') ?? 'localhost:3000'}`;
const feedUrl = `${origin}${apiUrl(`/api/calendar/feed/${feed.token}.ics`)}`;
```

Server-side construction also avoids a hydration flash of the wrong origin.

**Add an optional `className` to the local `Card` component** (currently at line 21, it takes
none) so the new card can span `lg:col-span-2`.

The card, using the existing `Card` / `StatusPill` / `fmtDate` helpers and the `slate-*` palette
the rest of the page uses:

```tsx
<Card title="Calendar feed" icon={<CalendarDays className="h-5 w-5 text-blue-600" aria-hidden="true" />} className="lg:col-span-2">
  <StatusPill ok={included.length > 0} label={`${included.length} of ${items.length} items included`} />
  {/* last fetched, via fmtDate(feed.lastFetchedAt) — or "never fetched yet" */}
  {!access.readOnly && <CalendarFeedActions feedUrl={feedUrl} name={feed.name} filters={filters} />}
</Card>
```

### The token must be gated server-side

`GmailActions` returns `null` when read-only, but that only hides **controls** — the props are
still in the HTML. The feed URL is a **bearer credential**, so a read-only user must not receive
it in the markup at all. Pass `feedUrl` only inside the `!access.readOnly` branch, as above.

**Consequence to state in the phase report:** Kate is a read-only user (`ADMIN_EMAILS` grants
Chris write access only — root `README.md:6-10`), so she cannot copy the feed URL out of Settings
herself. Chris sends it to her once. That is intended, not a bug: read-only users do not get to
read credentials. Read-only users still see the card, the included/total count, and the
last-fetched time.

---

## 2. `src/components/settings/CalendarFeedActions.tsx`

`'use client'`. Model it on `src/components/settings/GmailActions.tsx` — same import style, same
toast usage, same `router.refresh()` pattern. Start with:

```tsx
const readOnly = useReadOnly();
if (readOnly) return null;   // belt and braces on top of the server gate
```

### The URL block

Read-only `<Input>` showing `feedUrl` plus a **Copy** `<Button>` calling
`navigator.clipboard.writeText(feedUrl)` → `toast('Feed URL copied')`. `navigator.clipboard`
needs a secure context — fine on HTTPS and on `localhost`, but include a `select()` +
`document.execCommand('copy')` fallback so it degrades rather than silently doing nothing.

Three pieces of copy that are **not optional** — each documents a real behaviour that will
otherwise be reported as a bug:

- **Security:** *"Anyone with this URL can see every trip in the feed. Treat it like a password."*
- **Shared:** *"One feed, shared. Everyone subscribed sees the same view."*
- **Latency:** *"Google refreshes subscribed calendars on its own schedule — often 8 to 24 hours.
  Each subscriber refreshes independently, so two calendars can disagree for a while. There is no
  way to force it except removing and re-adding the calendar."*

Also note that renaming the feed does **not** rename an existing subscriber's calendar —
`X-WR-CALNAME` is read only at subscribe time.

### The filter controls

Four `<fieldset>` groups with `<legend>`: **Trips** (`tripStatuses`), **What to include**
(`kinds`), **Day plans** (`eventCategories` + the `includeNoBookingNeeded` toggle), **Bookings**
(`bookingStatuses`), plus two number inputs for the window with an explicit "unlimited" state for
`null`.

The repo has **no Checkbox primitive**. Use the raw markup already in `TripEditForm.tsx:192-201`:

```tsx
<input type="checkbox" className="h-4 w-4 rounded border-stone-300 accent-blue-600" />
```

— but swap `stone-` for `slate-` to match the Settings page.

Local `useState` for the working set; one explicit **Save filters** button →
`fetch(apiUrl('/api/calendar/config'), { method: 'PUT' })` → toast → `router.refresh()`. **Not**
save-on-change: each save is a destructive act on both subscribers' calendars and deserves an
explicit confirmation gesture.

**Warning beside Save, required:** *"Turning something off removes those events from every
subscribed calendar. Google replaces the whole calendar each time it refreshes."*

### Live count

Debounce ~300ms on any checkbox change → `POST apiUrl('/api/calendar/config/preview')` with the
**unsaved** working set → render "N items · 3 trips · 12 events · 4 flights…" from `byKind`. This
is a preview only; the authoritative count comes from the server after Save + `router.refresh()`.
Ignore in-flight responses that arrive out of order.

### Rotate

An **inline** confirm (the repo's pattern), not `window.confirm` — a browser modal blocks
everything and is inconsistent with the rest of the app.

Copy: *"Rotating breaks every current subscription. Everyone subscribed must delete the calendar
in Google and add the new URL. Their existing events stop updating but are not removed."*

→ `POST apiUrl('/api/calendar/config/rotate')` → toast → `router.refresh()`.

---

## 3. The "hide from calendar" control

The `hide_from_calendar` column shipped in Phase 1 but is unreachable from the UI. Add a checkbox
to `src/components/itinerary/BookingDetailSheet.tsx`, wired to the existing PATCH for that item
kind.

**Label it so the global scope is obvious**: *"Hide from all calendar feeds"*, with helper text
*"Keeps this off every subscribed calendar. It stays in the itinerary."* It is not a per-person
control — it hides the item from Chris too. Someone will otherwise read it as "hide this from
Kate".

Follow the read-only convention used by `TripAssistant.tsx:226` / `AddPlanMenu.tsx:32` — hide the
control for read-only users. Do **not** follow `DaySection`, which leaves inline editors visible
and lets the write 403; that is a known gap, not a pattern to copy.

Leave the trip-level `trips.hide_from_calendar` API-only for now — the trip edit form is not
part of this phase.

---

## Verification

1. The card renders with a correct "N of M items included" count and the last-fetched line.
2. Copy button copies the full URL; pasting it into a browser returns the calendar body.
3. Uncheck a category → the live count updates within a second **without** saving; the server
   count is unchanged until Save.
4. Save → toast → the header count updates via `router.refresh()`; re-fetching the feed URL shows
   those events gone.
5. Reload the page — the saved filters are still checked. (Round-trip through
   `serializeFeedFilters`/`parseFeedFilters` works.)
6. Uncheck **everything** in "What to include" and save → the feed returns only the placeholder
   VEVENT and the count reads `0 of M`. Nothing 500s.
7. Set a past window of 0 days and save → past trips vanish from the feed; set it back to
   unlimited → they return.
8. Rotate → inline confirm appears; confirm → the old URL 404s, the page shows the new URL, and
   it 200s.
9. **Read-only, for real** — `NODE_ENV=production`, `ALLOW_NO_ACCESS_HEADER=1`, `ADMIN_EMAILS`
   set to an address that is not yours, and a `cf-access-authenticated-user-email` header for
   that address:
   - the card renders with the count
   - **view-source contains no token and no feed URL** — grep the raw HTML for the token string
   - no Copy, no filter controls, no Save, no Rotate
   - a direct `PUT /api/calendar/config` returns `403 {"error":"read_only"}`
10. `BookingDetailSheet`: tick "Hide from all calendar feeds" on a hotel → re-fetch the feed →
    that VEVENT is gone. Untick → it returns.
11. The checkbox is absent for a read-only user.
12. Nothing else on the Settings page regressed: Gmail connect/disconnect, the Access card, the
    per-trip `.ics` export links.
13. 375px viewport: the card, fieldsets and URL row all lay out without horizontal scroll.
14. `npm run build` and `npm run lint` clean (11 pre-existing warnings).

**Done when:** all 14 pass — especially **9**, which is the one that proves a credential is not
being handed to a read-only user.

Append a Phase 3 report to `PROGRESS.md`, noting explicitly that Kate cannot self-serve the URL
from Settings, and update the Status blockquote. Then run `node tools/project-status.mjs` from
`C:\Users\chris\OneDrive\Apps\zo-bot.com`.
