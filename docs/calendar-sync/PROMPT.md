# Google Calendar Sync — Implementation Prompts & Manual Setup

How to run this project: complete the **Manual setup** below first, then run the phase agents in order. Each prompt is self-contained — paste it to a fresh agent session.

## Phase order & dependencies

```
Manual setup (you) ──► Phase 1 ──┐
                                 ├──► Phase 3 ──► Phase 4 ──► Phase 5
                       Phase 2 ──┘
```

- **Phase 2 does not depend on Phase 1** — you may run them in parallel (separate sessions/worktrees) if you want; otherwise just run 1 then 2.
- Phases 3, 4, 5 are strictly sequential.
- After Phase 1 finishes, **you** must click through the connect flow once (its verification steps walk through it) — Phases 3–5 need a live Google connection.
- Review + commit between phases. Each phase's instructions end with verification steps the agent must actually run — hold them to it.

---

## Manual setup (do this yourself, before Phase 1's verification)

All in the **same Google Cloud project** as the existing Gmail integration (the one behind `GOOGLE_GMAIL_CLIENT_ID`):

1. Go to https://console.cloud.google.com → select that project.
2. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
3. **APIs & Services → Credentials** → open the existing OAuth 2.0 Client ID → under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/calendar/callback` (dev)
   - `{your production NEXT_PUBLIC_APP_URL}/api/calendar/callback` (if deployed)
4. **APIs & Services → OAuth consent screen** → if the app is in *Testing* mode with you as a test user (likely), no verification is needed; optionally add the scope `https://www.googleapis.com/auth/calendar` to the scopes list (informational in testing mode).
5. **Env vars: nothing to add.** The integration reuses `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, and `NEXT_PUBLIC_APP_URL`.
6. **After Phase 1 is implemented**: visit `/api/calendar/auth?returnTo=/trips` (or use the Connect button once Phase 4 lands) and grant consent. This is a separate consent from Gmail — your Gmail connection is untouched.

Things to know once it's running:
- Events go to a dedicated **"Travel"** calendar the app creates. Don't rename or delete it (the app will recreate it and re-add events).
- The app owns the events it creates there — edits you make to them directly in Google Calendar may be overwritten.
- Disconnecting leaves existing events on the calendar (delete the Travel calendar in Google to remove them wholesale).

---

## Prompt — Phase 1 (Foundation)

```
Implement Phase 1 of the Google Calendar sync integration.

Read docs/calendar-sync/ARCHITECTURE.md fully, then follow docs/calendar-sync/PHASE-1.md exactly: the 004_google_calendar migration, Trip type additions, src/lib/calendar/google.ts (token refresh, ensureTravelCalendar, event CRUD), and the four routes under src/app/api/calendar/ (auth, callback, status, disconnect), cloning the existing Gmail OAuth routes as templates.

I have already done the Google Cloud console setup (Calendar API enabled, redirect URI added). Definition of done: every verification step in PHASE-1.md passes, including the live OAuth consent flow and the "Travel" calendar appearing in my Google account — pause and ask me to click through the consent screen when you reach that step. Also run npx tsc --noEmit and npm run lint. Commit when done.
```

## Prompt — Phase 2 (Mapping layer)

```
Implement Phase 2 of the Google Calendar sync integration.

Read docs/calendar-sync/ARCHITECTURE.md fully, then follow docs/calendar-sync/PHASE-2.md exactly: create the pure mapping module src/lib/calendar/mapping.ts (buildTripCalendarItems, toGoogleEvent, fingerprintEvent, isItemDesired, defaultTimezone) by extracting and extending the normalization logic in src/app/api/trips/[tripId]/export/route.ts, then refactor that export route to consume it.

This phase makes no Google API calls and must not import from src/lib/calendar/google.ts. Definition of done: every verification step in PHASE-2.md passes, including the before/after .ics diff (only the documented differences: return flight leg, trip-span event, hotel all-day span) and the scratch-script sanity checks on toGoogleEvent/fingerprintEvent. Also run npx tsc --noEmit and npm run lint. Commit when done.
```

## Prompt — Phase 3 (Sync engine + wiring)

```
Implement Phase 3 of the Google Calendar sync integration. Phases 1 and 2 are already merged and my Google account is connected (calendar_tokens row exists).

Read docs/calendar-sync/ARCHITECTURE.md fully, then follow docs/calendar-sync/PHASE-3.md exactly: the reconciler src/lib/calendar/sync.ts (syncTripCalendar with per-trip mutex, cleanupOrphanLinks), the new routes /api/trips/[tripId]/calendar/sync and /api/trips/[tripId]/calendar/overrides, and wiring await syncTripCalendar(...) into every mutation handler listed in the phase file (trips PATCH/DELETE, all 12 entity routes, assistant apply), plus the trip PATCH colMap additions (calendarSyncEnabled, timezone) and the duplicate-route timezone column.

Definition of done: the full 15-step curl-driven verification checklist in PHASE-3.md passes against my real Google "Travel" calendar — run it for real and report each step's result; ask me to check calendar.google.com where the checklist requires visual confirmation. Also run npx tsc --noEmit and npm run lint. Commit when done.
```

## Prompt — Phase 4 (UI)

```
Implement Phase 4 of the Google Calendar sync integration. Phases 1–3 are merged and working; my Google account is connected.

Read docs/calendar-sync/ARCHITECTURE.md fully, then follow docs/calendar-sync/PHASE-4.md exactly: connection status + overrides plumbing in src/app/trips/[tripId]/page.tsx, the sync toggle + timezone select + connect/reconnect/disconnect states in TripEditForm.tsx, "Sync calendar now" in TripMoreMenu.tsx, the per-item On-calendar chip + Auto/Always/Never control in BookingDetailSheet.tsx (map rentalCar → car), and the sync status/error chip with retry.

Match the app's existing UI idioms (digestEnabled checkbox pattern, toast(), loading-guard pattern, existing Select component). Definition of done: the 9-step in-browser walkthrough in PHASE-4.md passes — drive it in a real browser against my Google calendar and report results. Also run npx tsc --noEmit and npm run lint. Commit when done.
```

## Prompt — Phase 5 (Hardening + docs)

```
Implement Phase 5 of the Google Calendar sync integration. Phases 1–4 are merged and working.

Read docs/calendar-sync/ARCHITECTURE.md fully, then follow docs/calendar-sync/PHASE-5.md exactly: work through the 10-scenario edge-case sweep (fixing any deviations from ARCHITECTURE.md), write the user-facing docs/google-calendar.md, do the housekeeping checks, and run the final regression (Phase 3 + Phase 4 checklists, tsc, lint, npm run build).

Several scenarios need my involvement (revoking access at myaccount.google.com, deleting the Travel calendar, checking Google Calendar visually) — pause and ask me at those steps rather than skipping them. Report a pass/fail per scenario with what was fixed. Commit when done.
```
