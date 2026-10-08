# Delivery pipeline overview

The compact rail below the office is durable state. Character handoffs still use the existing independent event tracker, identities, appearance mapping and bounded queue. All selected deliveries are shown in identifier order, without assigning priority. The rail has no animation or mutation controls.

## Selection based on inspected live data

On 2026-10-08, real company issue lists and DEV-95/96/97/101 detail/work-product endpoints were inspected. The reliable relationship is a nonterminal (`todo`, `in_progress`, `in_review`, `blocked`) issue assigned to the configured Orchestrator, with a direct Developer child in the same project. Direct same-project specialist assignments supply stages. Parent ownership, not root depth, matters: DEV-101 qualifies; DEV-89 has no direct Developer work, while its nested DEV-90 delivery does. Infrastructure work without Developer children is excluded. Completed/cancelled parents are excluded. No agent running state, title keywords, comments or latest-updated ordering participates.

Within a role, creation timestamps identify the latest cycle. Missing or equal timestamps, unfinished earlier tasks, overlapping cycles and downstream creation before upstream completion cannot produce valid gates. A completed predecessor must strictly precede the downstream task. A new Developer after completed QA and its earlier Developer is rework only without competing QA or Reviewer evidence in that return interval, matching the existing conservative handoff principles. Historical downstream SHAs remain visible when GitHub reports a changed head. Cancelled tasks do not qualify as gates.

## Evidence boundary and legacy limitation

Live pull-request work products already supply `type: pull_request`, `provider: github`, `issueId`, and a canonical GitHub PR `url`. Products are read only for the selected parents and direct children. Every member's read must succeed and all PR products must identify the same PR before GitHub is queried. Missing or conflicting identity fails closed.

The sampled DEV-95 PR product had `metadata: null`; DEV-96 had an attachment product and DEV-97 no work product. A `done` Reviewer issue is not a safe approval: rejected reviews are also completed tasks. Descriptions and product summaries are deliberately not parsed for pipeline evidence. Legacy deliveries therefore display unknown/SHA unavailable rather than fabricated readiness. The existing handoff assignment-label parser remains unchanged and is not reused as proof of completed gates.

The pipeline can consume this optional structured evidence on each specialist's own PR product:

```json
{
  "type": "pull_request",
  "provider": "github",
  "issueId": "the-specialist-issue-id",
  "url": "https://github.com/owner/repository/pull/123",
  "metadata": { "delivery": { "sha": "40-lowercase-hex-characters", "outcome": "passed" } }
}
```

`sha` means delivered for Developer, actually tested for QA, and actually reviewed for Reviewer. QA and Reviewer additionally require explicit `outcome: passed`. All PR products on the selected task must agree and contain the evidence; no latest-product guessing occurs. This is an optional consumer contract, not a change to Paperclip orchestration or an assertion that historical records contain it. Orchestration owners can adopt structured result metadata in a later task. Developer completion needs a delivered SHA but not a verdict. Missing evidence stays unknown.

Readiness requires the three completed, ordered gates and exact equality with GitHub's current 40-character head, on an open PR. Changed head invalidates historic SHA evidence. GitHub-confirmed merged status may be displayed for a still-active parent independently of automated evidence; a closed unmerged PR never becomes ready. Human merge remains an external action.

## Reads, failure and privacy

Optional `OFFICE_GITHUB_TOKEN` is a server-only read token. Public repositories work without it. GitHub requests are exclusively GET to `https://api.github.com/repos/{owner}/{repo}/pulls/{number}`, with a validated canonical PR identity, 1.5-second timeout, and redirects rejected. Response PR number, URL and base repository must match. Tokens and raw responses never enter browser payloads; branch names and public issue labels are bounded text rendered with `textContent`.

Paperclip work-product reads use a four-worker pool and a shared 1.5-second deadline. Combined with the existing 2.5-second agent and 4-second issue budgets plus GitHub's 1.5 seconds, the browser timeout is 11 seconds. Polling remains serial with a 1.5-second delay. There is no GitHub browser polling and no stale GitHub cache. Derivation occurs on the server. Issue failure returns a null pipeline alongside retained fresh agent activity. Browser transport failure visibly clears the rail until a fresh snapshot arrives. GitHub failure returns neutral pipeline evidence without disabling agent activity or task handoffs. Full-page issue lists remain fail-closed at the existing 1000 issue limit.

Demo uses one clearly illustrative ready chain, with no upstream calls. Pipeline updates do not enter the character event queue. Browser parsing projects allowlisted fields and rejects inconsistent ready payloads without disabling the office.

## Verification scope

Run `npm run build` before `npm test`, because production integration tests exercise built assets. The build includes TypeScript checking; there is no separate lint script. Focused pipeline tests cover ordered progression, matching SHA readiness, changed head, rework, missing/conflicting evidence, missing dates, unrelated projects/parents, read failures, URL validation, GET-only privacy boundaries, browser payload projection and polling without replay. Existing non-browser suites cover office activity, identity, all handoffs/queues and production lifecycle/security. Developer browser smoke is limited to `tests/browser/pipeline.spec.ts`; full responsive, visual and browser regression verification belongs to independent Browser QA.

Implementation validation (2026-10-08):

- `npm ci`: passed, 25 packages, zero audit vulnerabilities.
- `npm run build`: passed TypeScript and Vite production build.
- `npm test`: 73/73 passed, zero skipped (all existing and new non-browser suites).
- `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npm run test:browser -- tests/browser/pipeline.spec.ts --workers=1`: 1/1 passed; only the pipeline smoke was run by Developer.
- Production server live smoke through `createOfficeServer`, with runtime Paperclip credentials/role mapping and server-only GitHub token: `/health` and `/api/office-state` both 200; mode live; 60 mapped handoff tasks; DEV-101 Developer active and downstream waiting; historical active parents exposed GitHub-confirmed merged PRs with unknown legacy SHA gates. Payload checked against runtime credential values: no leakage. Server shut down cleanly.
- Demo production runtime, live controlled HTTP reads, issue/GitHub outages, privacy/GET-only guarantees, polling/recovery without handoff replay, existing handoff/rework queues and CLI shutdown are covered in the passing integration suites.
- `git diff --check`: passed. No lint script is provided.

Initial verification attempts exposed a missing type annotation, a PR URL dot-segment edge case and missing build artifacts for server tests; these were corrected before the passing runs. The first standalone live smoke omitted Node's production proxy flag and failed with `EAI_AGAIN`; repeating with the existing `NODE_USE_ENV_PROXY=1` setting and subprocess-local localhost proxy exclusions passed. No infrastructure configuration was changed. Independent Browser QA and Reviewer validation are not claimed or routed by Developer.
