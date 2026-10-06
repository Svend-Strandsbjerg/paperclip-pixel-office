# Paperclip Pixel Office

A small, read-only browser office for **Orchestrator, Developer, Browser QA and Reviewer**. Each has a permanent desk, palette and visible name. Local demos show mixed activity, all working and all idle. Working characters use typing animation; idle characters remain still. The office does not connect to Paperclip.

## Run locally

Requires Node.js **22.12+** (or 24+) and npm. Verified development environment: Node 24.21.0, npm 11.19.0.

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Vite (normally `http://127.0.0.1:5173`). Demo controls change only local visual activity. Reload restores the mixed demo; identities and desk locations never change. Reduced-motion preferences stop character animation while retaining visible activity labels.

```sh
npm test
npm run build
npm run preview -- --port 4288 --strictPort
```

Production output is in `dist/`. It is a static app and requires no backend, credentials, remote fonts or image CDN.

For browser checks, stop any preview server on port 4288 first:

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

Playwright starts and stops its own production preview server on `127.0.0.1:4288`. The suite checks four visible roles, deterministic placement after reload, both activity states, changed Canvas output, no page/console errors or external requests, mobile bounds, keyboard controls and reduced motion. Passing unit tests/build does not imply these browser checks passed: see [verification](docs/verification.md) for this environment's runtime blocker.

## Architecture

```text
external activity snapshot (currently local demo fixtures)
  → mapVisualState() — known role IDs, safe activity normalization
  → VisualState — exactly four immutable identities + idle/working
  → sceneCharacters() — fixed palettes, seats and animation frames
  → mountOffice() — adapted Pixel Agents Canvas renderer
```

- `src/state.ts`: the fixed role registry, provider fixtures and pure mapping boundary. Input shape is `{ [roleId]: 'idle' | 'working' }`. Missing/invalid values default to idle; unknown roles and inherited properties are ignored. Input cannot override names, palettes or coordinates.
- `src/scene.ts`: tile layout, permanent furniture and the pure adapter to upstream character types.
- `src/renderer.ts`: renders supplied visual state; no fetch, socket, provider import or Paperclip API dependency. Its returned `setState()` accepts a replacement visual snapshot; `destroy()` cancels the animation loop.
- `src/main.ts`: local demo controls and accessible DOM roster/desk labels. These use the same mapped state as the Canvas. No persisted state is required to keep identity deterministic.
- `src/vendor/pixel-agents`: a bounded reuse of existing Canvas rendering, sprite definitions/cache, depth ordering and frame selection. See [foundation selection](docs/foundation.md) and [third-party inventory](THIRD_PARTY.md).

A future provider can replace the local fixture source while continuing to call the pure mapping boundary. Adding a real transport, additional statuses, movement, task assignment or workflow simulation is outside this foundation. This app never assigns tasks, writes issues, creates agents or merges PRs.

## Verification coverage

Unit tests cover the exact role roster/coordinates, input normalization, immutable identities, all demo modes, deterministic scene adaptation, typing frames and reduced motion. Browser tests live in `tests/browser/`. Their screenshots are generated under ignored `test-results/` when checks can run. No unverified screenshots are committed.
