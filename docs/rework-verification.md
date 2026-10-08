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

## Current verification (DEV-95, 2026-10-08)

The earlier dependency/download blockage is resolved: `npm ci` succeeds and the
existing shared Playwright browser cache contains Chromium. No Paperclip
infrastructure or configuration changes were needed. The current implementation
passes 59/59 unit/integration tests and the production build/TypeScript check.
There is no separate lint script. Production `npm run start` returns HTTP 200
with `{"status":"ok"}` from `/health`.

Final committed-head validation runs `npm ci`, `npm run build`, `npm test`,
`git diff --check`, the complete Chromium suite with
`npm run test:browser -- --workers=2`, and a production health smoke. Exact final
SHA and final results are recorded in PR #9 and the DEV-95 task handoff. Local
application checks use subprocess-local `NO_PROXY=127.0.0.1,localhost` and
`no_proxy=127.0.0.1,localhost`; the browser suite uses the existing runtime-provided
`PLAYWRIGHT_BROWSERS_PATH` without installing another browser.

## Corrections covered

QA/Reviewer SHA extraction uses available issue-list text even when
`descriptionTruncated` is true. Only rework descriptions retain truncation
suppression. Conflicting or invalid recognized labels in available text still
suppress every role's SHA; unseen truncated text cannot be checked. The explicit
assignment label `Required exact SHA to review:` is allowlisted; arbitrary prose
remains unsupported.

A competing Browser QA sibling now blocks a candidate rework chain when its
creation time is missing, invalid, non-string, equal to either the candidate QA
or new Developer creation time, or between those times. Only siblings provably
older than the candidate QA or later than the Developer are harmless. The
candidate QA itself is excluded from the competing-sibling check. Reviewer-return
exclusion remains unchanged. No comments, status text, runtime activity, or
`updatedAt` are used to infer ordering.

Five focused regressions cover both equal-time boundaries, the interval between
them, and both harmless outside orderings across task statuses and input orders.
Existing malformed timestamp and Reviewer exclusion tests remain in place.
Controlled HTTP/browser fixtures are not evidence of an organic live QA rejection.
Independent Browser QA, Reviewer, and human merge gates remain Orchestrator-owned;
any new push invalidates earlier downstream approvals.
