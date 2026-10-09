# Ambient movement and result delivery

Idle ghosts take small identity-phased excursions (up to 8 horizontal and 3 vertical pixels) in the open space in front of their own desks. Working ghosts settle at their workstation. A handoff cancels ambient offsets; wandering resumes no sooner than eight seconds after delivery ends. All movement uses the existing shared frame clock.

The read-only issue bridge exposes a minimal `completions` projection for roster members whose child issue belongs to the configured Orchestrator. Only an observed lifecycle transition from open work to `done` emits a result courier. Idle activity, title/description text, disappearance, cancellation, initial load, and reconnect hydration do not trigger returns. Existing completions do not replay, including reopened tasks. Issue-read outages and full/truncated pages reset the observation baseline. Future roster members use the same projection and expanded-office routes without another role mapping.

Assignment and result couriers carry a small document until delivery, pause by the recipient, and return home empty. Reduced motion keeps ghosts stationary with a document and readable delivery message; it disables ambient movement and hover/tilt. Existing assignment qualification, exact-SHA extraction, pipeline projection, and avatar artwork remain unchanged. The existing bounded queue keeps recent events rather than replaying a backlog.

Verification for DEV-143:

- Full unit/integration suite: 96 passed; includes existing exact-SHA, pipeline, read-only HTTP, identity and roster tests.
- TypeScript and production build: `npm run build` passed. No lint script or CI workflow is configured.
- Runtime: `OFFICE_MODE=demo HOST=127.0.0.1 PORT=4291 npm start`; `/api/office-state` returned HTTP 200 with a valid demo snapshot.
- New deterministic fixtures: `tests/ambient.test.ts`, `tests/returns.test.ts`; integrated lifecycle polling and courier/document rendering in `tests/polling.test.ts` and `tests/ghost-renderer.test.ts`.
- Relevant existing browser specs: `tests/browser/office.spec.ts`, `tests/browser/roster.spec.ts`, `tests/browser/pipeline.spec.ts`. No browser suite run for this implementation handoff.

For QA, use the existing demo assignment controls for outbound delivery. Result delivery requires a live/mocked snapshot first showing an eligible open child and then the same child's authoritative `done` status; demo idle toggles deliberately do not synthesize results. No login is needed in demo mode. Fixtures cover Developer, Browser QA, Reviewer, and a future agent.
