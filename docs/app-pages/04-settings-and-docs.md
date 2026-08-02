# Phase 4 — Settings page and documentation

**Repo:** travel-app. **Read `00-overview.md` first.**

Adds `/settings` — a home for the app's loose ends — and closes the program's documentation
obligations. **No schema.** One new route: `DELETE /api/gmail/token`.

Settings is a **status and connection page, not a preferences store.** Nothing on it may write
a column that no consumer reads. That rules out the `digest_*` columns; see §2.

---

## 1. The page and its nav row

- `src/app/settings/page.tsx` — server component in `<TravelShell title="Settings" …>`, with
  small client islands for the two actions. `slate-*` palette.
- **Add the `settings` nav row** to `TravelShell`'s footer region — the one Phase 1
  deliberately left empty — with `Settings2`, href `/settings`. Add its assertion to
  `src/appShell/destinations.test.mjs` and add `settings/page.tsx` to the "interactive Travel
  routes use the shared shell" loop. Do the same for the mobile drawer if it renders the
  footer separately.
- Four sections, each a plain card: Gmail, Access, Integrations, Data.

## 2. Gmail

The only OAuth flow in the app, and today its **only entry point is inside `TripAssistant`**,
on a trip detail page, behind the Email tab. If the token expires there is no way to see that
without opening a trip.

Read state server-side from `gmail_tokens` for `getServerUserId()`:

| State | Condition | Shows |
|---|---|---|
| Not connected | no row | "Connect Gmail" button |
| Connected | row, `expires_at` in the future | Connected, the granted `scope`, when it was connected (`created_at`), and Disconnect |
| Expired | row, `expires_at` in the past | Same, flagged — note whether a `refresh_token` is stored, since that determines whether it self-heals |

- **Connect** links to `apiUrl('/api/gmail/auth?returnTo=/settings')` — the same pattern as
  `src/components/itinerary/TripAssistant.tsx:311`. The callback sanitizes `returnTo` to a
  same-site path, so `/settings` is valid; confirm rather than assume.
- The callback redirects back with `?gmailError=<reason>` on failure
  (`state_mismatch`, `no_code`, `token_exchange_failed`). **Read that param and show the
  error** — right now nothing does, so a failed connect looks like nothing happened.
- **Never render `access_token` or `refresh_token`.** Not truncated, not masked. The page
  shows booleans and dates.
- Say plainly which label is scanned: **"Trip Bookings"**. That string is currently only in
  `assistant/suggest/route.ts` and is otherwise folklore.

### `DELETE /api/gmail/token`

New route, `src/app/api/gmail/token/route.ts`. Does not exist today — there is currently no
way to disconnect Gmail short of editing the database.

- `DELETE FROM gmail_tokens WHERE user_id = ?` with `getUserId(request)`. `204`.
- Wrap in `withErrorHandling`.
- Deleting a row that is not there is a `204`, not a 404. Disconnecting twice is not an error.
- The server-side read-only 403 is **automatic** — `src/proxy.ts` gates every unsafe method
  under `/api`. Verify it returns `403 {"error":"read_only"}`; do not re-implement the check.
- Local revocation only. Do **not** call Google's revoke endpoint — that would silently affect
  other grants and is not what "disconnect this app" should mean here.

### `digest_enabled` — explicitly not on this page

`trips.digest_enabled` / `digest_day_of_week` exist and `TripEditForm` already edits them, but
**nothing sends digests** — grep confirms zero consumers. A "Weekly digest" control here would
look like a working feature. Leave it out. Mention it in the Phase 4 report as a known gap
instead.

## 3. Access

From `getAccessInfo()` in `src/lib/auth.ts`:

- The Cloudflare Access email for this session.
- Whether this session is **admin or read-only**, and one line explaining the rule: writes are
  gated by `ADMIN_EMAILS`; unset or empty means everyone is an admin (fail-open).

