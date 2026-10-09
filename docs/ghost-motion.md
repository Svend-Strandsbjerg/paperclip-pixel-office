# Ghost movement (DEV-133)

Native artwork remains the existing cached rest image, including during travel. The prior installed-asset investigation in `paperclip-native-avatars.md` found static rest/idle/working poses and a rejected walking pose; no directional contract or directional assets exist in this repository. Small presentation transforms provide direction without mirroring, recoloring, or reconstructing identity.

Each agent ID determines a stable phase, 3.6–5.4 second period, and 1.1–1.8 scene-pixel vertical amplitude. Idle and working agents share continuous hover. Horizontal travel adds a slight lean, shear and compression; vertical travel adds a small pitch, and diagonals combine both. Exponential smoothing settles orientation at route corners, during the task bubble and after returning home. The ground shadow remains anchored. Existing route coordinates, event queues, bubble timing and destination semantics are unchanged.

Reduced motion disables hover and orientation and retains the existing stationary task-bubble handoff. The existing shared animation loop drives all agents. Motion entries are pruned on roster updates; furniture is built on state updates and canvas dimensions change only when necessary. Images use the existing cache. No animation timers, per-frame API calls, human frames or layout writes are added.

Validation commands:

- `npx tsx --test --test-reporter=dot tests/ghost-motion.test.ts tests/ghost-renderer.test.ts tests/handoff.test.ts` — 32 passed.
- `npm run build` — TypeScript and production Vite build passed.
- `npx tsx --test --test-reporter=tap tests/*.test.ts` — 90 passed, 0 failed (no CI workflows configured).
- `OFFICE_MODE=demo PORT=4399 npm start` — runtime smoke; GET `/` responds 200.

No lint script is configured. Relevant existing browser specs: `tests/browser/office.spec.ts`, `tests/browser/production.spec.ts`, `tests/browser/roster.spec.ts`; not run as part of implementation. Demo needs no login; use the existing demo controls for handoff destinations and activity. Live agents use the existing environment configuration in `.env.example`. QA should include a narrow viewport and a roster larger than four agents; automated motion coverage includes 40 identities and dynamic insertion/removal.
