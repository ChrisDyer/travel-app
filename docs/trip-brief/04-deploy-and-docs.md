# Phase 4 — Deploy and docs

**Prerequisites: read `00-overview.md` first, then `PROGRESS.md` for what Phases 1-3
delivered.**

Deploy both apps to the VPS, verify the feature end-to-end from claude.ai, and bring the
operational docs back in line with reality. **This phase performs a real production deploy
and runs a migration against the live database — confirm with Chris before starting.**

This is the only phase that touches both repos.

## Deliverables

- travel-app deployed, mcp-server deployed
- End-to-end verification from claude.ai
- `travel-app/CLAUDE.md`, `travel-app/TESTING.md`, `mcp-server/CLAUDE.md` updated
- `node tools/ops-check.mjs` and `node tools/project-status.mjs` run clean
- Phase 4 report appended to `PROGRESS.md`

---

## 1. Before you deploy

**Back up the production database.** The travel-app deploy runs `006_trip_brief` against live
data. Nightly backups exist in `~/travel-app/backups/` (cron 02:10) and on OneDrive (rclone
03:10), but take a fresh one rather than trusting a backup up to 24 hours old:

```
ssh chris@91.99.230.234
cp ~/travel-app/local.db ~/travel-app/backups/pre-trip-brief-$(date +%F).db
```

The path is confirmed against `travel-app/RUNBOOK.md:98` (`DB_PATH=/home/chris/travel-app/local.db`)
and the nightly backup cron at `RUNBOOK.md:319`, which copies the same file. The Next.js
standalone build's `process.chdir` makes `DB_PATH` mandatory, so re-confirm it with
`pm2 env travel-app` if the RUNBOOK and reality ever disagree.

**Confirm `TRAVEL_WRITE=1`** is already set in the VPS `~/mcp-server/.env` from the
write-tools program:

```
ssh chris@91.99.230.234 'grep TRAVEL_WRITE ~/mcp-server/.env'
```

If it is absent, `travel_update_trip_brief` will not register. That is a safe failure, but
know which state you are in before testing.

---

## 2. Deploy order

**travel-app first, then mcp-server.** The column and routes must exist before mcp-server
advertises tools that call them. Deploying in the other order gives a window where
`travel_update_trip_brief` exists and 404s.

```
# commit + push both repos first
Deploy-Travel      # PowerShell $PROFILE function
```

Verify travel-app before touching mcp-server:

- The migration applied — check `schema_migrations` for `006_trip_brief` on the VPS.
- A real trip page loads and the Trip Brief panel appears in the overview column.
- Editing and saving a brief works in production, through Cloudflare Access.
- `pm2 status` shows travel-app healthy; check `pm2 logs` for migration errors.

Then:

```
Deploy-Mcp         # git pull && npm install --omit=dev && pm2 restart mcp-server
```

`Deploy-Mcp` does no build. Watch `pm2 logs mcp-server` on restart — a syntax error in the
`instructions` string or the new tool registrations shows up there immediately.

---

## 3. Production verification

**MCP surface** — `tools/list` against `https://mcp.zo-bot.com/mcp` (probe form in
`mcp-server/DEPLOY.md:131-138`):

1. `full` scope lists both brief tools.
2. **`genealogy` scope still lists exactly 7 tools.** That scope is a family member's access.
   Check it explicitly, every deploy.
3. The `initialize` response carries the `instructions` string.

**The acceptance test** — this is what the program is for. Run it in the real claude.ai app
with the connector, not by curling the endpoint:

4. In a **fresh conversation**: *"For the Japan trip — I want a relaxed pace, no more than one
   big thing a day, no early flights, and a budget around $4k."* Claude should call
   `travel_update_trip_brief` **unprompted**. If it does not, the descriptions or the
   `instructions` string need work — note that in the report rather than papering over it by
   telling Claude what to do.
