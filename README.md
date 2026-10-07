# Paperclip Pixel Office

A small, read-only browser office for **Orchestrator, Developer, Browser QA and Reviewer**. Each has a permanent desk, palette and visible name. Local demos show mixed activity, all working and all idle. Working characters use typing animation; idle characters remain still. A server-only bridge connects to live Paperclip activity using stable agent IDs.

## Run locally

Requires Node.js **24.5+** and npm (for environment-aware fetch proxy support). Verified development environment: Node 24.21.0, npm 11.19.0.

```sh
npm ci
OFFICE_MODE=demo npm run dev
```

Open the loopback URL printed by Vite (normally `http://127.0.0.1:5173`). Demo controls change only local visual activity. Reload restores the mixed demo; identities and desk locations never change. Reduced-motion preferences stop character animation while retaining visible activity labels.

```sh
npm run build
npm test
OFFICE_MODE=demo npm run start
```

Production browser output is in `dist/`. Serve it with `npm run start` from this repository, which runs `server/index.ts` directly with Node and mounts the existing bridge. Node 24 strips the server’s TypeScript types; no Vite or npm dependencies are needed at runtime. Keep `server/`, `src/state.ts`, `src/handoff.ts`, `package.json` and `dist/` together (or retain the checkout). Static-only hosting cannot supply live state. The server binds to loopback; keep it behind your existing access controls if deployed. No remote fonts or image CDN are used.

For browser checks, stop any server on port 4288 first:

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

Playwright starts and stops its own production Node server on `127.0.0.1:4288`. The suite checks four visible roles, deterministic placement after reload, both activity states, changed Canvas output, no page/console errors or external requests, mobile bounds, keyboard controls and reduced motion. The suite also checks live polling, failure retention, initial disconnection and recovery.

## Architecture

```text
Paperclip GET agents → server stable-ID/status mapping → GET /api/office-state
  → browser serial polling (or explicit deterministic demo fixtures)
  → mapVisualState() — known role IDs, safe activity normalization
  → VisualState — exactly four immutable identities + idle/working
  → sceneCharacters() — fixed palettes, seats and animation frames
  → mountOffice() — adapted Pixel Agents Canvas renderer
```

- `src/state.ts`: the fixed role registry, provider fixtures and pure mapping boundary. Input shape is `{ [roleId]: 'idle' | 'working' }`. Missing/invalid values default to idle; unknown roles and inherited properties are ignored. Input cannot override names, palettes or coordinates.
- `src/scene.ts`: tile layout, permanent furniture and the pure adapter to upstream character types.
- `src/renderer.ts`: renders supplied visual state; no fetch, socket, provider import or Paperclip API dependency. Its returned `setState()` accepts a replacement visual snapshot; `destroy()` cancels the animation loop.
- `server/office-state.ts`: server-only configuration, read-only upstream request, strict ID mapping and sanitized responses. `server/index.ts` mounts it in production; `vite.config.ts` mounts it for development and optional local preview.
- `src/provider.ts`: validates browser responses and polls every 1.5 seconds after completion, with a seven-second timeout and no overlapping requests.
- `src/main.ts`: connection indication, live updates, local demo controls and accessible DOM roster/desk labels. These use the same mapped state as the Canvas. No persisted state is required to keep identity deterministic.
- `src/vendor/pixel-agents`: a bounded reuse of existing Canvas rendering, sprite definitions/cache, depth ordering and frame selection. See [foundation selection](docs/foundation.md) and [third-party inventory](THIRD_PARTY.md).

The renderer remains unaware of credentials, APIs and transport. Additional roles, task assignment and general workflow simulation remain out of scope. This app never assigns tasks, writes issues, creates agents or merges PRs.

## Verification coverage

Run `npm run build` before `npm test`: production HTTP tests use the actual `dist/` output. Server tests cover health, loopback configuration, static/history serving, asset and credential containment, read-only upstream requests, outage/recovery, missing configuration and SIGTERM/SIGINT shutdown.

