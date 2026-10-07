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
npm test
npm run build
OFFICE_MODE=demo npm run preview -- --port 4288 --strictPort
```

Production browser output is in `dist/`. Serve it with `npm run preview` from this repository (including its server config and dependencies), which also mounts the bridge. Static-only hosting cannot supply live state. The server binds to loopback; keep it behind your existing access controls if deployed. No remote fonts or image CDN are used.

For browser checks, stop any preview server on port 4288 first:

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

Playwright starts and stops its own production preview server on `127.0.0.1:4288`. The suite checks four visible roles, deterministic placement after reload, both activity states, changed Canvas output, no page/console errors or external requests, mobile bounds, keyboard controls and reduced motion. The suite also checks live polling, failure retention, initial disconnection and recovery.

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
- `server/office-state.ts`: server-only configuration, read-only upstream request, strict ID mapping and sanitized responses. `vite.config.ts` mounts the same middleware in development and preview.
- `src/provider.ts`: validates browser responses and polls every 1.5 seconds after completion, with a seven-second timeout and no overlapping requests.
- `src/main.ts`: connection indication, live updates, local demo controls and accessible DOM roster/desk labels. These use the same mapped state as the Canvas. No persisted state is required to keep identity deterministic.
- `src/vendor/pixel-agents`: a bounded reuse of existing Canvas rendering, sprite definitions/cache, depth ordering and frame selection. See [foundation selection](docs/foundation.md) and [third-party inventory](THIRD_PARTY.md).

The renderer remains unaware of credentials, APIs and transport. Additional roles, task assignment and general workflow simulation remain out of scope. This app never assigns tasks, writes issues, creates agents or merges PRs.

## Verification coverage

Unit tests cover the exact role roster/coordinates, input normalization, immutable identities, all demo modes, deterministic scene adaptation, typing frames and reduced motion. Browser tests live in `tests/browser/`. Their screenshots are generated under ignored `test-results/` when checks can run. No unverified screenshots are committed.

## Live configuration and operation

Copy `.env.example` to `.env` and fill in server-only values, or supply environment variables (which take precedence). Never prefix secrets with `VITE_`; Vite exposes such variables to browser code. Do not commit `.env` or credentials.

- `OFFICE_MODE=live` (default): configuration is required; invalid/missing configuration produces an explicit disconnected UI. There is no automatic demo fallback.
- `OFFICE_MODE=demo`: no Paperclip request or credentials required; the server returns the fixed mixed fixture. The browser visibly says LOCAL DEMO, stops polling and enables local scene controls.
- `PAPERCLIP_API_URL`: trusted upstream base URL, without query, fragment or embedded credentials.
- `PAPERCLIP_COMPANY_ID` and `PAPERCLIP_API_KEY`: company and runtime-provided API credentials, used only by the server.
- `PAPERCLIP_AGENT_ROLES`: JSON object mapping each office role (`orchestrator`, `developer`, `browser-qa`, `reviewer`) to a different stable Paperclip agent UUID. Obtain IDs from your company's agent records; display-name changes require no update. When an agent is replaced, update its UUID and restart the server. All four are required.

Run `npm run dev`, or `npm run build` followed by `npm run preview`. Both load `.env` server-side. The npm startup commands enable Node's environment proxy support and honor existing `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`; no proxy bypass is added. Restart after changing configuration.

Upstream reads are `GET /api/companies/{companyId}/agents` (five-second timeout) and `GET /api/companies/{companyId}/issues?limit=1000` (1.5-second timeout), with redirects rejected. Only the four configured IDs are consumed; unknown agents are ignored. `running` becomes `working`; every other nonempty status becomes `idle`. Missing or duplicate configured agents, malformed responses, transport failures and upstream errors return HTTP 503 with a fixed generic message, never upstream details. The browser receives `{mode, snapshot: {role: "idle" | "working"}, tasks}`, never UUIDs, agent names, credentials or raw upstream data. Responses are not cached; non-GET bridge methods return 405.

Live mode visibly says LIVE · CONNECTED and hides demo controls. Polling updates both Canvas and labels through `mapVisualState()` and `renderer.setState()` without reload. Failures show DISCONNECTED outside the renderer and retain the last valid state, explicitly labeled as last received activity. Before the first valid response, characters are neutral idle and the summary says activity unavailable. Polling continues and automatically restores the connected indication on recovery.

## Orchestrator → Developer handoff

The issue bridge requests an explicit maximum of 1000 company issues (the supported Paperclip list bound) and selects child issues assigned to the configured Developer whose parent is assigned to the configured Orchestrator. It uses `id`, `parentId` and `assigneeAgentId` only on the server. Browser tasks contain only the public `identifier` (maximum 32 characters) and whitespace-normalized `title` (maximum 80 characters). Status and `updatedAt` are deliberately not event keys: ordinary edits, completion and reopening must not replay an assignment. No other delegation direction is supported.

Each browser owns its comparison baseline. The first successful task snapshot hydrates silently; newly appearing eligible tasks after that emit a visual-only `{source, target, taskId, title}` event. A task identifier is shown at most once per page lifetime, including reassignment away and back. Reload starts a fresh silent baseline. This is polling, so assignments created and removed entirely between polls cannot be observed. A response containing 1000 or more issues is treated as potentially truncated, so handoffs are unavailable rather than comparing an incomplete parent/child set. Companies must have fewer than 1000 issues for this bounded snapshot approach; larger companies need a future paginated or targeted-read implementation. Issue transport/timeouts, HTTP failures, malformed responses and the reached limit emit a server-only warning with a fixed diagnostic category (and HTTP status when applicable), never credentials, raw upstream errors or issue contents. An issue-read failure returns `tasks: null` while retaining fresh agent activity; browser/network failures also clear the comparison baseline. Recovery hydrates silently rather than replaying work missed during an outage. No history, credentials or event cursor is stored in the browser.

`src/handoff.ts` owns this small transition detector and the deterministic route. The vendored fixed-seat foundation retained WALK sprites but removed its movement/pathfinding updater, so the renderer uses a single fixed clear-aisle route from Orchestrator's seat `(6,6)` via `(6,5)` and `(16,5)` to the seat-side tile `(16,6)`. It takes four seconds outbound, displays a three-second DOM text bubble, then returns over the same route in four seconds. Events are presented sequentially. The Developer stays at `(17,6)`; both permanent identity and activity snapshots are unchanged. Reduced motion freezes walking frames, retaining route and task text. The bounded bubble uses text content, wraps on narrow screens, and is announced as a status.

In explicit demo mode, **Demo handoff** queues `DEMO-1 — Build the next office feature` through the same renderer event method. This control is hidden and guarded in live mode. Demo handoffs never alter working/idle activity. No synthetic event is automatically inserted on startup.

Focused tests cover issue selection, safe payloads, hydration, new assignment, deduplication, reload/recovery, issue-read failure isolation, exact route endpoints and Chromium's complete outbound → bubble → return sequence. Real integrations require the parent and Developer IDs to match the configured persistent mapping; the app never creates test tasks or writes to Paperclip.