This is the only place in the app that tells you why write buttons are missing. In local dev
with no Access header the email will be absent — render that honestly ("not signed in via
Cloudflare Access") rather than blank.

## 4. Integrations

Diagnostic rows, all read-only. **Booleans and names only — never a key value, not even
partially masked.**

| Row | Check |
|---|---|
| Google Maps | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` set? Used by the trip map, the Map page, and Places autocomplete |
| Claude | `ANTHROPIC_API_KEY` set? Used by the trip assistant and packing suggestions |
| Gmail OAuth | `GOOGLE_GMAIL_CLIENT_ID` / `_SECRET` set? |
| Weather & geocoding | Open-Meteo, no key required |
| Currency rates | open.er-api.com, no key required |

`NEXT_PUBLIC_*` is readable client-side; the rest must be checked **in the server component**
and passed down as booleans.

## 5. Data

- Trip count, and counts for events/flights/hotels — a cheap sanity check that the right
  database is mounted (the `DB_PATH` trap is documented in `RUNBOOK.md`).
- Per-trip `.ics` download links reusing `GET /api/trips/{id}/export`. This exporter is already
  built and currently has no discoverable entry point either.
- No import, no delete-all, no backup button. Backups are a cron on the VPS
  (`RUNBOOK.md`), not an app feature.

## 6. Documentation

**`travel-app/CLAUDE.md`** — new "App-level pages" section covering:

- The route map after this program: `/` (Overview), `/trips`, `/trips/new`, `/trips/{id}`,
  `/trips/{id}/print`, `/map`, `/settings`.
- Nav active state comes from `usePathname()` via `matchNav()` in `TravelShell`; there is no
  `activeLocalNav` prop, and pages pass nothing.
- **The `trips` geocode-cache rule**, worded like the existing "Trip legs" section: any write
  that changes `trips.destination` must clear `latitude`, `longitude` and `resolved_name` in
  the same write; `GET /api/map` is the only code that fills them; cache writes never bump
  `trips.updated_at`.
- That `src/lib/agenda.ts` is the single cross-trip aggregation used by both the Overview page
  and `/api/summary`, and that `/api/summary`'s JSON shape is consumed by the homepage app and
  is frozen.
- That `src/lib/geocode.ts` is the one geocoder, shared by the weather route and `/api/map`.
- Add a line to the existing **"Downstream MCP write registry"** section noting the three
  derived columns are deliberately excluded from `TRIP_FIELDS`.

**`travel-app/TESTING.md`** — new sections, in the style of the existing ones:

- *Overview page* — hero for the soonest trip, in-progress "Day N of M", weather matches the
  trip page, each action row links to the right trip, walk-up activities and hikes absent from
  Needs booking, empty state, read-only.
- *Map* — pins for every trip, grey/blue by timing, InfoWindow links, side list sync,
  All/Upcoming/Past, **destination change moves the pin**, no key → panel plus list.
- *Settings* — connect/disconnect round-trip, `?gmailError=` surfaced, no token value ever
  rendered, read-only hides the buttons and `DELETE` returns 403.
- *Navigation* — desktop highlighting per route, mobile drawer opens/navigates/closes, drawer
  above the trip page's sticky tab strip, print view has no chrome.

**Operational docs.** This program changes no port, nginx vhost, PM2 process, `$PROFILE` alias,
auth mechanism or backup cron, so the root `README.md` needs no edit. Run
`node tools/ops-check.mjs` from `C:\Users\chris\OneDrive\Apps\zo-bot.com` to confirm that is
still true.

## 7. Deploy

Standard: commit and push travel-app, then run `Deploy-Travel` from PowerShell. If Phase 3's
mcp-server comment has not been committed yet, push that repo too — it is a comment only and
needs no deploy.

Migration `008_trip_geocode` runs automatically at import time on the VPS. After deploying,
hit `/travel/map` in production once so the cache fills, and confirm the production `DB_PATH`
database got the three columns (`RUNBOOK.md` has the standalone-build `DB_PATH` quirk).

## 8. What this phase must NOT touch

- Any schema. Phase 3 was the last migration.
- `src/components/itinerary/TripAssistant.tsx` — its inline Connect prompt stays; Settings is
  an additional entry point, not a replacement.
- The `gmail/auth` and `gmail/callback` routes. Only the new `token` route is added.
- `src/lib/agenda.ts`, `/api/map`, `TripsMap.tsx` — finished in Phases 2 and 3.
- Anything that would put a `digest_*` control on screen (§2).

---

## Verification

Back up first — see the WAL-safe backup command in `00-overview.md`; **not** `cp`.
Disconnecting Gmail deletes a real token row — you
will need to reconnect, so be ready to complete the OAuth flow.

1. `/travel/settings` renders all four sections. The nav row is highlighted, and it is
   highlighted on **no other** route.
2. Gmail shows **Connected** — the local DB has one `gmail_tokens` row. Scope and connection
   date are shown.
3. **View source / inspect the DOM: no access token or refresh token appears anywhere.**
4. Click Disconnect → `204`, the row is gone (`SELECT COUNT(*) FROM gmail_tokens`), the page
   shows Not connected. Click Disconnect again in a second tab → still `204`, no 500.
5. Click Connect → Google flow → returns to `/travel/settings` showing Connected. Confirm the
   `returnTo` sanitizer accepted `/settings` rather than dropping you on `/trips`.
6. Visit `/travel/settings?gmailError=state_mismatch` directly → the error is displayed.
7. Open a trip's Assistant → Email tab and confirm it still works after the reconnect.
8. Integrations rows match reality: unset `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, reload, the row
   flips to not-configured, restore it.
9. Access section shows the right email and role. Set `ADMIN_EMAILS` to another address,
   reload → it says read-only, **and Connect/Disconnect are hidden**.
10. Still read-only: `curl -X DELETE localhost:3000/travel/api/gmail/token` →
    `403 {"error":"read_only"}` and the token row survives. Restore `ADMIN_EMAILS`.
11. An `.ics` link downloads a file that opens in a calendar app.
12. 375px: all four cards readable, no horizontal scroll; the drawer reaches Settings.
13. `node --test src/appShell/destinations.test.mjs` passes with the `settings` assertions.
14. `npm run build` and `npm run lint` clean.
15. `node tools/ops-check.mjs` and `node tools/project-status.mjs` from the repo root both pass.
16. Deploy, then re-run steps 1, 2 and 11 against production, and `/travel/map` once to fill
    the production geocode cache.
17. **Whole-program acceptance test** from `00-overview.md`: on a phone, open the drawer and
    reach every page; `/` shows the next trip with a live action list; `/map` plots every trip
    from cache; `/settings` shows Gmail connected. Change a trip's destination, reload `/map` —
    **the pin moves.**

**Done when:** step 17 passes against production.

Then append a Phase 4 report to `PROGRESS.md`, update its Status blockquote to say the program
is complete and deployed, and run `node tools/project-status.mjs` from
`C:\Users\chris\OneDrive\Apps\zo-bot.com`.