Unit tests cover the exact role roster/coordinates, input normalization, immutable identities, all demo modes, deterministic scene adaptation, typing frames and reduced motion. Browser tests live in `tests/browser/`. Their screenshots are generated under ignored `test-results/` when checks can run. No unverified screenshots are committed.

Provider validation accepts only plain snapshots, keeps known role activities and bounded task fields, and discards unexpected fields. Fake-clock polling tests cover the 1.5-second cadence, serial requests, timeout/retry, last-valid-state retention, recovery, disposal, demo shutdown, and live handoff hydration/recovery. `running` maps to working; `active` and other non-running statuses map to idle.

## Live configuration and operation

Copy `.env.example` to `.env` and fill in server-only values, or supply environment variables (which take precedence). Never prefix secrets with `VITE_`; Vite exposes such variables to browser code. Do not commit `.env` or credentials.

- `OFFICE_MODE=live` (default): configuration is required; invalid/missing configuration produces an explicit disconnected UI. There is no automatic demo fallback.
- `OFFICE_MODE=demo`: no Paperclip request or credentials required; the server returns the fixed mixed fixture. The browser visibly says LOCAL DEMO, stops polling and enables local scene controls.
- `PAPERCLIP_API_URL`: trusted upstream base URL, without query, fragment or embedded credentials.
- `PAPERCLIP_COMPANY_ID` and `PAPERCLIP_API_KEY`: company and runtime-provided API credentials, used only by the server.
- `PAPERCLIP_AGENT_ROLES`: JSON object mapping each office role (`orchestrator`, `developer`, `browser-qa`, `reviewer`) to a different stable Paperclip agent UUID. Obtain IDs from your company's agent records; display-name changes require no update. When an agent is replaced, update its UUID and restart the server. All four are required.

Run `npm run dev`, or `npm run build` followed by `npm run start`. Both load `.env` server-side (production uses Node’s `--env-file-if-exists`; existing environment variables take precedence). The npm startup commands enable Node's environment proxy support and honor existing `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`; no proxy bypass is added. Restart after changing configuration.

Upstream reads are `GET /api/companies/{companyId}/agents` (2.5-second timeout) and `GET /api/companies/{companyId}/issues?limit=1000` (4-second timeout), with redirects rejected. Only the four configured IDs are consumed; unknown agents are ignored. `running` becomes `working`; every other nonempty status becomes `idle`. Missing or duplicate configured agents, malformed responses, transport failures and upstream errors return HTTP 503 with a fixed generic message, never upstream details. The browser receives `{mode, snapshot: {role: "idle" | "working"}, tasks}`, never UUIDs, agent names, credentials or raw upstream data. Responses are not cached; non-GET bridge methods return 405.

Live mode visibly says LIVE · CONNECTED and hides demo controls. Polling updates both Canvas and labels through `mapVisualState()` and `renderer.setState()` without reload. Failures show DISCONNECTED outside the renderer and retain the last valid state, explicitly labeled as last received activity. Before the first valid response, characters are neutral idle and the summary says activity unavailable. Polling continues and automatically restores the connected indication on recovery.

## Orchestrator → Developer, Browser QA and Reviewer handoffs

The issue bridge requests an explicit maximum of 1000 company issues (the supported Paperclip list bound) and selects child issues assigned to the configured Developer whose parent is assigned to the configured Orchestrator. It uses `id`, `parentId` and `assigneeAgentId` only on the server. Developer browser tasks contain only the public `identifier` (maximum 32 characters) and whitespace-normalized `title` (maximum 80 characters). Browser QA children also qualify when the same Orchestrator parent has a Developer child with `status: done`. The QA assignment is the workflow evidence; Developer idle state is never consulted. QA tasks add `target: "browser-qa"` and optional `sha`. Status and `updatedAt` are not event keys: edits and reopening must not replay an assignment. Reviewer children qualify under the same configured Orchestrator parent when a Browser QA sibling has `status: done`. The newly observed Reviewer assignment is the authoritative Orchestrator delegation signal; completion is checked directly, but `done` alone is not interpreted as APPROVE. The bounded issue-list contract has no verified structured approval verdict, so the office does not parse free-text verdicts or infer approval from idle/runtime state. Reviewer tasks add `target: "reviewer"` and an optional SHA from their own assignment. Request-changes loops and all later approval/merge transitions remain unsupported.

