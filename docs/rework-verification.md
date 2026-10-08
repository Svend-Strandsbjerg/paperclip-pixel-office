# DEV-84 implementation verification

Base: origin/main at 875abb69965cf30c8b1c9bc2d361ecaf12c0c8c3
(identity/pixel-art PR #8 merged). Branch: dev-84-qa-rework.

## Evidence and limits

Inspected the real company issue list read-only on 2026-10-08. It exposes id,
identifier, parentId, assigneeAgentId, createdAt, completedAt, status, description,
and descriptionTruncated. Real completed child tasks have creation/completion
timestamps. It exposes no reliable assignment timestamp. No comments or runtime
status are used to infer a QA verdict. No organic rework event was observed live
during this verification and no tasks were manipulated to create activity.

Controlled HTTP fixtures matching those fields exercise the production Node
server, real bridge, browser polling, shared queue and actual renderer. They
are controlled verification, not evidence of a naturally occurring QA rejection.

## Coverage

- Ordered sibling Developer → completed QA → newly created Developer; no title
  or comment verdict heuristic. Missing ordering evidence is conservative.
- Reviewer requires both completed Developer and QA siblings. Reviewer returns
  are excluded from rework classification.
- Multiple new tasks trigger once each; original task, edits, status changes,
  removal/reappearance, startup, reload and outage recovery remain silent.
- Exact SHA labels, invalid competing labels, no inherited sibling SHA.
- Shared bounded sequential queue, expiry, hidden tabs, same fixed desk route,
  reduced motion and independent runtime activity.
- Deterministic demo rework and production HTTP rework with/without SHA at 320px.
- Existing activity, identity/art, happy paths, server health and read-only bridge.

## Commands

- npm test — complete unit/integration suite.
- npm run build — TypeScript check plus production Vite build.
- npm run test:browser — complete Chromium suite, explicitly requested by DEV-84.
- git diff --check.

The package does not define a separate lint command. Browser QA and Reviewer
still own their independent exact-SHA gates. This change does not merge or deploy.

## Final results (2026-10-08)

- 52/52 unit/integration tests passed.
- Production build and TypeScript check passed; no separate lint script exists.
- Complete Chromium suite: 22/22 passed with
  `npm run test:browser -- --workers=2` (2.9 minutes).
- Production `npm run start` HTTP fixture test passed: health, polling, initial/QA/
  Reviewer/rework routes, rework with and without SHA, removal/reappearance,
  recovery/reload silence, identity retention, 320px reduced motion and GET-only
  upstream access. This is the runtime smoke evidence.
- `git diff --check` passed.

Chromium's standard binary was installed into the runtime cache before verification.
Two new movement assertions were corrected to wait for bubble visibility rather
than merely text content, since text is prepared during outbound travel.
