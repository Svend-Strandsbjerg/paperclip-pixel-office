# Studio scale verification

Route: `/`. Build with `npm run build`, then start with
`OFFICE_MODE=demo HOST=127.0.0.1 PORT=4399 npm run start`. No login or live
credentials are needed. Mixed / All working / All idle and the demo handoff
buttons exercise the existing animations and workflow routes.

Compare this PR with baseline `8a639d4` in separate checkouts at identical
viewport, DPI, roster, activity and reduced-motion settings. Baseline renders
the floor at 640 CSS pixels wide. This version renders at 736–864 CSS pixels:
15% larger on narrow screens and up to 35% larger on desktop. The floor fills
available panel width between those bounds. Room count never reduces scale.
The canvas backing buffer uses the displayed dimensions multiplied by device
pixel ratio, rounded up; CSS labels share the floor's dimensions.

Browser QA should explicitly judge whether ghosts and work props/activities
are easier to see in side-by-side captures. Check 1440×1000 and 1280×900 desktop,
768×1024 tablet, and 390×844 / 320×720 mobile at DPR 1 and 2 (also 3 on mobile).
Resize the viewport and change browser zoom / monitor DPI without reloading.
Verify crisp native portraits, label placement and full-name hover titles.

Use the intercepted office-state fixture in `tests/browser/roster.spec.ts` for
roster scenarios: 0/1, current four specialists, 6, 12, 24 and 40 agents.
The existing spec exercises 4 → 5 → 40 → 39, rename/native avatar updates,
handoff preservation and the pipeline. Do not mutate the live company roster.
Check that scrolling reaches right-side coffee/work rooms and the last module,
keyboard and touch scrolling work, and the document has no horizontal overflow.
The viewport stays bounded at 78vh; larger rosters extend the floor vertically.

Affected flows: all Studio rendering, resizing and dynamic room growth.
Observe working props, idle coffee trips, document trips, directional facing,
handoffs and polling updates at both scale bounds. Test reduced motion too.
Relevant existing specs: `tests/browser/roster.spec.ts`, `activities.spec.ts`,
`office.spec.ts`, `pipeline.spec.ts` (all under `tests/browser/`). Only the roster
spec was run for this implementation; full visual validation belongs to QA.

Implementation checks:

- `npx tsx --test tests/studio-viewport.test.ts tests/ghost-renderer.test.ts`: 3 passed.
- `npm run build`: TypeScript check and Vite build passed.
- `npm test`: 131 passed, full unit/integration suite (no repository CI workflow).
- `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost OFFICE_TEST_PORT=4399 npx playwright test tests/browser/roster.spec.ts --reporter=line`: 1 passed.
- Production demo start on port 4400; `GET /health` and `GET /`: HTTP 200
  with localhost excluded from the environment HTTP proxy.
- No lint script is defined.
