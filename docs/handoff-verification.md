# DEV-36 implementation verification

The implementation is limited to Orchestrator → Developer handoffs. The bridge remains GET-only and the browser receives no credentials or internal issue/agent IDs.

Commands executed:

- `npm ci`: passed, 26 packages audited, no vulnerabilities.
- `npm test`: passed, 17 unit tests. Includes issue qualification, exact event payload, hydration, creation/assignment transitions, deduplication, outage recovery, route endpoints and agent-state failure isolation.
- `npm run build`: passed TypeScript checking and Vite production build.
- `npx playwright install chromium`: installed Chromium after the first browser attempt reported a missing executable. Two FFmpeg mirrors were denied by runtime network policy; Playwright's normal fallback mirror succeeded without policy changes.
- `npm run test:browser`: passed 6 Chromium tests, including production startup, responsive layout, activity regression, outbound → bubble → return, live-response transition/deduplication, reload and issue-read failure recovery. The last run includes an assertion that the task bubble does not cover the Developer label.
- `git diff --check`: passed.

## Read-only real integration

Executed `NODE_USE_ENV_PROXY=1 node --input-type=module` with a runtime smoke script that:

1. Read the company's agents and used their persistent IDs for the four configured roles (credentials remained in the environment).
2. Spawned `npm run preview -- --port 4289 --strictPort` with `OFFICE_MODE=live` and the explicit `PAPERCLIP_AGENT_ROLES` mapping.
3. Fetched `/api/office-state`, asserting live mode, inclusion of real task **DEV-36**, Developer `working`, and task payload keys limited to `taskId,title`.
4. Launched Playwright Chromium against port 4289, waited for `LIVE · CONNECTED`, observed polling, asserted Developer working and `data-handoff=rest`, then reloaded and rechecked quiet hydration.
5. Asserted zero console errors, page errors and failed network requests; closed the browser and preview process.

Result: passed. Real Paperclip issue reads confirmed DEV-36 is a Developer child of DEV-35. This existing assignment was correctly treated as historical hydration.

A newly created/reassigned real delegation was **not** verified end to end: no independent Orchestrator assignment occurred while observing, and no task creation/reassignment was performed for testing. Controlled browser responses verify the new-delegation → animation → bounded text → return sequence, while real reads verify bridge compatibility, correct identity/state and reload behavior. The application never writes to Paperclip.

Screenshots are generated in ignored `test-results/`; they are local verification artifacts, not committed source. Final PR number and exact head SHA are recorded in the DEV-36 task comment and pull-request work product after push.

## DEV-39 reviewer fixes

- Task-bubble text is assigned once when each event becomes active. A Chromium MutationObserver regression measures zero child/text mutations across 30 animation frames while the status bubble is visible.
- Issue reads explicitly request `limit=1000`. The real Paperclip endpoint accepted this bound; invalid-limit validation reported a maximum of 1000. A full page is conservatively unavailable (`tasks: null`), avoiding incomplete parent/child comparisons. Server warnings distinguish request/timeouts, HTTP status, invalid responses and the reached limit without including raw errors or issue contents. Agent activity remains available.
- `npm test`: 18 passed, including parent/child selection beyond a simulated default page and safe diagnostics/failure isolation for transport, HTTP, JSON, schema and full-page failures.
- `npm run build`: TypeScript and Vite production build passed.
- `PLAYWRIGHT_BROWSERS_PATH=/srv/agent-platform/playwright-browsers npm run test:browser`: all 6 Chromium tests passed, including the live-region mutation regression and existing animation/live-state behavior.
- `git diff --check`: passed.
- Real integration: `NODE_USE_ENV_PROXY=1 node --import tsx --input-type=module` started the actual middleware on an ephemeral loopback HTTP server using runtime credentials and persistent role IDs obtained from company agents. Verified upstream methods were GET, issue query was exactly `limit=1000`, the response selected real DEV-39, all four agent states were present, and task fields were limited to `taskId,title`. No test task or assignment was created. This verifies real reads; new live delegation animation remains covered by controlled Chromium responses.

The new exact PR head is recorded on DEV-39 and its pull-request work product after push. Earlier review/Browser QA approvals do not apply to the new commit; the parent Orchestrator owns fresh gates.

## DEV-42 second-round reviewer fixes

- The renderer now keeps at most two waiting handoffs plus one active handoff. Overflow retains the newest waiting events; events waiting 12 seconds expire. Active duration uses the monotonic clock instead of accumulated animation delta, so a suspended frame loop cannot prolong stale work. Visibility changes clear active/waiting events and hidden intake is dropped. The tracker still observes IDs, preventing replay of dropped events.
- Reduced motion displays only the task bubble for three seconds and leaves all characters at their permanent desks. Chromium actually triggers a handoff and compares canvas pixels before, throughout, and after it.
- Related notes addressed: dedup storage caps at 10,000 distinct identifiers and then stays silent until reload (no eviction/replay); malformed issue items are skipped individually; sanitized empty titles use `Untitled task`; sequential agent/issue timeouts are 2.5/4 seconds within the client’s 7-second budget; phase/visibility DOM attributes are written only when changed.
- `npm test`: 23 passed, including bounded burst intake, sequential presentation, stale waiting/active work, queue clearing, dedup saturation, malformed individual items, blank titles, and a delayed issue read beyond the former 1.5-second timeout.
- `npm run build`: TypeScript and Vite production build passed.
- `PLAYWRIGHT_BROWSERS_PATH=/srv/agent-platform/playwright-browsers npm run test:browser`: all 9 Chromium tests passed. Five live tasks in one poll retain the final two and finish in roughly 22 seconds of animation, with repeated polls remaining silent. Hidden intake and a 60-second monotonic-clock gap both discard stale work; fresh events after visibility restoration still work.
- Background coverage limitation: headless Chromium does not reliably hide tabs on focus changes. The test controls `document.hidden`, dispatches the actual visibility event, and verifies the production listener while polling continues. Separately, it advances the monotonic clock to exercise frame-suspension expiry. This does not claim OS-level tab suspension was reproduced.
- Real read-only integration: the actual middleware, using runtime credentials and persistent configured role IDs, returned real DEV-42, four agent states and only `taskId,title` task payload fields. Both upstream requests were GET and the issue request used `limit=1000`. No tasks or assignments were created for testing. Newly created real delegation animation remains covered by controlled browser responses, not a newly observed real assignment.
- `git diff --check`: passed. Exact final PR head is recorded in the DEV-42 comment and pull-request work product after push. Earlier DEV-40/DEV-41 gates are invalidated; the parent Orchestrator owns fresh gates.

