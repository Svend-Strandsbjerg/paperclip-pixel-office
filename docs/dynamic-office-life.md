# Dynamic office life (DEV-214)

Idle agents use independent identity/cycle decisions on the shared frame clock. Visits cover local pauses, coffee, lounge, shared social positions and the open window-side aisle. They dwell for 14–38 seconds, retrace the existing circulation lanes, pause at home and choose again. Polling and roster order do not restart a visit. Working agents stay anchored; incoming work interrupts visits immediately and returns recipients within the four-second handoff walk window.

Assignment couriers slide the card from their hand to the recipient's activity anchor beside the desk. One card per workstation remains visible through idle polls and processing; a later delivery replaces the card rather than accumulating props. An actual completion handoff picks up that card, carries it to the coordinator and places it there. This is a presentation summary, not a task inventory. Removal clears the workstation prop; reload starts without historical cards. Hidden-tab/expired events retain the existing bounded queue behavior.

Six activity profiles share that anchor: card sorting, block assembly, scanning/checking, annotated review, information comparison/grouping, and progressive writing with a pen. Headsets and glasses are transient overlays in the ghost's pose transform. Native identity/avatar assets remain unchanged. Labels show the current profile and icon, with DOM updates only when the profile changes. Reduced motion freezes activities/accessories and suppresses decorative travel while retaining the functional handoff message and placed card.

## QA references

Start: `OFFICE_MODE=demo HOST=127.0.0.1 PORT=4389 npm start` after `npm ci && npm run build`. No login or credentials needed for demo.

- A: select All idle, observe several minutes (first departures after 16–42 seconds). Agents pause and return independently; inspect a larger mocked dynamic roster with the same behavior. `tests/office-activities.test.ts` simulates 40 agents for ten minutes with deterministic replay and desk collision checks.
- B: while idle agents are away, select Demo handoff. Recipient retraces its route while the courier approaches. At four seconds the card slides into the recipient work area; it stays visible after the courier leaves, even if the recipient remains idle.
- C: select All working. Within four seconds recipients reach home and begin using the card. Observe all six 18-second profiles, activity labels, glasses/headsets, and small pose reactions. The card remains beneath the work graphics.
- D: use the existing live/mocked `/api/office-state` completion fixture: baseline an open child, then return the same child as done. Idle toggles do not invent completion. `tests/returns.test.ts`, `tests/polling.test.ts`, and `tests/ghost-renderer.test.ts` cover this route and generic result couriers.
- Verify desktop, narrow scrolling view, dynamic native avatars, and reduced motion. Formal full browser validation belongs to Browser QA.

Targeted browser spec: `tests/browser/activities.spec.ts` (idle changes, placed-card persistence, work transition, activity labels, reduced motion). Related specs: `social-idle.spec.ts`, `office.spec.ts`, `roster.spec.ts`, `canvas-allocation.spec.ts`.

For this runner, browser commands require `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost OFFICE_TEST_PORT=4389`. Full browser suite was not run.

## Implementation verification

- Unit/integration: 121 passed (full suite, no CI workflow configured).
- Focused behavior/handoff checks: 51 passed; integrated renderer regression also passed.
- `npm run build`: passed, including TypeScript `--noEmit`.
- Lint: no repository lint command configured.
- Targeted Playwright: `tests/browser/activities.spec.ts`, 1 passed.
- Runtime smoke: built demo server started on port 4389; `/` and `/health` returned HTTP 200.
