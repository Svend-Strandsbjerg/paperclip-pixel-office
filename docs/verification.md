# Developer verification — DEV-28

Date: 2026-10-06. Implementation branch: `DEV-26-establish-the-initial-paperclip-pixel-office-foundation`. Repository: `Svend-Strandsbjerg/paperclip-pixel-office`. GitHub default branch confirmed with `gh repo view ... --json defaultBranchRef,url`: `main`.

## Workspace preflight

Paperclip `currentExecutionWorkspace` ID `420aecc0-9f28-49e4-abf6-81a84535ca60` identifies the expected repository, project workspace `e5e5b3e2-5220-41d4-89d5-2c795d72af23`, isolated_workspace mode, git_worktree strategy and assigned non-main branch. `git worktree list --porcelain` confirms the registered linked worktree. `baseRef` is `origin/main`; both `main` and `origin/main` resolve to baseline `bcf57a0121761a42d775064caf680d1f1e4159cc`. No branch/worktree was recreated or repointed.

## Executed checks

| Command/check | Result |
| --- | --- |
| `npm install --save-dev vite typescript tsx @playwright/test @types/node` | Installed; package lock recorded; npm reported zero vulnerabilities. |
| `npm test` | PASS: 6 tests, 0 failures. Exact role identities/locations, state mapping, safe defaults, immutable registry, demos, sprite changes and reduced motion. |
| `npm run build` | PASS: TypeScript check and Vite production bundle. No runtime package dependencies. |
| `git diff --check` | PASS. |
| `npx playwright install chromium` | Chromium and headless shell downloaded; exited 0. Some optional FFmpeg download mirrors returned network policy 403 responses before the installer completed. |
| `npm run test:browser` | BLOCKED before browser assertions. Preview URL preflight receives HTTP 403 and reports the URL as already used, both on initial 4173 and final 4288. |
| `npm run preview -- --port 4288 --strictPort` | Vite starts successfully and reports `http://127.0.0.1:4288/`. |
| `curl -i http://127.0.0.1:4288/` while preview runs | HTTP 403; JSON error code `network_target_denied`, message `Network target denied by Paperclip sandbox policy.` |
| Local bind diagnostic on 4288 before starting Vite | Bind succeeded: this was not a real port collision. |

## Runtime limitation and required action

The runtime provides HTTP proxy bindings and empty `NO_PROXY`/`no_proxy`; requests to the local preview are rejected by Paperclip's network policy. We did not alter those bindings, bypass the proxy, disable security controls, or allow additional destinations. The started preview process was stopped after collecting evidence.

**Unblock owner: Paperclip runtime/operator, coordinated by the Orchestrator.** Provide an approved browser-accessible loopback preview route for this assigned workspace (currently `127.0.0.1:4288`), then resume Developer to run `npm run build` and `npm run test:browser`. If the approved route changes, update the test base URL and server command to that route. No replacement branch or worktree is needed.

No successful browser rendering, screenshot, reload test, visual inspection, browser-console check or responsive verification is claimed. The tests for those checks are committed but cannot yet execute in this runtime. The PR is an implementation draft pending required runtime verification; DEV-28 must remain blocked, not done. The exact pushed PR head SHA is recorded in the issue/PR handoff rather than self-referenced in this source file.
