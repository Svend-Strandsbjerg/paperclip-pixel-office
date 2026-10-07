# DEV-75 verification

Implementation branch: `dev-75-agent-identity`, based on `main` at `1452669dc0da5352b027103f82cf5ac57be81a63`.

- `npm ci`: passed; lockfile unchanged.
- `npm run build`: passed (TypeScript and Vite production build).
- `npm test`: 43/43 passed. Includes real production HTTP bridge, read-only upstream requests, sanitized output, `/health`, static assets, startup and clean signal shutdown.
- Chromium: all 16 scenarios passed across the initial run (5 passed) and `npx playwright test --last-failed` (11/11 passed, 1.6m). The initial run started before the fresh browser installation completed; those 11 early browser launch failures were environmental and all passed once installation finished. No application failures remained.
- `git diff --check`: passed.

The production browser scenario now provides documented `name`, `role`, `appearance` and `avatarUrl` fields through a real HTTP upstream. It checks all four displayed names/roles, distinct portrait images, identical images after polls/reload, identity retained during outage, handoffs, recovery, GET-only upstream traffic and absence of server credentials/internal IDs from browser resources. The other browser scenarios cover 320/390px layouts and long handoff text, keyboard use, reduced motion, burst queues and tab visibility.

Live instance verification remains unavailable: the supplied Paperclip endpoint refuses TCP connections. Public schema and route source were inspected instead; fixture testing does not confirm actual deployed agent names/palettes. See [identity/art decision](identity-art-direction.md) for the exact reference revision and fallback behavior. No Paperclip mutations are added to the application. No deployment changes, downstream tasks or merge performed.

Screenshots from the built production demo were visually inspected:

- [Desktop](screenshots/dev75/office-desktop.png)
- [390px mobile, reduced motion](screenshots/dev75/office-mobile.png)

## DEV-78 integration correction

Merged refreshed `origin/main` (`68da4a5`) into the existing
`dev-75-agent-identity` branch without rewriting published history. The two
conflicts were resolved as a union: `src/main.ts` retains identity/art imports
and the Reviewer demo import, button and listener; the production fixture retains
names, roles, appearance and avatar URL fields alongside Reviewer running state,
historical QA completion and historical/new/missed Reviewer assignments. Identity
assertions and Reviewer handoff coverage are both retained. Integrated diffs were
checked against both parents for feature loss.

Verification on the integrated implementation:

- `npm ci`: passed; 25 packages installed, 0 audit vulnerabilities.
- `npm run build`: TypeScript check and Vite production build passed.
- `npm test`: 46/46 unit/integration tests passed, 0 skipped or failed.
- `PLAYWRIGHT_BROWSERS_PATH=/srv/agent-platform/playwright-browsers npm run test:browser -- --workers=2`:
  all 20 Chromium tests passed in 2.8 minutes using the production Node server.
  This complete run was explicitly required by DEV-78. All Reviewer mobile and
  320px long-title geometry checks passed, so no layout correction was needed.
- Runtime coverage confirmed production startup, HTTP 200 `/health` with exactly
  `{"status":"ok"}`, SIGTERM/SIGINT shutdown, GET-only upstream reads, identity
  stability, secret/internal-ID containment, silent history/recovery, deterministic
  demos and reduced motion.
- `git diff --check` and staged diff whitespace checks passed. No separate lint
  script is provided by the project.

Optional maintainability notes were left unchanged to keep this correction scoped
to integration. The exact pushed head is recorded in PR #8 and DEV-78. Prior QA
and Reviewer approvals do not transfer to this new head. The PR was not merged;
the Orchestrator owns fresh downstream routing.
