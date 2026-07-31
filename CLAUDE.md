@AGENTS.md

## Operational docs

- `RUNBOOK.md` — production operations on the Hetzner VPS (PM2 `start.sh` wrapper,
  nginx, backups, rollback, Next.js standalone quirks like `DB_PATH` and the
  static-asset copy steps).
- `DEPLOY.md` (gitignored) — first-time VPS setup checklist.
- `TESTING.md` — test strategy and commands.
- Deploys: commit + push, then run `Deploy-Travel` from PowerShell (`$PROFILE`).

## Per-user read-only role

`ADMIN_EMAILS` (comma-separated, case-insensitive) gates writes: any authenticated
Cloudflare Access email not in the list gets 403 `{"error":"read_only"}` on unsafe
`/api` methods (checked in `src/proxy.ts`, sharing `parseAdminEmails()` from
`src/lib/admin-emails.ts`) and has write controls hidden client-side. Unset/empty =>
everyone is admin (fail-open). `getAccessInfo()` in `src/lib/auth.ts` reads the role
server-side for the root layout, which wraps the app in `ReadOnlyProvider`
(`src/lib/read-only.tsx`); components call `useReadOnly()`. No `/api/me` endpoint is
needed — this app has no client-side auth fetch, everything comes from server
components reading `headers()`. See `docs/plans/2026-07-per-user-read-only/04-travel.md`
(Phase 4 of the cross-app program) for the full design.

## Plan folders

New multi-phase plans go under `docs/<slug>/` (see `docs/redesign`, `docs/fixes`,
`docs/calendar-sync`) with a `PROGRESS.md` per the convention in the root `CLAUDE.md`.
Register the folder in the root `projects.config.json` (path + `totalPhases`) and run
`node tools/project-status.mjs` from the repo root.

## Downstream MCP write registry

`mcp-server/travel-write.js` mirrors the writable `colMap` field lists in
`src/app/api/trips/**`. When a migration or route change adds a writable column, update
that registry too, or Claude's travel write tools will reject the new field as unknown.