Each browser owns its comparison baseline. The first successful task snapshot hydrates silently; newly appearing eligible tasks after that emit a visual-only `{source, target, taskId, title, sha?}` event. A task identifier/destination pair is shown at most once per page lifetime, including reassignment away and back. The deduplication set is capped at 10,000 distinct identifiers; if exhausted, handoffs stay silent until reload rather than evicting IDs and replaying old assignments. Reload starts a fresh silent baseline. This is polling, so assignments created and removed entirely between polls cannot be observed. A response containing 1000 or more issues is treated as potentially truncated, so handoffs are unavailable rather than comparing an incomplete parent/child set. Companies must have fewer than 1000 issues for this bounded snapshot approach; larger companies need a future paginated or targeted-read implementation. Issue transport/timeouts, HTTP failures, malformed responses and the reached limit emit a server-only warning with a fixed diagnostic category (and HTTP status when applicable), never credentials, raw upstream errors or issue contents. Malformed individual issues are skipped; a title that becomes empty after sanitization uses “Untitled task”. Sequential upstream reads budget 2.5 seconds for agents and 4 seconds for issues, within the browser’s 7-second request timeout. An issue-read failure returns `tasks: null` while retaining fresh agent activity; browser/network failures also clear the comparison baseline. Recovery hydrates silently rather than replaying work missed during an outage. No history, credentials or event cursor is stored in the browser.

`src/handoff.ts` owns this small transition detector and the deterministic route. The vendored fixed-seat foundation retained WALK sprites but removed its movement/pathfinding updater, so the renderer uses a shared movement engine with a fixed clear-aisle Developer route from Orchestrator's seat `(6,6)` via `(6,5)` and `(16,5)` to the seat-side tile `(16,6)`. The QA route goes from `(6,6)` via `(8,6)` and `(8,12)` to `(7,12)`, beside Browser QA at `(6,12)`. The Reviewer route goes from `(6,6)` via `(8,6)` and `(8,12)` to `(16,12)`, beside Reviewer at `(17,12)`. Each route takes four seconds outbound, displays a three-second DOM text bubble, then returns over the same route in four seconds. Events are presented sequentially with at most two waiting events (plus one active). Overflow drops the oldest waiting event; waiting events expire after 12 seconds. Timing uses the monotonic clock so suspended animation frames do not extend a handoff. Hiding the document clears active/waiting handoffs and drops incoming events while hidden; continued polling still records their identifiers, so dropped events do not replay. This is a recent visual cue, not an exhaustive task history. The Developer stays at `(17,6)`, Browser QA at `(6,12)` and Reviewer at `(17,12)`; their permanent identity and activity snapshots are unchanged. Reduced motion skips the route entirely: characters stay at their desks and the task bubble appears for three seconds, keeping the canvas static when activity is unchanged. The bounded bubble uses text content, wraps on narrow screens, and is announced as a status.

In explicit demo mode, **Demo handoff** queues `DEMO-1 — Build the next office feature` through the same renderer event method. **Demo QA handoff** queues `QA DEMO-2 @ abc1234 — Test the implementation` through that same path. **Demo Reviewer handoff** queues `Review DEMO-3 @ abc1234 — Review the implementation` through the same path. All handoff controls are hidden and guarded in live mode. Demo handoffs never alter working/idle activity. No synthetic event is automatically inserted on startup.

SHA provenance: the server reads only the destination QA or Reviewer task description, accepting a full 40-character hexadecimal SHA on a labeled line (`Exact SHA`, `Required exact SHA`, `Exact required PR head SHA`, `Required tested SHA`, `Exact PR head SHA`, `Exact PR head SHA to test`, or `Immutable SHA to test`). Optional Markdown bullets/backticks are accepted. Conflicting recognized values, short hashes, prose-only mentions and missing labels produce no SHA. The bubble shows seven characters of this authoritative assignment value; this is not a claim about the current GitHub head. There are no GitHub requests. Unsupported description formats safely fall back to the destination task identifier/title. A Reviewer SHA is never copied from the parent, Developer, or QA sibling.

