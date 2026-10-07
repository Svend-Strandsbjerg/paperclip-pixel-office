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