5. Open the trip page → the brief is there, attributed **Updated by Claude**.
6. Open a **brand new conversation** and ask for a day plan for that trip. It should honour
   every constraint without being told again. This is the whole feature; if it fails, the
   program has not succeeded regardless of what the tests say.
7. Edit the brief on the site, then ask Claude in a new conversation what the requirements
   are → it reflects your edit.
8. Click **Undo** on the site → the previous version returns.

**Regressions**

9. The existing read tools (`get_trips`, `get_trip_details`, the dashboard tools) still work.
10. `get_trip_details` returns the top-level `brief` key.
11. Trip pages without a brief render normally; the print view still omits it.
12. If Chris has a read-only account configured in `ADMIN_EMAILS`, confirm it can read the
    brief but sees no write controls.

Clean up any scratch content created during testing.

---

## 4. Documentation

Not optional, and it happens in **this** session — the root `CLAUDE.md` operational-docs
contract requires docs to describe current reality, updated alongside the change.

**`travel-app/CLAUDE.md`** — add a "Trip brief" section covering:
- the four `planning_notes*` columns and what each holds
- that `planningNotes` is deliberately **absent** from the generic PATCH `colMap`, and why
- that authorship is derived from `x-internal-token` server-side, never the request body
- that undo is a self-inverting swap, one level deep
- a pointer to `docs/trip-brief/` for the full design

**`mcp-server/CLAUDE.md`** — the tool inventory. Note that it currently opens with
"Tools (12, all read-only)", which the write-tools program already invalidated; correct the
count and the "all read-only" claim to match reality *after* this phase, including both brief
tools and which one is gated by `TRAVEL_WRITE`. Document the `instructions` string and what it
tells Claude to do.

**`travel-app/TESTING.md`** — add a `## Trip Brief` checklist block. That file is a **manual**
test checklist (unchecked `- [ ]` boxes), not an automated suite — match its existing voice
and granularity. Draw the cases from the Phase 1 and 2 verification sections: append vs
replace, undo self-inversion, the 409 conflict, attribution, read-only, print, and the mobile
Overview tab.

**Root `README.md`** — likely **no change**. This program adds no port, no PM2 process, no
nginx vhost and no cron job. Confirm rather than assume, and let `ops-check` back you up.

Then, from `C:\Users\chris\OneDrive\Apps\zo-bot.com`:

```
node tools/ops-check.mjs
node tools/project-status.mjs
```

`ops-check` cross-checks the README against the app folders and the `Deploy-*` functions in
`$PROFILE`, and enforces per-app doc conventions. It cannot see the VPS — nothing server-side
changed here beyond a `pm2 restart`, so there is no crontab or nginx change to reconcile by
hand.

---

## Done when

- Both apps deployed; `pm2 status` healthy for travel-app and mcp-server
- Production `tools/list` correct on `full`, and **exactly 7** on `genealogy`
- The acceptance test passes: constraints stated in one conversation are honoured in a fresh
  one, with no prompting
- Undo works in production
- All three docs updated; `ops-check.mjs` and `project-status.mjs` both run clean
- Scratch test content removed
- Phase 4 report appended to `PROGRESS.md`, with the Status blockquote updated to reflect a
  finished program

## If it goes wrong

- **mcp-server misbehaving** — remove `TRAVEL_WRITE` from `~/mcp-server/.env` and
  `pm2 restart mcp-server`. Writes stop immediately; no rollback deploy needed.
  `travel_get_trip_brief` survives, which is harmless. If the deploy itself is broken,
  `git revert` and re-run `Deploy-Mcp`.
- **travel-app migration failed** — the four columns are additive and nullable, so a partial
  apply is not destructive. `addColumnIfMissing` makes a re-run safe. Check `pm2 logs`,
  fix forward.
- **Travel data damaged** — restore from the pre-deploy backup you took in step 1, or from
  `~/travel-app/backups/`. See `travel-app/RUNBOOK.md` for the full procedure; SQLite is in
  WAL mode, so remove the `-wal` and `-shm` sidecars too.
