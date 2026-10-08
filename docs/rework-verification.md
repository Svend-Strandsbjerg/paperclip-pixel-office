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

## DEV-87 correction (2026-10-08)

The correction restores QA/Reviewer SHA extraction from available issue-list
text even when `descriptionTruncated` is true. Only rework descriptions retain
truncation suppression. Conflicting or invalid recognized labels in available
text still suppress every role's SHA; unseen truncated text cannot be checked.
The explicit assignment label `Required exact SHA to review:` joins the allowlist;
arbitrary prose remains unsupported. Sibling QA tasks with missing, invalid or
non-string creation times now prevent rework classification, matching the
conservative Reviewer ordering guard. No application writes, credentials, real
private identifiers or raw private content were added; rendering and queue code
are unchanged.

Recovery of prior local commit 93dd144865bb7ed6512b92bf2c7fc6f3c35dab46 failed:
the accessible filesystem contained only the current repository object store,
which lacked that object, and GitHub rejected fetching it as `not our ref`.
The scoped correction was recreated on the existing dev-84-qa-rework branch.

Current correction verification is incomplete due to runtime dependencies:

- Focused handoff tests: 22/22 passed using Node 24 native TypeScript execution
  with a temporary extension-resolution hook outside the repository.
- Full-suite fallback attempt: 41 passed, 6 failed. Two test modules require
  tsx's JavaScript-to-TypeScript import resolution; four production server tests
  require the unavailable frontend build. This is not a complete suite pass.
- `npm ci` could not download packages: registry.npmjs.org returned HTTP 403
  through the configured network path. No installed dependency copy was found.
- Production build/TypeScript and Chromium commands were attempted but could not
  launch: `tsc: not found` and `playwright: not found`.
- Production Node startup was attempted and correctly refused readiness without
  built frontend assets. A successful production `/health` smoke is outstanding.
- `git diff --check` passed.

Runtime operator must restore permitted npm package downloads and the standard
Playwright Chromium binary. Developer must then run npm ci, npm test, npm run
build, the full Chromium suite and production Node health smoke before this
correction is ready for downstream QA/Reviewer gates. Earlier successful results
above apply to the prior implementation, not this correction. Current focused
coverage uses controlled fixtures; no organic QA rejection is claimed.
