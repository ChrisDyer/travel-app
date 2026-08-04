# Calendar Sync — Progress

> **Status: Superseded 2026-08-03 — never started. Replaced by `docs/calendar-feed/`.**
> Append one report per completed phase (format below). Never rewrite an earlier
> phase report; later corrections are new dated entries.

## Superseded — 2026-08-03

This program specified **Google OAuth push sync**: authenticate to Chris's Google account, create
a secondary "Travel" calendar, and write/update/delete events into it via the Calendar API, with
a token table, an event-link table, sha1 fingerprints and a reconciler.

It was replaced, before any phase started, by `docs/calendar-feed/` — a **subscribe-able ICS
feed**. Chris and Kate both wanted trips on their own Google Calendars, and a feed delivers that
with far less machinery: one URL each person adds via "From URL", server-side filters, no OAuth,
no token refresh, no drift reconciliation, and no delete tracking. Push sync pushes into *one*
Google account and gives the other person nothing to subscribe to.

**This folder is kept, not deleted, for one reason:** `ARCHITECTURE.md` lines 185-205 remain the
best written record of how the six item tables map onto calendar events, and the feed's
normalizer implements substantially the same rules. Cite it; do not follow its schema.

Two things in it are stale and must not be copied:
- Its migration is numbered `004_google_calendar`, which collides with the real
  `004_hike_event_fields`. The feed program uses `009` and `010`.
- Its `calendar_item_overrides` table (per-item include/exclude, per calendar) was deliberately
  **not** carried forward. The feed uses one global `hide_from_calendar` column instead.

The trade-off accepted in making the switch: a subscribed feed is read-only on the subscriber's
side and Google polls it on its own schedule (commonly 8–24h), where push sync would update
within seconds and produce normal editable calendar entries. If sub-minute freshness is ever
required, this design is the starting point to revive.

Report format (copy the skeleton):

```markdown
## Phase N — <title> — YYYY-MM-DD

**Status:** complete | complete-with-deviations | blocked
**What was built/done:** …
**Deviations from spec (and why):** …
**Known gaps / follow-ups:** …
**Verification evidence:** …
```
