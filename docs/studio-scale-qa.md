# Studio scale verification

Route: `/`. Build with `npm run build`, then start with
`OFFICE_MODE=demo HOST=127.0.0.1 PORT=4399 npm run start`. No login or live
credentials are needed. Mixed / All working / All idle and the demo handoff
buttons exercise the existing animations and workflow routes.

Compare this PR with baseline `8a639d4` in separate checkouts at identical
viewport, DPI, roster, activity and reduced-motion settings. Baseline renders
the floor at 640 CSS pixels wide. This version renders at a minimum of 736 CSS pixels:
15% larger on narrow screens, filling the full available Studio panel width on
desktop after integration with main at `2a5f91b`. Room count never reduces scale.
The canvas backing buffer uses the displayed dimensions multiplied by device
pixel ratio, subject to a 16,777,216-pixel area budget and 8,192-pixel axis
limit for each buffer; CSS labels share the floor's dimensions.

Browser QA should explicitly judge whether ghosts and work props/activities
are easier to see in side-by-side captures. Check 1440×1000 and 1280×900 desktop,
768×1024 tablet, and 390×844 / 320×720 mobile at DPR 1 and 2 (also 3 on mobile).
Resize the viewport and change browser zoom / monitor DPI without reloading.
Verify crisp native portraits, label placement and full-name hover titles.

Use the intercepted office-state fixture in `tests/browser/roster.spec.ts` for
roster scenarios: 0/1, current four specialists, 6, 12, 24 and 40 agents.
The existing spec exercises 4 → 5 → 40 → 39, rename/native avatar updates,
handoff preservation, lifecycle returns and absence of the pipeline. Do not mutate the live company roster.
Check that scrolling reaches right-side coffee/work rooms and the last module,
keyboard and touch scrolling work, and the document has no horizontal overflow.
The viewport stays bounded at 78vh; larger rosters extend the floor vertically.

Affected flows: all Studio rendering, resizing and dynamic room growth.
Observe working props, idle coffee trips, document trips, directional facing,
handoffs and polling updates on desktop and mobile. Test reduced motion too.
Relevant existing specs: `tests/browser/roster.spec.ts`, `activities.spec.ts`,
`office.spec.ts`, `social-idle.spec.ts`, `canvas-allocation.spec.ts` (all under `tests/browser/`). Only the roster
spec was run for this implementation; full visual validation belongs to QA.

Original R1 implementation checks (integration-round results are recorded in DEV-198):

- `npx tsx --test tests/studio-viewport.test.ts tests/ghost-renderer.test.ts`: 3 passed.
- `npm run build`: TypeScript check and Vite build passed.
- `npm test`: 131 passed, full unit/integration suite (no repository CI workflow).
- `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost OFFICE_TEST_PORT=4399 npx playwright test tests/browser/roster.spec.ts --reporter=line`: 1 passed.
- Production demo start on port 4400; `GET /health` and `GET /`: HTTP 200
  with localhost excluded from the environment HTTP proxy.
- No lint script is defined.

## DEV-198 integration round 4

Integrated main `2a5f91b1a8d23e1c4bf641cb8717f33dca9a749e` into the existing
PR #23 branch, retaining social coffee behavior and pipeline removal. Desktop
now fills the reclaimed Studio width instead of stopping at 864 CSS pixels.
The mobile minimum, aspect ratio, bounded scroll area and both canvas budgets
remain intact. Prior SHA approvals do not apply to this integration.

- `npm run build`: passed (TypeScript and Vite).
- `npm test`: 119 tests, 118 passed; one new strict floating-point aspect-ratio
  assertion failed. After correcting it to a tolerance check,
  `npx tsx --test tests/studio-viewport.test.ts`: 4/4 passed. No product failure;
  full suite run once, failed test file rerun after correction.
- `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost OFFICE_TEST_PORT=4698 npx playwright test tests/browser/roster.spec.ts --reporter=line`:
  5/5 passed. Covers desktop/mobile full-width layout and dashboard absence,
  dynamic 4 → 5 → 40 → 39 rosters, outbound and completion returns with normal
  and reduced motion. This was the only browser spec executed this round.
- `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost OFFICE_MODE=demo HOST=127.0.0.1 PORT=4699 npm run start`,
  then `curl --noproxy '*' --fail --silent --output /dev/null --write-out 'GET / HTTP %{http_code}\n' http://127.0.0.1:4699/`:
  started successfully; GET / HTTP 200.
- `git diff --check` and `git diff --cached --check`: passed. No lint script or
  repository CI workflows/checks are configured.

The full unit run includes persistent coffee groups, only assigned agents
returning, undisturbed handoff bystanders, moving work documents, specialist
returns, animation/facing, DPI resizing and capped large-roster buffers.
Fresh visual Browser QA and Reviewer gates remain required on the new SHA.
