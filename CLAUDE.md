@AGENTS.md

## Operational docs

- `RUNBOOK.md` — production operations on the Hetzner VPS (PM2 `start.sh` wrapper,
  nginx, backups, rollback, Next.js standalone quirks like `DB_PATH` and the
  static-asset copy steps).
- `DEPLOY.md` (gitignored) — first-time VPS setup checklist.
- `TESTING.md` — test strategy and commands.
- Deploys: commit + push, then run `Deploy-Travel` from PowerShell (`$PROFILE`).

## Plan folders

New multi-phase plans go under `docs/<slug>/` (see `docs/redesign`, `docs/fixes`,
`docs/calendar-sync`) with a `PROGRESS.md` per the convention in the root `CLAUDE.md`.
Register the folder in the root `projects.config.json` (path + `totalPhases`) and run
`node tools/project-status.mjs` from the repo root.
