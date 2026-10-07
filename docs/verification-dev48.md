# DEV-48 / DEV-49 integration verification

The inherited main baseline (`733cb7b`, including PR #2) already contained the read-only server bridge, live-default configuration, deterministic status mapping, serial browser polling, demo mode and disconnected UI. This delivery reuses that implementation, persists the current company's actual four agent IDs in `.env.example`, narrows browser parsing to the expected own-property object shape, and adds focused polling and status tests. The renderer and fixed four-role layout are unchanged.

Verified in the assigned DEV-48 workspace:

- `npm ci`: successful; zero reported vulnerabilities.
- `npm test`: 15 passing tests, including mapping, response minimization, sanitized failure, demo behavior, polling timing/serialization, timeout/retry and cancellation.
- `npm run build`: TypeScript and Vite production build passed.
- `npm run test:browser`: all four Chromium tests passed against the production preview, covering desktop/mobile foundation, demo controls, live updates without reload, failure retention and recovery.
- Real read-only `GET /api/companies/{companyId}/agents` returned the four configured stable IDs. Developer was `running`; Orchestrator, Browser QA and Reviewer were `idle`.
- Production preview on loopback port 4289, using runtime API URL/company/key bindings and the example's stable mapping, returned HTTP 200 from `/api/office-state`: `{"mode":"live","snapshot":{"orchestrator":"idle","developer":"working","browser-qa":"idle","reviewer":"idle"}}`.
- Chromium loaded that real preview and showed matching role activity, `LIVE · CONNECTED` before and after a polling interval, and no page errors. No browser interception was used for this live check.
- Browser build artifacts were scanned for the runtime credential: absent. The bridge response contained only mode and four activities.
- `git diff --check`: passed before commit.

The first browser attempt found no installed Chromium. `npx playwright install chromium` installed Chromium and headless shell successfully; two FFmpeg mirror attempts received sandbox HTTP 403 before installation completed using the normal installer fallback. No network policy or proxy settings were changed. The subsequent full browser suite and real live check passed; there is no remaining browser verification blocker.

## Reproduce / browser verification support

Use Node 24.5+ and the existing HTTP(S)_PROXY/NO_PROXY configuration. Run `npm ci`, `npx playwright install chromium`, `npm test`, `npm run build`, then `npm run test:browser`. The suite owns port 4288 and selects demo mode explicitly; its live failure tests intercept only the narrow office endpoint.

For real live verification, copy `.env.example` to ignored `.env`, provide a reachable Paperclip API URL and runtime-only API key (environment values take precedence), and start `npm run preview -- --port 4289 --strictPort`. Open `http://127.0.0.1:4289/` and check `/api/office-state`. No writes or heartbeat triggers are necessary. For deterministic manual checks, run `OFFICE_MODE=demo npm run preview -- --port 4289 --strictPort` and use the scene buttons. Stop the existing server before changing mode. Never put credentials into VITE-prefixed variables or browser requests.

PR number and exact final head SHA are recorded on the DEV-49 issue and its pull_request work product; the PR targets main and must not be merged by the Developer.
