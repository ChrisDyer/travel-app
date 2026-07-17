# Phase 5 — Hardening, edge cases, docs

## Goal

Every edge-case behavior from ARCHITECTURE.md verified end-to-end and fixed where broken; a user-facing doc written; full regression pass. This phase is mostly **verification and fixing**, not new features.

## Prerequisites

- **Phases 1–4 complete.**
- Read `docs/calendar-sync/ARCHITECTURE.md` — the edge-case table is the checklist for this phase.
- Read `AGENTS.md` (repo root).

## Work items

### 1. Edge-case verification sweep (fix anything that fails)

Work through each scenario; where behavior deviates from ARCHITECTURE.md, fix the code.

1. **Reauth flow end-to-end**: revoke the app's access at https://myaccount.google.com/permissions (remove the app). In the app, edit a synced item → the mutation succeeds, `calendar_sync_error` becomes the reconnect message, UI shows Reconnect. Reconnect via the UI → `needs_reauth` cleared → "Sync now" heals everything (events consistent with app state).
2. **Orphan-link sweep**: with sync working, break connectivity to Google (e.g. temporarily set `calendar_tokens.access_token` to garbage AND `expires_at` far future so refresh isn't attempted — or firewall it), delete a synced trip → app delete succeeds, link rows remain. Restore tokens; run "Sync now" on any trip (or reconnect) → orphaned Google events deleted, link rows gone.
3. **Travel calendar deleted by user**: delete the "Travel" calendar at calendar.google.com. Trigger a sync (edit an item) → app recreates the calendar and repopulates the synced events; `calendar_tokens.google_calendar_id` updated; no crash, no stuck error.
4. **Duplicate trip**: duplicate a synced trip → the copy has `calendar_sync_enabled = 0`, no links, no overrides, `timezone` copied; the original's calendar events untouched.
5. **Round-trip integrity**: exclude-override a round-trip flight → both legs disappear; re-include → both return; change the flight to one-way → the return-leg event is deleted on sync.
6. **Manual Google-side edits**: move a synced event in Google Calendar → app doesn't care; edit that item in the app → event snaps back to app truth (fingerprint changed → patch).
7. **Trip with no destination / missing optional fields**: trip-span summary renders sensibly; items with null locations/descriptions produce valid payloads.
8. **DST boundary sanity**: a timed event on a date crossing a DST change in the trip timezone lands at the correct wall-clock time (Google handles this given `timeZone`; just verify one case, e.g. `America/New_York` early November).
9. **Rapid successive mutations**: quickly PATCH several items (or run the assistant bulk-apply) → no interleaving corruption (mutex works), final Google state consistent, no duplicate events (`UNIQUE(item_type, item_id)` on links would surface violations as errors — there must be none).
10. **Disconnect**: full flow per spec — tokens + links deleted, toggles off, Google events remain, dialog copy accurate.

### 2. User-facing documentation — `docs/google-calendar.md`

Write a concise doc covering:
- What syncs: trip span + confirmed bookings; Always/Never per-item overrides; the dedicated "Travel" calendar.
- Setup: link to the manual Google Cloud steps (summarize from `docs/calendar-sync/PROMPT.md` § Manual setup), then Connect in the app.
- Timezones: home timezone by default; per-trip timezone field for destination-local times.
- **Caveats (important)**: the app owns events on the Travel calendar — manual edits there can be overwritten; deleting/renaming the Travel calendar causes the app to recreate it and re-add events; disconnecting leaves existing events in place; changes made while Google is unreachable are applied on the next change or "Sync calendar now".

### 3. Housekeeping

- Ensure `.env.example` needs no changes (it shouldn't — no new vars); if anything WAS added during implementation, document it there.
- Grep for leftover TODO/Phase-N comments in `src/lib/calendar/` and the calendar routes; resolve or remove.
- Confirm `docs/calendar-sync/` phase files' instructions match what was actually built; where implementation deviated deliberately, add a short "as-built" note at the bottom of the affected phase file.

### 4. Final regression

- Re-run the full Phase 3 verification checklist (items 1–14) — it should all still pass with the Phase 4 UI in place (drive via UI where possible instead of curl).
- Re-run the Phase 4 walkthrough (items 1–9).
- `npx tsc --noEmit` and `npm run lint` pass.
- `npm run build` succeeds.

Commit with a message describing the phase.
