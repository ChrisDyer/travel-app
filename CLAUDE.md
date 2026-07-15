@AGENTS.md

## Operational docs

- `RUNBOOK.md` — production operations on the Hetzner VPS (PM2 `start.sh` wrapper,
  nginx, backups, rollback, Next.js standalone quirks like `DB_PATH` and the
  static-asset copy steps).
- `DEPLOY.md` (gitignored) — first-time VPS setup checklist.
- `TESTING.md` — test strategy and commands.
- Deploys: commit + push, then run `Deploy-Travel` from PowerShell (`$PROFILE`).