Focused tests cover issue selection, safe payloads, hydration, new assignment, deduplication, reload/recovery, issue-read failure isolation, exact route endpoints and Chromium's complete outbound → bubble → return sequence. Real integrations require the parent and Developer IDs to match the configured persistent mapping; the app never creates test tasks or writes to Paperclip.

## Production service operation

```sh
npm ci
npm run build
npm test
OFFICE_MODE=demo npm run start
# In another shell (default port):
curl --fail http://127.0.0.1:3000/health
```

`HOST` defaults to `127.0.0.1`; `PORT` defaults to `3000` and must be an integer from 1 to 65535. Keep `HOST=127.0.0.1` for the VPS. This change does not configure public access, firewall, Tailscale, DNS or a reverse proxy. For live operation supply the configuration above, then use `npm run start` without the demo override. No Vite preview process is required.

`GET /health` returns exactly HTTP 200 and `{"status":"ok"}` once the server is listening with a built frontend. It indicates process readiness only: Paperclip outages or invalid live configuration leave health healthy while `/api/office-state` returns 503 and the UI shows disconnected. It never includes upstream data or credentials. Missing `dist/index.html`, invalid ports or listen failures cause a nonzero startup exit. Only `dist/` is served; extensionless browser-history routes fall back to its index, missing assets/unknown APIs return 404, and dotfiles and symlinks outside `dist/` are rejected.

Ctrl-C (SIGINT) or SIGTERM stops accepting connections and drains active requests. The process exits successfully after draining, or with failure after a ten-second shutdown deadline. The systemd example allows fifteen seconds before its final kill. Use systemd for persistent operation; shell backgrounding is not a service installation.

### Operator installation example (not automatically executed)

Review [deploy/pixel-office.service](deploy/pixel-office.service) before installation. The example uses a dedicated non-root `pixel-office` user/group, `/opt/pixel-office` as the working directory, `/usr/bin/node` (Node 24.5+), and an external `/etc/pixel-office/environment`. Adjust these explicit paths for the operator’s installation. The service directly runs the same Node entry point as `npm run start`, avoiding a signal-forwarding npm wrapper. It has no runtime dependency on `node_modules` and does not load a checkout `.env`; systemd supplies the external environment.

1. As an authorized operator, provision the non-login service account and a reviewed checkout/release at `/opt/pixel-office`. Run `npm ci` and `npm run build` as a build user. Ensure the service user can read the release, with no write permission required. Do not build inside a running release; stop it before replacing its files.
2. Create `/etc/pixel-office` with root-only access and `/etc/pixel-office/environment` owned by root with mode `0600`. Populate it from the generic `.env.example` using operator-provided secret bindings. Keep `HOST=127.0.0.1`; use the full live mapping. Do not copy credentials into the unit, source, browser assets or command line. Systemd reads this file before dropping privileges. Preserve required proxy environment settings from the existing deployment policy; the unit enables Node’s environment proxy support.
3. Validate and install the reviewed unit, then start it explicitly:

```sh
sudo systemd-analyze verify deploy/pixel-office.service
sudo install -m 0644 deploy/pixel-office.service /etc/systemd/system/pixel-office.service
sudo systemctl daemon-reload
sudo systemctl enable --now pixel-office.service
sudo systemctl status pixel-office.service
curl --fail http://127.0.0.1:3000/health
sudo journalctl -u pixel-office.service -n 50 --no-pager
```

For operation, use `sudo systemctl stop pixel-office` for a clean SIGTERM shutdown, `sudo systemctl start pixel-office` to start, and `sudo systemctl restart pixel-office` after configuration/release changes. Use `sudo systemctl status pixel-office` and the health check to confirm readiness, then verify LIVE · CONNECTED in the app to confirm upstream connectivity. `Restart=on-failure` restarts unexpected failures after five seconds; an operator stop stays stopped. `sudo systemctl disable --now pixel-office` stops the service and removes boot startup. Installation, enablement and any access/exposure changes remain operator actions, not part of this implementation.