## DEV-64: Developer completion → Browser QA

Implementation reuses the existing tracker, bounded queue, animation timing and renderer. The read-only issue snapshot qualifies a Browser QA child only under a configured Orchestrator parent with a completed Developer sibling. Agent idle/working does not participate in qualification. Destination and public task identifier form the dedup key. Browser QA stays at its permanent desk and its activity remains controlled by the agent endpoint.

The server extracts only unambiguous full SHA values from the QA description's explicit exact-target labels, as documented in README. No GitHub query or additional Paperclip endpoint was introduced. Unsupported or absent SHA formats show identifier/title without a hash. One real snapshot contained 10 qualifying historical QA tasks, of which 4 used recognized exact-target labels; the remaining 6 safely omitted SHA.

Verification:

- `npm ci`: passed, no vulnerabilities.
- `npm run build`: TypeScript and production Vite build passed.
- `npm test`: all 40 unit/integration tests passed. Includes sibling qualification, absent/unrelated/completed Developer cases, SHA provenance/ambiguity, parser bounds, destination routes and sequential queue, dedup/reload/recovery, server startup and unchanged health.
- Chromium uses the production Node server, including a controlled HTTP Paperclip upstream. Coverage includes historical QA hydration, Developer handoff regression, a fresh QA task, full outbound/bubble/return, authoritative SHA text, initially idle QA changing only on agent runtime status, repeated-poll silence, issue-only failure with live activity retained, a missed QA task hydrating silently on recovery, reload, GET-only access and browser credential/identity containment.
- Demo QA tests verify mobile bounds and static canvas under reduced motion, and compare canvas pixels before/at the QA destination/after returning. Screenshots were visually inspected for readable task text and the Orchestrator beside Browser QA.
- Real read-only runtime: launched `createOfficeServer` on an ephemeral loopback port with runtime credentials and four persistent IDs discovered from the company agents endpoint. `/health` returned exactly `{"status":"ok"}`; `/api/office-state` returned four roles, current DEV-64 and historical QA tasks with only allowlisted visual fields. Real Chromium connected, polled, and reloaded silently with zero console/page errors.
- No fresh organic QA assignment occurred during that observation. Fresh transition verification therefore uses controlled upstream HTTP responses through `npm run start` → bridge → polling → renderer, rather than claiming an organically observed delegation. No tasks or assignments were created for testing.

The initial Chromium run was terminated with exit 143 after 11 passing tests and before the production test finished. Its test-owned servers were stopped, and the complete suite was rerun with two workers. No production deployment or sandbox configuration was changed. The complete two-worker rerun passed all 12 Chromium tests in 1.7 minutes. `git diff --check` passed. Exact PR head is recorded on DEV-64 and its pull-request work product.

## DEV-66: narrow-screen long-title desk-label overlap

At widths up to 600px, handoff bubbles now occupy a content-sized grid row above the canvas. The canvas and its permanent label overlay share the next row, so wrapped text cannot cover any desk identity. Desktop positioning and the shared handoff engine are unchanged. The row appears only while the bubble is visible.

Four new Chromium cases trigger fresh live-response handoffs at 320×740 with an 80-character wide-glyph title, covering Developer and Browser QA in normal and reduced motion. They check every label for rectangle separation (including the bubble shadow), horizontal containment, no page overflow, and eventual return to rest. QA covers omitted and present SHA. The normal-motion QA regression failed against the original CSS before the fix. The resulting QA screenshot was visually inspected: the full title and all four desk identities are readable.

An initial complete browser run passed 15 cases; the final Developer reduced-motion fixture was incorrectly supplied a QA-only SHA and was correctly rejected by the payload validator. The fixture was corrected before rerunning the complete suite. No payload validation or handoff logic was changed.

Final verification: `npm test` passed all 40 unit/integration tests; `npm run build` passed TypeScript and the production build; `PLAYWRIGHT_BROWSERS_PATH=/srv/agent-platform/playwright-browsers npm run test:browser -- --workers=2` passed the complete 16-test Chromium suite in 2.2 minutes; `git diff --check` passed. The production Chromium test starts the actual Node server and verifies `/health` returns HTTP 200 with exactly `{"status":"ok"}`, alongside both routes, GET-only bridge access, outage/recovery, and reload. Fresh handoffs use controlled upstream responses; no organic Paperclip delegation or deployment is claimed. Final PR head is recorded on DEV-66 and PR #6 after push.
